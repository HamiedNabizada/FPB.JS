import { system } from 'amlengine-js';

import { newGuid } from './environment';
import { FpbTypes, IdentificationSchema, getElementMetadata } from './types';
import { ElementToSuc, SucToElement, stripAlias, InterfaceToFlow, StateTypes } from './mappings';
import { getRefObjOrDerived } from './references';

const { NumberStyles, ArgumentException, ArgumentNullException, InvalidOperationException } = system;

/**
 * Port of CaexToFpbJson.cs: CAEX 3.0 (AML) to FPB.js JSON.
 *
 * The C# code builds Dictionary<string, object> trees and serializes them
 * with System.Text.Json; here they are plain objects with the same keys in
 * the same order (see serialize at the end for the numbers).
 */

/**
 * Convert. Without `ih` (undefined or null) the one-argument overload: the
 * first InstanceHierarchy, kept for legacy callers. With `ih` that hierarchy,
 * for documents with several independent FPD models.
 * Returns `{ value, warnings }` (ConversionResult<string>).
 */
export function convertCaexToFpbJson(doc, ih) {
  if (ih != null) {
    return convertInstanceHierarchy(doc, ih);
  }
  const caex = doc.caexFile;
  let first = null;
  for (const candidate of caex.instanceHierarchy) {
    first = candidate;
    break;
  }
  if (first == null) {
    throw new InvalidOperationException('No InstanceHierarchy found');
  }
  return convertInstanceHierarchy(doc, first);
}

/**
 * FindFpdInstanceHierarchies: every InstanceHierarchy that holds at least one
 * FPD_Process IE, in document order (one viewer tab per IH in the plugins).
 */
export function findFpdInstanceHierarchies(doc) {
  if (doc?.caexFile == null) {
    return [];
  }
  const processSuc = ElementToSuc.get(FpbTypes.Process);
  const found = [];
  for (const ih of doc.caexFile.instanceHierarchy) {
    for (const ie of ih.internalElement) {
      if (stripAlias(ie.refBaseSystemUnitPath) === processSuc) {
        found.push(ih);
        break;
      }
    }
  }
  return found;
}

/** Convert(doc, ih): one InstanceHierarchy to FPB.js JSON */
function convertInstanceHierarchy(doc, ih) {
  const warnings = [];
  if (ih == null) {
    throw new ArgumentNullException('ih');
  }

  // Collect all FPD_Process InternalElements (flat in IH)
  const allProcessIEs = [];
  for (const ie of ih.internalElement) {
    if (stripAlias(ie.refBaseSystemUnitPath) === ElementToSuc.get(FpbTypes.Process)) {
      allProcessIEs.push(ie);
    }
  }

  if (allProcessIEs.length === 0) {
    throw new InvalidOperationException('No FPD_Process found in InstanceHierarchy');
  }

  // Build refObj lookups
  const processRefObjMap = new Map(); // process AML ID -> parent PO ID
  const poRefObjMap = new Map(); // PO AML ID -> child process AML ID
  const poToProcessAmlId = new Map(); // PO AML ID -> parent process AML ID

  for (const procIE of allProcessIEs) {
    const procRefObj = getRefObjValue(procIE);
    if (procRefObj != null) {
      processRefObjMap.set(dictionaryKey(procIE.id), procRefObj);
    }

    for (const ie of procIE.internalElement) {
      if (stripAlias(ie.refBaseSystemUnitPath) === ElementToSuc.get(FpbTypes.ProcessOperator)) {
        // Brace-free key: refObj/refProcess values are stored without braces,
        // ie.ID carries them; normalize so lookups can't miss.
        poToProcessAmlId.set(normalizeId(ie.id), procIE.id);
        const poRefProcess = getRefProcessValue(ie);
        if (poRefProcess != null) {
          poRefObjMap.set(dictionaryKey(ie.id), poRefProcess);
        }
      }
    }
  }

  // Reverse-lookup fallback: a sub-process SHOULD carry refObj -> parent PO,
  // but externally authored AMLs often only fill refProcess on the PO side.
  // Without this back-fill the hierarchy reads flat with zero warnings.
  for (const procIE of allProcessIEs) {
    if (processRefObjMap.has(dictionaryKey(procIE.id))) {
      continue;
    }
    const procBare = normalizeId(procIE.id);
    let parentPoKey = null;
    for (const [key, value] of poRefObjMap) {
      if (equalsOrdinalIgnoreCase(normalizeId(value), procBare)) {
        parentPoKey = key;
        break;
      }
    }
    if (parentPoKey != null) {
      processRefObjMap.set(procIE.id, normalizeId(parentPoKey));
      warnings.push(`Process '${procIE.name ?? ''}' has no refObj but PO '${parentPoKey}' ` +
        'references it via refProcess — derived the parent link from the reverse direction.');
    }
  }

  // Determine entry process (no refObj, neither explicit nor derived)
  const entryProcess = allProcessIEs.find((p) => !processRefObjMap.has(dictionaryKey(p.id)))
    ?? allProcessIEs[0];

  // Parse all processes
  const processEntries = [];
  const processIdMap = new Map(); // AML ID -> FPB.JS ID
  const amlToFpbId = new Map(); // AML element ID -> FPB.JS ID

  for (const procIE of allProcessIEs) {
    parseProcess(procIE, allProcessIEs, processRefObjMap, poRefObjMap,
      processEntries, processIdMap, amlToFpbId, warnings);
  }

  // Post-processing: resolve cross-process references (built but not read,
  // as in C#)
  const poFpbToChildFpb = new Map();
  for (const entry of processEntries) {
    const ediList = entry.elementDataInformation;
    for (const elem of ediList) {
      if (elem.$type === FpbTypes.ProcessOperator && '_amlId' in elem) {
        const amlId = elem._amlId;
        if (poRefObjMap.has(amlId) && processIdMap.has(poRefObjMap.get(amlId))) {
          poFpbToChildFpb.set(elem.id, processIdMap.get(poRefObjMap.get(amlId)));
        }
      }
    }
  }

  // TWO-PHASE resolution. Phase A finalizes every process id (a sub-process
  // takes its parent PO's FPB id) and updates processIdMap. Phase B resolves
  // parent/entryPoint against the FINAL ids; one pass left grandchild parents
  // pointing at stale ids.

  // Phase A: finalize process ids
  const mintedToAmlKey = new Map();
  for (const [amlKey, minted] of processIdMap) {
    // ToDictionary throws on a duplicate key
    if (mintedToAmlKey.has(minted)) {
      throw new ArgumentException('An item with the same key has already been added. Key: ' + minted);
    }
    mintedToAmlKey.set(minted, amlKey);
  }
  for (const entry of processEntries) {
    const proc = entry.process;
    const idpo = proc.isDecomposedProcessOperator;
    if (typeof idpo === 'string' && idpo) {
      const idpoNorm = normalizeId(idpo);
      const poFpbId = amlToFpbId.has(idpoNorm) ? amlToFpbId.get(idpoNorm) : idpoNorm;
      proc.isDecomposedProcessOperator = poFpbId;

      const oldId = proc.id;
      proc.id = poFpbId;
      if (mintedToAmlKey.has(oldId)) {
        processIdMap.set(mintedToAmlKey.get(oldId), poFpbId);
      }
    }
  }

  // Phase B: resolve parents + per-entry post-processing
  for (const entry of processEntries) {
    const proc = entry.process;

    const poFpbId = proc.isDecomposedProcessOperator;
    if (typeof poFpbId === 'string' && poFpbId) {
      // parent must point at the process CONTAINING the parent PO, not the PO.
      if (poToProcessAmlId.has(poFpbId)
        && processIdMap.has(dictionaryKey(poToProcessAmlId.get(poFpbId)))) {
        proc.parent = processIdMap.get(poToProcessAmlId.get(poFpbId));
      } else {
        // Dangling ref: fall back to the entry process instead of a
        // self-reference (self-parent hard-loops the layer panel).
        const entryId = processIdMap.get(entryProcess.id);
        if (equalsOrdinalIgnoreCase(entryId, proc.id)) {
          // The dangling process IS the entry process (cycle input: every
          // process carries a refObj). Drop the bogus parent link entirely.
          warnings.push(`Process '${proc.id}': parent PO '${poFpbId}' not found and process is the entry process — dropping the decomposition link.`);
          delete proc.isDecomposedProcessOperator;
          delete proc.parent;
        } else {
          warnings.push(`Process '${proc.id}': parent PO '${poFpbId}' not found in any process — parenting to entry process.`);
          proc.parent = entryId;
        }
      }
    }

    // decomposedView on POs
    const ediList = entry.elementDataInformation;
    for (const elem of ediList) {
      if (elem.$type === FpbTypes.ProcessOperator && 'decomposedView' in elem) {
        elem.decomposedView = elem.id;
        delete elem._amlId;
      }
    }

    // consistsOfProcesses
    proc.consistsOfProcesses = ediList
      .filter((e) => 'decomposedView' in e)
      .map((e) => e.decomposedView);
  }

  // Build Project header
  const entryProcessFpbId = processIdMap.get(entryProcess.id);
  const result = [
    {
      $type: FpbTypes.Project,
      name: ih.name ?? 'FPBJS_Project',
      targetNamespace: 'http://www.hsu-ifa.de/fpbjs',
      entryPoint: entryProcessFpbId
    }
  ];
  result.push(...processEntries);

  return { value: serialize(result), warnings };
}

// ==========================================================================
// Process parser
// ==========================================================================

function parseProcess(
  processIE,
  allProcessIEs,
  processRefObjMap,
  poRefObjMap,
  processEntries,
  processIdMap,
  amlToFpbId,
  warnings
) {
  const elementDataInformation = [];
  const elementVisualInformation = [];
  let stateIds = [];
  let poIds = [];
  let elementsContainerIds = [];

  // Interface map for link resolution
  const interfaceMap = new Map();

  // Process SystemLimit first
  let systemLimitId = null;
  let systemLimitIE = null;
  for (const ie of processIE.internalElement) {
    if (stripAlias(ie.refBaseSystemUnitPath) === ElementToSuc.get(FpbTypes.SystemLimit)) {
      systemLimitIE = ie;
      break;
    }
  }

  if (systemLimitIE != null) {
    const slName = parseShortName(systemLimitIE) ?? systemLimitIE.name ?? 'SystemLimit';
    systemLimitId = normalizeId(systemLimitIE.id);
    const slVisual = parseViewInformation(systemLimitIE);

    const slData = {
      $type: FpbTypes.SystemLimit,
      id: systemLimitId,
      elementsContainer: [],
      name: slName
    };
    elementDataInformation.push(slData);

    if (slVisual != null) {
      slVisual.id = systemLimitId;
      slVisual.type = FpbTypes.SystemLimit;
      slVisual.markers = {};
      elementVisualInformation.push(slVisual);
    }
  }

  // Assign process ID: the AML ID (stripped) so round-trips stay stable.
  const processId = normalizeId(processIE.id);
  processIdMap.set(dictionaryKey(processIE.id), processId);

  // Consult the pre-built map, NOT the raw attribute: the map also carries
  // parent links DERIVED from the PO-side refProcess.
  const processRefObj = processRefObjMap.has(dictionaryKey(processIE.id))
    ? processRefObjMap.get(processIE.id)
    : getRefObjValue(processIE);
  const parentPOId = processRefObj;

  // Parse each object IE
  const objectIEs = [];
  for (const ie of processIE.internalElement) {
    const suc = stripAlias(ie.refBaseSystemUnitPath);
    if (suc && SucToElement.has(suc) && suc !== ElementToSuc.get(FpbTypes.Process)) {
      objectIEs.push(ie);
    }
  }

  const elementIdMap = new Map();

  // Valid element IDs (OrdinalIgnoreCase), so a stale refObj pointing at a
  // removed PO does not leak into the JSON.
  const validElementIds = new Set();
  for (const ie of objectIEs) {
    validElementIds.add(ordinalIgnoreCaseKey(normalizeId(ie.id)));
  }

  for (const ie of objectIEs) {
    const sucPath = stripAlias(ie.refBaseSystemUnitPath);
    if (!SucToElement.has(sucPath)) {
      continue;
    }
    const fpbType = SucToElement.get(sucPath);
    if (fpbType === FpbTypes.SystemLimit || fpbType === FpbTypes.Process) {
      continue;
    }

    // Element ID takes the AML ID (stripped) so UpdateInPlace can match later.
    let elemId = normalizeId(ie.id);

    // Boundary-state reunification: a boundary state exists on the parent and
    // the sub-process layer as two IEs with distinct ids, but FPB.JS keeps ONE
    // id across layers. The sub-process copy's refObj points back at that
    // shared id: surface it under that id.
    if (getElementMetadata(fpbType)?.isState ?? false) {
      const sharedRef = getRefObjOrDerived(ie);
      if (sharedRef) {
        elemId = normalizeId(sharedRef);
      }
    }

    const name = parseShortName(ie) ?? ie.name ?? '';

    elementIdMap.set(dictionaryKey(ie.id), elemId);
    amlToFpbId.set(normalizeId(ie.id), elemId);

    // Collect ExternalInterfaces
    for (const extIf of ie.externalInterface) {
      const refClass = stripAlias(extIf.refBaseClassPath);
      if (refClass && InterfaceToFlow.has(refClass)) {
        const info = InterfaceToFlow.get(refClass);
        // InterfaceInfo
        const interfaceInfo = {
          elementId: elemId,
          direction: info.direction,
          flowType: info.flowType,
          portCoordinate: parsePortCoordinate(extIf),
          waypoints: parseWaypoints(extIf)
        };
        interfaceMap.set(dictionaryKey(extIf.id), interfaceInfo);
      }
    }

    // Check decomposition
    let decomposedView = null;
    let amlIdForPostProcess = null;
    if (fpbType === FpbTypes.ProcessOperator) {
      const poRefProcess = getRefProcessValue(ie);
      if (poRefProcess != null) {
        decomposedView = '__pending__';
        amlIdForPostProcess = ie.id;
      }
    }

    const elemData = {
      $type: fpbType,
      id: elemId,
      incoming: [],
      outgoing: [],
      isAssignedTo: [],
      name
    };

    // Identification
    const identification = parseIdentification(ie);
    if (identification != null) {
      elemData.identification = identification;
    }

    // Characteristics
    elemData.characteristics = parseCharacteristics(ie);

    // refObj on states, so consumers of the JSON can tell boundary states
    // (refObj set) from pure child states without deriving it from geometry.
    if (getElementMetadata(fpbType)?.isState ?? false) {
      const refObjValue = getRefObjOrDerived(ie);
      if (refObjValue) {
        const normalisedTarget = normalizeId(refObjValue);
        // Only if the target exists in this IH; dangling refObjs come from
        // POs removed without clearing the back-references.
        if (validElementIds.has(ordinalIgnoreCaseKey(normalisedTarget))) {
          elemData.refObj = normalisedTarget;
        }
      }
    }

    if (decomposedView != null) {
      elemData.decomposedView = decomposedView;
      elemData._amlId = amlIdForPostProcess;
    }

    elementDataInformation.push(elemData);

    // Visual
    const visual = parseViewInformation(ie);
    if (visual != null) {
      visual.id = elemId;
      visual.type = fpbType;
      visual.markers = {};
      elementVisualInformation.push(visual);
    }

    // Behaviour flags from the element metadata registry
    const meta = getElementMetadata(fpbType);
    if (meta == null) {
      // Unknown type: still add to containers (warnings pick up dangling refs)
      elementsContainerIds.push(elemId);
    } else {
      if (!meta.livesOutsideSystemLimit) {
        elementsContainerIds.push(elemId);
      }
      if (meta.isState) {
        stateIds.push(elemId);
      }
      if (fpbType === FpbTypes.ProcessOperator) {
        poIds.push(elemId);
      }
    }
  }

  // Parse InternalLinks -> Flows
  const flowDataMap = new Map();

  for (const link of processIE.internalLink) {
    const sideAId = extractInterfaceId(link.refPartnerSideA);
    const sideBId = extractInterfaceId(link.refPartnerSideB);

    if (!interfaceMap.has(sideAId)) {
      warnings.push(`InternalLink '${link.name ?? ''}' skipped: interface '${sideAId}' not found.`);
      continue;
    }
    const sideA = interfaceMap.get(sideAId);
    if (!interfaceMap.has(sideBId)) {
      warnings.push(`InternalLink '${link.name ?? ''}' skipped: interface '${sideBId}' not found.`);
      continue;
    }
    const sideB = interfaceMap.get(sideBId);

    const outSide = sideA.direction === 'out' ? sideA : sideB;
    const inSide = sideA.direction === 'in' ? sideA : sideB;

    // Flow ID takes the InternalLink ID (stripped) so updates can match.
    // InternalLink IDs are optional: normalizeId then mints a new one.
    const flowId = normalizeId(link.id);
    const flowType = outSide.flowType;

    const flowData = {
      $type: flowType,
      id: flowId,
      sourceRef: outSide.elementId,
      targetRef: inSide.elementId
    };

    if (flowType !== FpbTypes.Flow && flowType !== FpbTypes.Usage) {
      flowData.inTandemWith = [];
    }

    flowDataMap.set(flowId, flowData);

    // Only stored layout is emitted. Links without PortCoordinate/Waypoint_*
    // get no visual entry; FPB.JS arranges whatever lacks layout on import.
    const waypoints = buildWaypoints(outSide, inSide);
    if (waypoints.length >= 2) {
      elementVisualInformation.push({
        id: flowId,
        type: flowType,
        waypoints,
        markers: {}
      });
    }

    // Update element references
    const sourceElem = elementDataInformation.find((e) => e.id === outSide.elementId) ?? null;
    const targetElem = elementDataInformation.find((e) => e.id === inSide.elementId) ?? null;
    if (sourceElem != null) {
      sourceElem.outgoing.push(flowId);
    }
    if (targetElem != null) {
      targetElem.incoming.push(flowId);
    }

    // isAssignedTo
    if (sourceElem != null && StateTypes.has(sourceElem.$type)
      && targetElem != null && targetElem.$type === FpbTypes.ProcessOperator) {
      const list = sourceElem.isAssignedTo;
      if (!list.includes(targetElem.id)) {
        list.push(targetElem.id);
      }
    }
    if (targetElem != null && StateTypes.has(targetElem.$type)
      && sourceElem != null && sourceElem.$type === FpbTypes.ProcessOperator) {
      const list = targetElem.isAssignedTo;
      if (!list.includes(sourceElem.id)) {
        list.push(sourceElem.id);
      }
    }
    if (flowType === FpbTypes.Usage && sourceElem != null && targetElem != null) {
      const srcList = sourceElem.isAssignedTo;
      const tgtList = targetElem.isAssignedTo;
      if (!srcList.includes(targetElem.id)) {
        srcList.push(targetElem.id);
      }
      if (!tgtList.includes(sourceElem.id)) {
        tgtList.push(sourceElem.id);
      }
    }

    // Usage connects to TechnicalResources outside the SystemLimit
    if (flowType !== FpbTypes.Usage) {
      elementsContainerIds.push(flowId);
    }
  }

  // Compute inTandemWith
  const sourceGroups = new Map();
  for (const [flowId, flow] of flowDataMap) {
    if (!('inTandemWith' in flow)) {
      continue;
    }
    const key = flow.sourceRef;
    let group = sourceGroups.get(key);
    if (group === undefined) {
      group = [];
      sourceGroups.set(key, group);
    }
    group.push(flowId);
  }
  for (const group of sourceGroups.values()) {
    if (group.length <= 1) {
      continue;
    }
    for (const flowId of group) {
      flowDataMap.get(flowId).inTandemWith = group.filter((id) => id !== flowId);
    }
  }

  for (const flow of flowDataMap.values()) {
    elementDataInformation.push(flow);
  }

  // Sanity check: every ID in elementsContainer / consistsOfStates /
  // consistsOfProcessOperator MUST exist in elementDataInformation, or FPB.JS
  // crashes on import ("reading 'type'"). Strip references to elements never
  // emitted.
  const emittedIds = new Set(elementDataInformation.map((e) => e.id));

  let strippedCount = 0;
  let beforeCount = elementsContainerIds.length;
  elementsContainerIds = elementsContainerIds.filter((id) => emittedIds.has(id));
  strippedCount += beforeCount - elementsContainerIds.length;

  beforeCount = stateIds.length;
  stateIds = stateIds.filter((id) => emittedIds.has(id));
  strippedCount += beforeCount - stateIds.length;

  beforeCount = poIds.length;
  poIds = poIds.filter((id) => emittedIds.has(id));
  strippedCount += beforeCount - poIds.length;

  if (strippedCount > 0) {
    warnings.push(`Process '${processIE.name ?? ''}': stripped ${String(strippedCount)} dangling element ` +
      'reference(s) (IDs listed in container/states/POs but no matching elementData ' +
      'entry — typically an AML InternalElement whose SUC could not be resolved to ' +
      'an FPD type).');
  }

  // Update SystemLimit's elementsContainer
  if (systemLimitId != null) {
    const sl = elementDataInformation.find((e) => e.id === systemLimitId) ?? null;
    if (sl != null) {
      sl.elementsContainer = elementsContainerIds;
    }
  }

  // Build process entry
  const processEntry = {
    process: {
      $type: FpbTypes.Process,
      id: processId,
      elementsContainer: systemLimitId != null
        ? [systemLimitId].concat(
          elementDataInformation
            .filter((e) => e.$type === FpbTypes.TechnicalResource
              || e.$type === FpbTypes.Usage)
            .map((e) => e.id))
        : [],
      isDecomposedProcessOperator: parentPOId ?? '',
      consistsOfStates: stateIds,
      consistsOfSystemLimit: systemLimitId ?? '',
      consistsOfProcesses: [],
      consistsOfProcessOperator: poIds,
      parent: parentPOId ?? ''
    },
    elementDataInformation,
    elementVisualInformation
  };

  processEntries.push(processEntry);
}

// ==========================================================================
// Attribute parsers
// ==========================================================================

function getRefObjValue(ie) {
  // Through the reference-type abstraction, so documents that use
  // refBaseObj / refDetailObj / refAbstractObj as the decomposition link are
  // recognised; refObj itself still wins when both are present.
  return getRefObjOrDerived(ie);
}

function getRefProcessValue(ie) {
  const attr = ie.attribute.item('refProcess');
  if (attr == null) {
    return null;
  }
  const val = attr.value;
  return !val ? null : val;
}

function parseShortName(ie) {
  const ident = ie.attribute.item(IdentificationSchema.AttributeName);
  if (ident == null) {
    return null;
  }
  const sn = ident.attribute.item(IdentificationSchema.ShortName);
  return !sn?.value ? null : sn.value;
}

function parseIdentification(ie) {
  const ident = ie.attribute.item(IdentificationSchema.AttributeName);
  if (ident == null) {
    return null;
  }

  const result = { $type: FpbTypes.Identification };
  for (const field of IdentificationSchema.Fields) {
    result[field] = ident.attribute.item(field)?.value ?? '';
  }
  return result;
}

function parseCharacteristics(ie) {
  const container = ie.attribute.item('Characteristics');
  if (container == null) {
    return [];
  }

  const characteristics = [];

  // StartsWith without StringComparison is culture-sensitive in C#; for
  // attribute names the ordinal test gives the same result.
  for (const cAttr of container.attribute) {
    if (!cAttr.name.startsWith('Characteristic')) {
      continue;
    }
    const c = {};

    // $type tags are mandatory: FPB.JS skips characteristics without
    // 'fpbch:Characteristics' and dereferences setpointValue.$type.
    c.$type = 'fpbch:Characteristics';

    const cIdent = cAttr.attribute.item('Category');
    if (cIdent != null) {
      c.category = {
        $type: 'fpb:Identification',
        uniqueIdent: cIdent.attribute.item('uniqueIdent')?.value ?? '',
        longName: cIdent.attribute.item('longName')?.value ?? '',
        shortName: cIdent.attribute.item('shortName')?.value ?? '',
        versionNumber: cIdent.attribute.item('versionNumber')?.value ?? '',
        revisionNumber: cIdent.attribute.item('revisionNumber')?.value ?? ''
      };
    }

    const desc = cAttr.attribute.item('DescriptiveElement');
    if (desc != null) {
      const descDict = {
        $type: 'fpbch:DescriptiveElement',
        valueDeterminationProcess: desc.attribute.item('valueDeterminationProcess')?.value ?? '',
        representivity: desc.attribute.item('representivity')?.value ?? '',
        setpointValue: readValueWithUnit(desc.attribute.item('setpointValue')),
        validityLimits: readValidityLimits(desc.attribute.item('validityLimits')),
        actualValues: readActualValues(desc.attribute.item('actualValues'))
      };
      c.descriptiveElement = descDict;
    }

    const rel = cAttr.attribute.item('RelationalElement');
    if (rel != null) {
      c.relationalElement = {
        $type: 'fpbch:RelationalElement',
        view: rel.attribute.item('view')?.value ?? '',
        model: rel.attribute.item('model')?.value ?? '',
        regulationsForRelationalGeneration: rel.attribute.item('regulationsForRelationalGeneration')?.value ?? ''
      };
    }

    characteristics.push(c);
  }

  return characteristics;
}

// setpointValue compound {value, unit} -> {$type, value, unit}. A missing or
// legacy flat attribute gives an empty value object, so FPB.JS'
// setpointValue.$type dereference never hits undefined.
function readValueWithUnit(attr) {
  return {
    $type: 'fpbch:ValueWithUnit',
    value: attr?.attribute.item('value')?.value ?? '',
    unit: attr?.attribute.item('unit')?.value ?? ''
  };
}

function readValidityLimits(attr) {
  const list = [];
  if (attr == null) {
    return list;
  }
  for (const lim of attr.attribute) {
    if (lim.name != null && lim.name.startsWith('validityLimit')) {
      list.push({
        $type: 'fpbch:ValidityLimits',
        limitType: lim.attribute.item('limitType')?.value ?? '',
        from: lim.attribute.item('from')?.value ?? '',
        to: lim.attribute.item('to')?.value ?? ''
      });
    }
  }
  return list;
}

function readActualValues(attr) {
  const list = [];
  if (attr == null) {
    return list;
  }
  for (const av of attr.attribute) {
    if (av.name != null && av.name.startsWith('actualValue')) {
      list.push({
        $type: 'fpbch:ValueWithUnit',
        value: av.attribute.item('value')?.value ?? '',
        unit: av.attribute.item('unit')?.value ?? ''
      });
    }
  }
  return list;
}

function parseViewInformation(ie) {
  const vi = ie.attribute.item('ViewInformation');
  if (vi == null) {
    return null;
  }

  // double.TryParse leaves 0 when it fails
  const pos = vi.attribute.item('position');
  let x = 0;
  let y = 0;
  if (pos != null) {
    x = system.tryParseDouble(pos.attribute.item('x')?.value ?? null, NumberStyles.Any) ?? 0;
    y = system.tryParseDouble(pos.attribute.item('y')?.value ?? null, NumberStyles.Any) ?? 0;
  }

  const width = system.tryParseDouble(vi.attribute.item('width')?.value ?? null, NumberStyles.Any) ?? 0;
  const height = system.tryParseDouble(vi.attribute.item('height')?.value ?? null, NumberStyles.Any) ?? 0;

  if (x === 0 && y === 0 && width === 0 && height === 0) {
    return null;
  }

  return { x, y, width, height };
}

function parsePortCoordinate(extIf) {
  const pcAttr = extIf.attribute.item('PortCoordinate');
  if (pcAttr == null) {
    return null;
  }

  const x = system.tryParseDouble(pcAttr.attribute.item('x')?.value ?? null, NumberStyles.Any);
  if (x === null) {
    return null;
  }
  const y = system.tryParseDouble(pcAttr.attribute.item('y')?.value ?? null, NumberStyles.Any);
  if (y === null) {
    return null;
  }

  return [x, y];
}

function parseWaypoints(extIf) {
  const waypoints = [];

  // StartsWith is culture-sensitive in C# (see parseCharacteristics)
  for (const attr of extIf.attribute) {
    if (!attr.name.startsWith('Waypoint_')) {
      continue;
    }
    const pos = attr.attribute.item('position');
    if (pos == null) {
      continue;
    }

    const x = system.tryParseDouble(pos.attribute.item('x')?.value ?? null, NumberStyles.Any);
    if (x === null) {
      continue;
    }
    const y = system.tryParseDouble(pos.attribute.item('y')?.value ?? null, NumberStyles.Any);
    if (y === null) {
      continue;
    }

    // string.Replace replaces every occurrence
    const indexStr = attr.name.split('Waypoint_').join('');
    const index = system.tryParseInt32(indexStr);
    if (index !== null) {
      waypoints.push({ index, x, y });
    }
  }

  // OrderBy is stable, so is sort
  return waypoints.sort((a, b) => a.index - b.index).map((w) => [w.x, w.y]);
}

function buildWaypoints(outSide, inSide) {
  const waypoints = [];

  if (outSide.portCoordinate != null) {
    waypoints.push({
      original: {
        x: outSide.portCoordinate[0],
        y: outSide.portCoordinate[1]
      },
      x: outSide.portCoordinate[0],
      y: outSide.portCoordinate[1]
    });
  }

  for (const wp of outSide.waypoints) {
    waypoints.push({
      x: wp[0], y: wp[1]
    });
  }

  if (inSide.portCoordinate != null) {
    waypoints.push({
      original: {
        x: inSide.portCoordinate[0],
        y: inSide.portCoordinate[1]
      },
      x: inSide.portCoordinate[0],
      y: inSide.portCoordinate[1]
    });
  }

  return waypoints;
}

/**
 * The ExternalInterface ID of a RefPartnerSide value: CAEX 3.0 writes
 * "InternalElementID:ExternalInterfaceID" or just "ExternalInterfaceID".
 * GUIDs never contain colons, so the separator is unambiguous.
 */
function extractInterfaceId(refPartnerSide) {
  if (!refPartnerSide) {
    return '';
  }
  const colonIdx = refPartnerSide.lastIndexOf(':');
  if (colonIdx < 0) {
    return refPartnerSide;
  }
  return refPartnerSide.substring(colonIdx + 1);
}

// NewId (braced) is ids.js newId; this file does not use it.

/**
 * An AML element ID ("{xxx-yyy}") as the FPB.JS-side ID without braces, so
 * UpdateInPlace can match it back. A null or empty ID gets a fresh GUID,
 * bare: a braced one would make every later UpdateInPlace lookup miss.
 */
function normalizeId(amlId) {
  if (!amlId) {
    return newGuid().toString(); // bare, no braces
  }
  if (amlId.length >= 2 && amlId[0] === '{' && amlId[amlId.length - 1] === '}') {
    return amlId.substring(1, amlId.length - 1);
  }
  return amlId;
}

// ==========================================================================
// C# runtime semantics
// ==========================================================================

/** A Dictionary<string, ...> key: C# throws on null, a Map would take it */
function dictionaryKey(key) {
  if (key == null) {
    throw new ArgumentNullException('key');
  }
  return key;
}

/**
 * The key of StringComparer.OrdinalIgnoreCase: simple (one to one) upper case
 * mapping per code point, never from non-ASCII into ASCII (U+0131, U+017F).
 */
function ordinalIgnoreCaseKey(s) {
  let key = '';
  for (const ch of s) {
    const upper = ch.toUpperCase();
    const simple = upper.length === ch.length
      && (ch.charCodeAt(0) < 0x80 || upper.charCodeAt(0) >= 0x80);
    key += simple ? upper : ch;
  }
  return key;
}

/** string.Equals(a, b, StringComparison.OrdinalIgnoreCase) */
function equalsOrdinalIgnoreCase(a, b) {
  if (a == null || b == null) {
    return a == null && b == null;
  }
  return a.length === b.length && ordinalIgnoreCaseKey(a) === ordinalIgnoreCaseKey(b);
}

const NEGATIVE_ZERO = '\u0000-0';

/**
 * JsonSerializer.Serialize(result, WriteIndented): the same content. Unlike
 * JSON.stringify, System.Text.Json writes -0 as -0 and refuses NaN and the
 * infinities (TryParse with NumberStyles.Any accepts "NaN" and "Infinity").
 * U+0000 cannot occur in AML text (XML forbids it), so it marks -0 safely.
 */
function serialize(value) {
  const text = JSON.stringify(value, (key, v) => {
    if (typeof v !== 'number') {
      return v;
    }
    if (!Number.isFinite(v)) {
      throw new ArgumentException('.NET number values such as positive and negative infinity cannot be written as valid JSON. ' +
        'To make it work when using \'JsonSerializer\', consider specifying \'JsonNumberHandling.AllowNamedFloatingPointLiterals\' ' +
        '(see https://learn.microsoft.com/dotnet/api/system.text.json.serialization.jsonnumberhandling).');
    }
    return Object.is(v, -0) ? NEGATIVE_ZERO : v;
  }, 2);
  return text.split(JSON.stringify(NEGATIVE_ZERO)).join('-0');
}
