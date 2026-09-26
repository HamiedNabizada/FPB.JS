import { CAEXDocument, Guid, InheritanceExtensions, InstanceHierarchyType, InternalElementType, system } from 'amlengine-js';

import { newGuid, utcNow } from './environment';
import { deriveBoundaryStateId, deriveSubProcessId, newId } from './ids';
import { FpbTypes, IdentificationSchema } from './types';
import {
  AttrRefs, ConnectionTypes, ElementToSuc, FlowToInterface, LibNames, ObjectTypes, StateTypes, stripAlias
} from './mappings';
import { MapperTrace } from './options';
import { getRefObjOrDerived } from './references';
import { walkDocumentInternalElements, walkInternalElements } from './walker';
import { ensureLibraries } from './libraries';
import { firstOrAppend } from './diagramInterchange';
import { parseFpbJson } from './models';

/**
 * Port of FpbJsonToCaex.cs: FPB.js JSON to CAEX 3.0. Instances are created
 * with CreateClassInstance, so RoleRequirements and inherited attributes come
 * from the FPD SystemUnitClasses.
 *
 * Every public function takes the JSON text or `{ project, entries }` from
 * `parseFpbJson` (the C# overloads with FpbProject and entries) and returns
 * `{ value, warnings }` (ConversionResult).
 *
 * DeriveSubProcessId, DeriveBoundaryStateId and NewId are in ids.js, the
 * private WalkInternalElements of the C# class is walker.js.
 */

const { ArgumentException, ArgumentNullException, InvalidOperationException } = system;

/** FpbJsonParser.Parse for the string overloads; a parsed model is used as it is */
function parseInput(json) {
  return typeof json === 'string' ? parseFpbJson(json) : json;
}

/** Convert: a new CAEX document with the FPD libraries and one InstanceHierarchy */
export function convertFpbJsonToCaex(json, options = null) {
  const { project, entries } = parseInput(json);

  const doc = CAEXDocument.new_CAEXDocument();
  const caex = doc.caexFile;
  caex.fileName = 'fpb-export.aml';

  const sdi = firstOrAppend(caex.sourceDocumentInformation);
  sdi.originName = 'fpb-aml-mapper';
  sdi.originID = 'fpb-aml-mapper-1.0';
  sdi.originVersion = '0.1.0';
  sdi.lastWritingDateTime = utcNow();

  const warnings = appendInto(doc, project, entries, options);
  return { value: doc, warnings };
}

/**
 * CreateEmptyFpdInstanceHierarchy: a new, empty FPD InstanceHierarchy in an
 * existing document (one FPD_Process with one FPD_SystemLimit), returned so
 * the caller can open it in the editor and fill it from the palette.
 */
export function createEmptyFpdInstanceHierarchy(doc, ihName, processName = 'NewProcess') {
  if (doc == null) {
    throw new ArgumentNullException('doc');
  }
  if (isNullOrWhiteSpace(ihName)) {
    ihName = 'FpdInstanceHierarchy';
  }
  if (isNullOrWhiteSpace(processName)) {
    processName = 'NewProcess';
  }

  ensureLibraries(doc.caexFile);

  const ih = doc.caexFile.instanceHierarchy.append(ihName);

  const sucLib = doc.caexFile.systemUnitClassLib.item(LibNames.SystemUnitClassLib);
  const sucLookup = toDictionary(sucLib.systemUnitClass, (s) => s.name);

  const procIE = createInstance(sucLookup, 'FPD_Process');
  procIE.id = newGuid().toString('B');
  procIE.name = processName;
  ih.insert(procIE);
  setAttrValue(procIE, 'refObj', '');

  const slIE = createInstance(sucLookup, 'FPD_SystemLimit');
  slIE.id = newGuid().toString('B');
  slIE.name = 'SystemLimit_' + processName.replaceAll(' ', '');
  procIE.insert(slIE);

  // Without ViewInformation FPB.js renders the SystemLimit as an invisible
  // 0x0 box; these values give an empty canvas to drop shapes onto.
  setViewInformation(slIE, { id: '', type: '', x: 100, y: 100, width: 600, height: 400, waypoints: [] });

  return ih;
}

/**
 * ImportInto: the FPD structures into an existing document. Ensures the FPD
 * libraries and appends a new InstanceHierarchy; FileName and
 * SourceDocumentInformation stay as they are.
 */
export function importInto(existing, json, options = null) {
  const { project, entries } = parseInput(json);
  const warnings = appendInto(existing, project, entries, options);
  return { value: existing, warnings };
}

/**
 * UpdateInPlace: synchronise the FPD content of an existing document with the
 * JSON. Reuses the FPD InstanceHierarchy (`targetIh`, else the first IH with an
 * FPD_Process) and updates elements in place by matching the FPB.js IDs to the
 * AML IDs. User attributes, links and interfaces on existing elements stay;
 * only FPD-defined attributes are touched. Without an FPD IH a fresh one is
 * appended (ImportInto) with a warning.
 *
 * `targetIh` may be null or undefined (the C# overload without it); options as
 * third argument are accepted as in that overload.
 */
export function updateInPlace(existing, json, targetIh = null, options = null) {
  if (targetIh != null && !(targetIh instanceof InstanceHierarchyType)) {
    options = targetIh;
    targetIh = null;
  }
  const { project, entries } = parseInput(json);

  const warnings = [];
  MapperTrace.info(options, `UpdateInPlace ENTRY: project='${text(project.name)}' entries=${entries.length}`);

  // Snapshot statistics: whether the incoming snapshot is what one expects
  if (options && options.trace) {
    const totalElements = entries.reduce((sum, e) => sum + e.elementData.length, 0);
    const counts = new Map();
    for (const d of entries.flatMap((e) => e.elementData)) {
      counts.set(d.type, (counts.get(d.type) || 0) + 1);
    }
    // OrderBy with the default (culture) string comparer
    const byType = [...counts].sort(([a], [b]) => a.localeCompare(b));
    const perEntry = entries.map((e, i) =>
      `#${i}:${e.process.id.substring(0, Math.min(8, e.process.id.length))} ` +
      `(sub=${e.process.isDecomposedProcessOperator ? 'True' : 'False'}, data=${e.elementData.length}, visual=${e.elementVisual.length})`)
      .join('; ');
    const perType = byType.map(([key, value]) => `${key}=${value}`).join(', ');
    MapperTrace.info(options, `  snapshot stats: totalElements=${totalElements} byType=[${perType}] entries=[${perEntry}]`);
  }

  validate(project, entries, warnings);

  const caex = existing.caexFile;

  // The FPD libraries (no-op when present)
  ensureLibraries(caex, options);

  const fpdIH = targetIh ?? findFpdInstanceHierarchy(caex);
  if (fpdIH == null) {
    warnings.push('No existing FPD InstanceHierarchy found — appending a fresh hierarchy instead.');
    MapperTrace.info(options, 'No FPD IH found — falling back to AppendInto');
    appendInto(existing, project, entries, options);
    return { value: existing, warnings };
  }

  const elementIndex = buildElementIndex(fpdIH, options, warnings);
  const linkIndex = buildInternalLinkIndex(fpdIH);
  MapperTrace.info(options, `Target IH='${text(fpdIH.name)}' elementIndex.size=${elementIndex.size} linkIndex.size=${linkIndex.size}`);

  // SUC lookup for CreateInstance of new IEs
  const sucLib = caex.systemUnitClassLib.item(LibNames.SystemUnitClassLib);
  const sucLookup = toDictionary(sucLib.systemUnitClass, (s) => s.name);

  // FPB.js sends a boundary state under ONE id on the parent and the
  // sub-process layer; in CAEX each copy has its own ID. Translating the
  // sub-process copies up front lets everything below treat them as distinct
  // elements.
  remapSubProcessBoundaryStateIds(entries, elementIndex, options);

  // Every incoming ID, for the orphan removal at the end
  const incomingIds = new IgnoreCaseSet();
  for (const entry of entries) {
    incomingIds.add(entry.process.id);
    for (const d of entry.elementData) {
      incomingIds.add(d.id);
    }
  }

  let updatedCount = 0;
  let addedCount = 0;
  let connectionUpdatedCount = 0;
  let connectionAddedCount = 0;
  let processAddedCount = 0;
  let unmatchedSkippedCount = 0;

  // Two passes: processes and elements first, then connections, so neither
  // the order inside elementData nor the order of the entries matters.
  const procByEntryIndex = new Map();
  const visualByEntryIndex = new Map();

  // -- Pass 1: processes and elements. Top-level entries first: sub-process
  // entries need their parent PO. Stable, as OrderBy.
  const orderedEntries = entries
    .map((e, i) => ({ entry: e, index: i }))
    .sort((a, b) => rank(a.entry) - rank(b.entry));

  for (const { entry, index: entryIndex } of orderedEntries) {
    // GroupBy(Id).ToDictionary(g => g.Key, g => g.First())
    const visualMap = new Map();
    for (const v of entry.elementVisual) {
      if (!visualMap.has(v.id)) {
        visualMap.set(v.id, v);
      }
    }
    visualByEntryIndex.set(entryIndex, visualMap);

    MapperTrace.attempt(options, 'ResolveProcess',
      `entry.process.id='${entry.process.id}' isDecomposedOf='${text(entry.process.isDecomposedProcessOperator)}' elementData.count=${entry.elementData.length}`);
    let procAml = resolveProcessForEntry(fpdIH, entry, elementIndex, options);
    if (procAml == null && entry.process.isDecomposedProcessOperator) {
      MapperTrace.result(options, 'ResolveProcess',
        `no existing AML process for sub-process entry, attempting AddProcess(parentPo='${entry.process.isDecomposedProcessOperator}')`);
      const warningsBefore = warnings.length;
      procAml = addProcess(fpdIH, entry.process, elementIndex, sucLookup, warnings, options);
      if (procAml != null) {
        processAddedCount++;
        elementIndex.set(stripBraces(procAml.id), procAml);
        MapperTrace.result(options, 'AddProcess', `created sub-process id='${text(procAml.id)}' for parent PO '${entry.process.isDecomposedProcessOperator}'`);
      } else {
        const lastWarning = warnings.length > warningsBefore ? warnings[warnings.length - 1] : '(no warning recorded)';
        MapperTrace.result(options, 'AddProcess', `FAILED — ${lastWarning}`);
      }
    } else {
      MapperTrace.result(options, 'ResolveProcess', procAml == null
        ? 'NULL — entry will have unmatched elements'
        : `found AML process '${text(procAml.name)}' id='${text(procAml.id)}'`);
    }
    procByEntryIndex.set(entryIndex, procAml);

    // Elements only; connections follow in pass 2
    for (const data of entry.elementData) {
      if (ConnectionTypes.has(data.type)) {
        continue;
      }

      const ie = elementIndex.get(data.id);
      if (ie !== undefined) {
        MapperTrace.attempt(options, 'UpdateElement', `id='${data.id}' type='${data.type}' name='${data.name}'`);
        updateExistingElement(ie, data, visualMap, elementIndex, options);
        updatedCount++;
        MapperTrace.result(options, 'UpdateElement', 'ok');
        continue;
      }

      if (procAml == null) {
        unmatchedSkippedCount++;
        MapperTrace.result(options, 'ResolveElement', `SKIP — element id='${data.id}' type='${data.type}' has no AML match and no host process to add it under`);
        continue;
      }

      MapperTrace.attempt(options, 'AddElement', `id='${data.id}' type='${data.type}' name='${data.name}' into process='${text(procAml.name)}'`);
      const newIe = addElement(procAml, data, sucLookup, visualMap, options);
      if (newIe != null) {
        addedCount++;
        elementIndex.set(stripBraces(newIe.id), newIe);
        MapperTrace.result(options, 'AddElement', `ok — registered in elementIndex as '${stripBraces(newIe.id)}'`);
      } else {
        warnings.push(`Could not add element '${data.id}' of type '${data.type}' ` +
          `(SUC '${data.type}' missing in library?)`);
        unmatchedSkippedCount++;
        MapperTrace.result(options, 'AddElement', `FAILED — SUC '${data.type}' missing`);
      }
    }
  }

  // -- Pass 2: connections. Every process and element is in elementIndex now.
  // The interface counters span the whole pass, so parallel flows from one
  // element do not collide on ExternalInterface names.
  const ifaceCounters = new Map();
  for (const { entry, index: entryIndex } of orderedEntries) {
    const procAml = procByEntryIndex.get(entryIndex) ?? null;
    const visualMap = visualByEntryIndex.get(entryIndex);

    for (const data of entry.elementData) {
      if (!ConnectionTypes.has(data.type)) {
        continue;
      }

      const link = linkIndex.get(data.id);
      if (link !== undefined) {
        if (linkEndpointsMatch(link, data, elementIndex)) {
          MapperTrace.attempt(options, 'UpdateConnection', `flow id='${data.id}' type='${data.type}' (endpoints unchanged → waypoint refresh)`);
          updateExistingConnection(link, data, visualMap);
          connectionUpdatedCount++;
          MapperTrace.result(options, 'UpdateConnection', 'ok');
        } else {
          MapperTrace.attempt(options, 'RecreateConnection', `flow id='${data.id}' endpoints swapped → drop+readd`);
          link.remove();
          linkIndex.delete(stripBraces(data.id));
          if (procAml != null
            && addConnection(procAml, data, elementIndex, visualMap, warnings, ifaceCounters) != null) {
            connectionAddedCount++;
            MapperTrace.result(options, 'RecreateConnection', 'ok');
          } else {
            warnings.push(`Flow '${data.id}' endpoints changed but could not be recreated.`);
            MapperTrace.result(options, 'RecreateConnection', 'FAILED');
          }
        }
      } else if (procAml != null) {
        MapperTrace.attempt(options, 'AddConnection', `flow id='${data.id}' type='${data.type}' source='${text(data.sourceRef)}' target='${text(data.targetRef)}'`);
        const warningsBefore = warnings.length;
        if (addConnection(procAml, data, elementIndex, visualMap, warnings, ifaceCounters) != null) {
          connectionAddedCount++;
          MapperTrace.result(options, 'AddConnection', 'ok');
        } else {
          const lastWarning = warnings.length > warningsBefore ? warnings[warnings.length - 1] : '(no warning recorded)';
          MapperTrace.result(options, 'AddConnection', `FAILED — ${lastWarning}`);
        }
      } else {
        warnings.push(`Flow '${data.id}' could not be added: no host process resolved.`);
        MapperTrace.result(options, 'AddConnection', `SKIP — no host process for flow id='${data.id}'`);
      }
    }
  }

  // Links from anywhere in the document into what is removed below would
  // point at nothing afterwards (collected before each remove)
  const removedTargets = new RemovedLinkTargets();

  MapperTrace.attempt(options, 'RemoveOrphans', 'FPD elements not in incoming snapshot');
  const removedCount = removeOrphanedFpdElements(fpdIH, elementIndex, incomingIds, removedTargets, options);
  MapperTrace.result(options, 'RemoveOrphans', `removed ${removedCount} element(s)`);

  MapperTrace.attempt(options, 'RemoveOrphans', 'InternalLinks not in incoming snapshot');
  const connectionsRemoved = removeOrphanedConnections(linkIndex, incomingIds);
  MapperTrace.result(options, 'RemoveOrphans', `removed ${connectionsRemoved} link(s)`);

  // Compose: a sub-process whose parent PO no longer comes as a decomposed
  // entry is dropped, and the parent PO's refProcess cleared
  const incomingDecomposedParentPoIds = new IgnoreCaseSet();
  for (const e of entries) {
    if (e.process.isDecomposedProcessOperator) {
      incomingDecomposedParentPoIds.add(e.process.isDecomposedProcessOperator);
    }
  }
  MapperTrace.attempt(options, 'RemoveOrphanSubProcesses', `sub-processes whose parent PO no longer carries decomposedView (${incomingDecomposedParentPoIds.size} kept-alive parent POs)`);
  const processesRemoved = removeOrphanedSubProcesses(fpdIH, incomingDecomposedParentPoIds, elementIndex, removedTargets, options);
  MapperTrace.result(options, 'RemoveOrphanSubProcesses', `removed ${processesRemoved} sub-process(es)`);

  MapperTrace.attempt(options, 'RemoveLinksIntoRemoved', 'InternalLinks anywhere in the document pointing into removed elements');
  const danglingRemoved = removeLinksIntoRemovedElements(existing, removedTargets, warnings);
  MapperTrace.result(options, 'RemoveLinksIntoRemoved', `removed ${danglingRemoved} link(s)`);

  // Boundary-state refObj across the decomposition: UpdateExistingElement and
  // AddElement lack the parent-entry context, so every sub-process state's
  // refObj is re-derived from the snapshot here (as in Convert).
  MapperTrace.attempt(options, 'SyncBoundaryStateRefObjs', 'post-pass re-deriving refObj on every sub-process state from the snapshot');
  const boundarySyncs = syncBoundaryStateRefObjs(entries, elementIndex, options);
  MapperTrace.result(options, 'SyncBoundaryStateRefObjs', `synced refObj on ${boundarySyncs} state(s) across decomposition`);

  // PO name to child process name, after every other update so the loop
  // order cannot undo it
  MapperTrace.attempt(options, 'SyncDecompositionNames', 'post-pass syncing PO name -> child Process name');
  const nameSyncs = syncDecompositionNamesPostPass(elementIndex, warnings, options);
  MapperTrace.result(options, 'SyncDecompositionNames', `synced ${nameSyncs} PO ⇄ sub-process name pair(s)`);

  warnings.push(
    `UpdateInPlace summary: updated=${updatedCount}, added=${addedCount}, ` +
    `connection-waypoints-updated=${connectionUpdatedCount}, ` +
    `connections-added=${connectionAddedCount}, ` +
    `processes-added=${processAddedCount}, ` +
    `sub-processes-removed=${processesRemoved}, ` +
    `removed-element-orphans=${removedCount}, ` +
    `removed-connection-orphans=${connectionsRemoved}, ` +
    `unmatched-skipped=${unmatchedSkippedCount}.`);

  return { value: existing, warnings };
}

/** OrderBy key of pass 1: top-level entries before sub-process entries */
function rank(entry) {
  return entry.process.isDecomposedProcessOperator ? 1 : 0;
}

/**
 * AddElement: a new FPD InternalElement for `data` under `parent`, on the same
 * SUC and instantiation path as BuildProcess; null without a SUC mapping.
 */
function addElement(parent, data, sucLookup, visualMap, options = null) {
  const sucPath = ElementToSuc.get(data.type);
  if (sucPath === undefined) {
    return null;
  }
  const sucName = sucPath.split('/')[1];
  if (!sucLookup.has(sucName)) {
    return null;
  }

  const ie = createInstance(sucLookup, sucName);
  ie.id = wrapBraces(data.id);
  // The fallback of BuildProcess: "ProcessOperator", "Product", ...
  const typeLocalName = data.type.includes(':') ? data.type.split(':')[1] : sucName;
  ie.name = data.name ? data.name : typeLocalName;
  parent.insert(ie);

  setIdentification(ie, data.identification, data.name ?? '', options);
  // No visual data, no ViewInformation, not even for the SystemLimit: FPB.js
  // arranges what lacks layout on import.
  if (visualMap.has(data.id)) {
    setViewInformation(ie, visualMap.get(data.id), options);
  }

  if (data.characteristics != null && data.characteristics.length > 0) {
    setCharacteristics(ie, data.characteristics, options);
  }

  return ie;
}

/**
 * RemoveOrphanedFpdElements: FPD-classed IEs of the IH whose ID is not in the
 * payload. Non-FPD elements stay (FPB.js does not own them), and so do
 * FPD_Process IEs: a sub-process carries its parent PO's ID on the FPB.js
 * side and would always look orphaned. Processes are handled separately.
 */
function removeOrphanedFpdElements(fpdIH, elementIndex, incomingIds, removedTargets, options = null) {
  const fpdSucPaths = new Set(ElementToSuc.values());
  const processSuc = ElementToSuc.get(FpbTypes.Process);

  const toRemove = [];
  for (const [key, ie] of elementIndex) {
    if (incomingIds.has(key)) {
      continue;
    }
    const suc = stripAlias(ie.refBaseSystemUnitPath);
    if (fpdSucPaths.has(suc) && suc !== processSuc) {
      toRemove.push({ key, ie });
    }
  }

  for (const { key, ie } of toRemove) {
    MapperTrace.attempt(options, 'RemoveOrphanElement',
      `id='${text(ie.id)}' name='${text(ie.name)}' type='${text(ie.refBaseSystemUnitPath)}' (no longer in incoming snapshot)`);
    removedTargets.collect(ie);
    ie.remove();
    // Keep elementIndex consistent with the AML tree
    elementIndex.delete(key);
    MapperTrace.result(options, 'RemoveOrphanElement', 'removed + dropped from elementIndex');
  }

  return toRemove.length;
}

/**
 * What InternalLinks may point at inside the elements UpdateInPlace removes:
 * their interfaces by ID (CAEX 3.0, this mapper) and the elements by ID for
 * the "element id:interface name" form (CAEX 2.15, other tools). Each maps to
 * the name of the removed element the user deleted, for the warning.
 */
class RemovedLinkTargets {
  constructor() {
    this._interfaces = new IgnoreCaseMap();
    this._elements = new IgnoreCaseMap();
  }

  get isEmpty() {
    return this._interfaces.size === 0 && this._elements.size === 0;
  }

  /** Record `removed` with everything below it, before it is removed */
  collect(removed) {
    const name = removed.name ?? removed.id ?? '';
    const visitInterface = (iface) => {
      if (iface.id) {
        this._interfaces.set(stripBraces(iface.id), name);
      }
      for (const nested of iface.externalInterface) {
        visitInterface(nested);
      }
    };
    const visit = (ie) => {
      if (ie.id) {
        this._elements.set(stripBraces(ie.id), name);
      }
      for (const iface of ie.externalInterface) {
        visitInterface(iface);
      }
      for (const child of ie.internalElement) {
        visit(child);
      }
    };
    visit(removed);
  }

  /** The removed element a partner side points into, or null */
  target(side) {
    if (!side) {
      return null;
    }
    // An interface ID first: IDs such as "urn:uuid:..." contain colons too
    const byInterface = this._interfaces.get(stripBraces(side));
    if (byInterface !== undefined) {
      return byInterface;
    }
    const colon = side.lastIndexOf(':');
    if (colon > 0) {
      const byElement = this._elements.get(stripBraces(side.substring(0, colon)));
      if (byElement !== undefined) {
        return byElement;
      }
    }
    return null;
  }
}

/**
 * RemoveLinksIntoRemovedElements: every InternalLink in the document that
 * points into an element removed by this update, named in the warnings. Such
 * a link, in a plant hierarchy or drawn by the user, would otherwise point at
 * nothing. Links that were dangling before stay.
 */
function removeLinksIntoRemovedElements(doc, removedTargets, warnings) {
  if (removedTargets.isEmpty) {
    return 0;
  }

  const doomed = [];
  walkDocumentInternalElements(doc, (ie) => {
    for (const link of ie.internalLink) {
      const target = removedTargets.target(link.refPartnerSideA) ?? removedTargets.target(link.refPartnerSideB);
      if (target != null) {
        doomed.push({ link, owner: ie.name ?? ie.id ?? '', target });
      }
    }
  });

  for (const { link, owner, target } of doomed) {
    warnings.push(`Removed link '${text(link.name)}' in '${owner}': it pointed to '${target}', which was deleted.`);
    link.remove();
  }
  return doomed.length;
}

function wrapBraces(id) {
  if (!id) {
    return newGuid().toString('B');
  }
  return (id.length >= 2 && id[0] === '{' && id[id.length - 1] === '}') ? id : '{' + id + '}';
}

/**
 * RemapSubProcessBoundaryStateIds: every sub-process boundary state from its
 * shared FPB.js id to a unique per-layer id (the read side reunites them).
 * Rewriting the sub-process copies (element ids, and the flow endpoints and
 * visuals that reference them) up front lets UpdateInPlace match them in place
 * instead of colliding on the parent copy. Mutates `entries`.
 */
function remapSubProcessBoundaryStateIds(entries, elementIndex, options) {
  // PO id (bare) -> the entry (parent layer) that contains that PO
  const entryByPoId = new IgnoreCaseMap();
  for (const e of entries) {
    for (const d of e.elementData) {
      if (d.type === FpbTypes.ProcessOperator && d.id) {
        entryByPoId.set(stripBraces(d.id), e);
      }
    }
  }

  for (const entry of entries) {
    const parentPoId = entry.process.isDecomposedProcessOperator;
    if (!parentPoId) {
      continue; // not a sub-process
    }

    // The parent layer's state ids, when the parent entry is in the payload.
    // Missing is fine: the elementIndex check below still recognises a
    // boundary state whose parent copy was removed this round.
    let parentStateIds;
    const parentEntry = entryByPoId.get(stripBraces(parentPoId));
    if (parentEntry !== undefined && parentEntry !== entry) {
      parentStateIds = new IgnoreCaseSet(
        parentEntry.elementData.filter((d) => StateTypes.has(d.type)).map((d) => stripBraces(d.id)));
    } else {
      parentStateIds = new IgnoreCaseSet();
    }

    const subProcBare = stripBraces(normalizeId(entry.process.id));

    // First the EXISTING sub-layer copy via its refObj back-link (refObj ==
    // shared id, under this sub-process IE). This works whatever id scheme
    // minted the copy; re-deriving ids only matches files of the derive scheme.
    const existingByShared = new IgnoreCaseMap();
    let subProcIe = null;
    const parentPoIe = elementIndex.get(stripBraces(parentPoId));
    if (parentPoIe !== undefined) {
      const refProc = parentPoIe.attribute.item('refProcess')?.value ?? null;
      if (refProc) {
        subProcIe = elementIndex.get(stripBraces(refProc)) ?? null;
      }
    }
    if (subProcIe != null) {
      for (const child of subProcIe.internalElement) {
        const childRefObj = child.attribute.item('refObj')?.value ?? null;
        if (!childRefObj) {
          continue;
        }
        existingByShared.set(stripBraces(childRefObj), stripBraces(child.id));
      }
    }

    const remap = new IgnoreCaseMap(); // bare shared -> bare per-layer

    for (const d of entry.elementData) {
      if (!StateTypes.has(d.type)) {
        continue;
      }
      const bare = stripBraces(d.id);

      // 1. An existing sub-layer copy found via refObj: reuse ITS id
      const existingBare = existingByShared.get(bare);
      if (existingBare !== undefined) {
        if (!equalsIgnoreCase(existingBare, bare)) {
          remap.set(bare, existingBare);
          d.id = existingBare;
        }
        continue;
      }

      // 2. No existing copy: the derived id (fresh decompose, or the parent
      // copy vanished this round but a derived node survives)
      const derived = stripBraces(deriveBoundaryStateId(bare, subProcBare));
      const isBoundary = parentStateIds.has(bare) || elementIndex.has(derived);
      if (!isBoundary) {
        continue;
      }
      remap.set(bare, derived);
      d.id = derived;
    }
    if (remap.size === 0) {
      continue;
    }

    // Redirect flow endpoints and visuals that pointed at the shared ids
    for (const d of entry.elementData) {
      if (d.sourceRef != null && remap.has(stripBraces(d.sourceRef))) {
        d.sourceRef = remap.get(stripBraces(d.sourceRef));
      }
      if (d.targetRef != null && remap.has(stripBraces(d.targetRef))) {
        d.targetRef = remap.get(stripBraces(d.targetRef));
      }
    }
    for (const v of entry.elementVisual) {
      if (remap.has(stripBraces(v.id))) {
        v.id = remap.get(stripBraces(v.id));
      }
    }

    MapperTrace.info(options,
      `RemapBoundaryStates: sub-process '${entry.process.id}' → ${remap.size} boundary state(s) remapped to deterministic per-layer ids.`);
  }
}

/**
 * ResolveProcessForEntry: the AML process of an entry. A top-level entry's
 * process id is the AML ID; a sub-process entry carries the parent PO's id
 * (CaexToFpbJson convention) and is found through the refObj pointing back at
 * that PO.
 */
function resolveProcessForEntry(fpdIH, entry, elementIndex, options = null) {
  const processSuc = ElementToSuc.get(FpbTypes.Process);

  // elementIndex is keyed by bare IDs; a braced ID in the snapshot would miss
  // the raw lookup, so try raw, then bare.
  const tryLookup = (id) => {
    const hit = elementIndex.get(id);
    if (hit !== undefined) {
      return hit;
    }
    const bare = stripBraces(id);
    return bare ? (elementIndex.get(bare) ?? null) : null;
  };

  // Top level: the process id is the AML ID
  if (!entry.process.isDecomposedProcessOperator) {
    const directHit = tryLookup(entry.process.id);
    if (directHit != null && stripAlias(directHit.refBaseSystemUnitPath) === processSuc) {
      MapperTrace.info(options, `  ResolveProcess: matched TOP-LEVEL by ID — entry.process.id='${entry.process.id}' -> AML '${text(directHit.id)}' name='${text(directHit.name)}'`);
      return directHit;
    }
  }

  // Sub-process: a Process IE whose refObj points back at the parent PO
  const parentPoId = !entry.process.isDecomposedProcessOperator
    ? entry.process.id
    : entry.process.isDecomposedProcessOperator;
  const parentPo = tryLookup(parentPoId);
  if (parentPo == null) {
    MapperTrace.info(options, `  ResolveProcess: parent PO '${parentPoId}' not in elementIndex — no match`);
    return null;
  }
  // refObj is stored brace-free; compare brace-insensitively so legacy
  // (braced) back-links still resolve
  const parentPoBareId = stripBraces(parentPo.id);
  let subHit = null;
  for (const ie of fpdIH.internalElement) {
    if (stripAlias(ie.refBaseSystemUnitPath) === processSuc
      && stripBraces(getRefObjOrDerived(ie) ?? '') === parentPoBareId) {
      subHit = ie;
      break;
    }
  }
  if (subHit != null) {
    MapperTrace.info(options, `  ResolveProcess: matched SUB-PROCESS via refObj — parent PO '${text(parentPo.id)}' name='${text(parentPo.name)}' -> sub-process '${text(subHit.id)}' name='${text(subHit.name)}'`);
  } else {
    MapperTrace.info(options, `  ResolveProcess: parent PO '${text(parentPo.id)}' has no sub-process with refObj pointing back yet — will trigger AddProcess`);
  }
  return subHit;
}

// -- Connection waypoint diff ------------------------------------------------

/** BuildInternalLinkIndex: every InternalLink of the FPD IH by its bare ID (the FPB.js flow ID) */
function buildInternalLinkIndex(fpdIH) {
  const index = new IgnoreCaseMap();
  walkInternalLinks(fpdIH.internalElement, (link) => {
    const bare = stripBraces(link.id);
    if (bare) {
      index.set(bare, link);
    }
  });
  return index;
}

function walkInternalLinks(roots, visit) {
  for (const ie of roots) {
    for (const link of ie.internalLink) {
      visit(link);
    }
    walkInternalLinks(ie.internalElement, visit);
  }
}

/**
 * GetUniqueInterfaceName: a unique ExternalInterface name per (element,
 * baseName) across one pass, as GetNextInterfaceName of BuildProcess.
 */
function getUniqueInterfaceName(counters, elementId, baseName) {
  let byBase = counters.get(elementId);
  if (byBase === undefined) {
    byBase = new Map();
    counters.set(elementId, byBase);
  }
  let n = byBase.get(baseName) ?? 0;
  n++;
  byBase.set(baseName, n);
  return n === 1 ? baseName : `${baseName}_${n}`;
}

/**
 * SeedIfaceCounters: the counters of an element from the interfaces it
 * already has, so new flows continue the _2/_3 suffixes instead of repeating
 * names. The first call per element wins.
 */
function seedIfaceCounters(counters, elementId, ie) {
  if (counters.has(elementId)) {
    return;
  }
  // The MAX suffix, not the count: with "FPD_FlowOut" and "FPD_FlowOut_3" a
  // count of 2 would mint "FPD_FlowOut_3" again.
  const byBase = new Map();
  for (const ei of ie.externalInterface) {
    const name = ei.name ?? '';
    if (name.length === 0) {
      continue;
    }
    let baseName = name;
    let suffix = 1;
    const us = name.lastIndexOf('_');
    if (us > 0) {
      const parsed = system.tryParseInt32(name.substring(us + 1));
      if (parsed !== null) {
        baseName = name.substring(0, us);
        suffix = parsed;
      }
    }
    const current = byBase.get(baseName) ?? 0;
    byBase.set(baseName, Math.max(current, suffix));
  }
  counters.set(elementId, byBase);
}

/**
 * IsDescendantOf: whether `ancestor` is on the CAEXParent path. Reference
 * equality as in C#; the engine hands out a new wrapper for every parent, so
 * this is false for wrappers obtained elsewhere (C# behaves the same).
 */
function isDescendantOf(node, ancestor) {
  for (let n = node?.caexParent ?? null; n != null; n = n.caexParent) {
    if (n === ancestor) {
      return true;
    }
  }
  return false;
}

/** FindHostProcessName: the FPD_Process an IE lives in, for the cross-process warning */
function findHostProcessName(ie) {
  if (ie == null) {
    return '<null>';
  }
  const processSuc = ElementToSuc.get(FpbTypes.Process);
  for (let n = ie; n != null; n = n.caexParent) {
    if (n instanceof InternalElementType && stripAlias(n.refBaseSystemUnitPath) === processSuc) {
      return `${text(n.name)} (id=${text(n.id)})`;
    }
  }
  return '<no FPD_Process ancestor>';
}

/**
 * LinkEndpointsMatch: whether the link's sides still match the flow's
 * sourceRef/targetRef; false when the flow was reversed or rerouted.
 */
function linkEndpointsMatch(link, flowData, elementIndex) {
  // Empty endpoints are a MISMATCH, as in AddConnection
  if (!flowData.sourceRef || !flowData.targetRef) {
    return false;
  }
  const expectedSource = elementIndex.get(flowData.sourceRef);
  if (expectedSource === undefined) {
    return false;
  }
  const expectedTarget = elementIndex.get(flowData.targetRef);
  if (expectedTarget === undefined) {
    return false;
  }

  const aIface = link.aInterface;
  const bIface = link.bInterface;
  if (aIface == null || bIface == null) {
    return false;
  }

  // Wrappers are not reference-stable: compare by AML ID
  const aParentId = asInternalElement(aIface.caexParent)?.id ?? null;
  const bParentId = asInternalElement(bIface.caexParent)?.id ?? null;
  return idsEqual(aParentId, expectedSource.id)
    && idsEqual(bParentId, expectedTarget.id);
}

function idsEqual(a, b) {
  if (!a || !b) {
    return false;
  }
  return equalsIgnoreCase(stripBraces(a), stripBraces(b));
}

/**
 * UpdateExistingConnection: PortCoordinate (both ends) and Waypoint_n (source
 * side) of an existing link, so a path dragged in FPB.js shows up in CAEX.
 * User attributes on the interfaces stay.
 */
function updateExistingConnection(link, flowData, visualMap) {
  const visual = visualMap.get(flowData.id);
  if (visual === undefined) {
    return;
  }
  if (visual.waypoints.length === 0) {
    return;
  }

  const aIface = link.aInterface;
  const bIface = link.bInterface;

  if (aIface != null) {
    const first = visual.waypoints[0];
    const firstSrc = first.original ?? first;
    updatePortCoordinate(aIface, firstSrc.x, firstSrc.y);

    // Replace the intermediate Waypoint_n; first and last are the
    // PortCoordinates of the two interfaces. Skip(1).SkipLast(1)
    const intermediates = visual.waypoints.slice(1, -1);
    replaceWaypointAttrs(aIface, intermediates);
  }

  if (bIface != null && visual.waypoints.length >= 2) {
    const last = visual.waypoints[visual.waypoints.length - 1];
    const lastSrc = last.original ?? last;
    updatePortCoordinate(bIface, lastSrc.x, lastSrc.y);
  }
}

function updatePortCoordinate(iface, x, y) {
  const portCoord = iface.attribute.item('PortCoordinate');
  if (portCoord == null) {
    return; // old export shape
  }
  setDoubleSubAttr(portCoord, 'x', x);
  setDoubleSubAttr(portCoord, 'y', y);
}

function replaceWaypointAttrs(iface, waypoints) {
  // Waypoint_n are managed by the FPB.js geometry only, never user-annotated,
  // so a wholesale rewrite is safe
  const existing = [...iface.attribute].filter((a) => a.name != null && a.name.startsWith('Waypoint_'));
  for (const attr of existing) {
    attr.remove();
  }

  for (let i = 0; i < waypoints.length; i++) {
    addWaypointAttr(iface, i + 1, waypoints[i].x, waypoints[i].y);
  }
}

// -- Connection add / remove -------------------------------------------------

/**
 * AddConnection: a new InternalLink under the process, with the interface,
 * link and waypoint layout of BuildProcess. Null with a warning when the flow
 * cannot be wired (unknown type, missing endpoints).
 */
function addConnection(procAml, flowData, elementIndex, visualMap, warnings, ifaceCounters = null) {
  const ifacePaths = FlowToInterface.get(flowData.type);
  if (ifacePaths === undefined) {
    warnings.push(`Cannot add flow '${flowData.id}': unknown type '${flowData.type}'.`);
    return null;
  }
  if (!flowData.sourceRef || !flowData.targetRef) {
    warnings.push(`Cannot add flow '${flowData.id}': missing sourceRef or targetRef.`);
    return null;
  }
  const sourceIE = elementIndex.get(flowData.sourceRef);
  const targetIE = sourceIE === undefined ? undefined : elementIndex.get(flowData.targetRef);
  if (sourceIE === undefined || targetIE === undefined) {
    warnings.push(`Cannot add flow '${flowData.id}': source or target element not found in AML.`);
    return null;
  }

  // Cross-process defence: warn when EITHER endpoint is outside procAml
  if (!isDescendantOf(sourceIE, procAml) || !isDescendantOf(targetIE, procAml)) {
    const sourceHost = findHostProcessName(sourceIE);
    const targetHost = findHostProcessName(targetIE);
    warnings.push(`Flow '${flowData.id}': not all endpoints live under process ` +
      `'${text(procAml.name)}' — source lives in '${sourceHost}', target lives in '${targetHost}' — link may target the wrong layer.`);
  }

  // Unique interface names across the pass (_2, _3, ...), seeded from the
  // interfaces the IEs already have; unseeded counters would restart at the
  // base name and mint duplicates.
  if (ifaceCounters == null) {
    ifaceCounters = new Map();
  }
  seedIfaceCounters(ifaceCounters, flowData.sourceRef, sourceIE);
  seedIfaceCounters(ifaceCounters, flowData.targetRef, targetIE);
  const outBaseName = ifacePaths.out.split('/')[1];
  const sourceIface = sourceIE.externalInterface.append(
    getUniqueInterfaceName(ifaceCounters, flowData.sourceRef, outBaseName));
  sourceIface.id = newId();
  sourceIface.refBaseClassPath = ifacePaths.out;

  const inBaseName = ifacePaths.in.split('/')[1];
  const targetIface = targetIE.externalInterface.append(
    getUniqueInterfaceName(ifaceCounters, flowData.targetRef, inBaseName));
  targetIface.id = newId();
  targetIface.refBaseClassPath = ifacePaths.in;

  const visual = visualMap.get(flowData.id);
  if (visual !== undefined && visual.waypoints.length > 0) {
    const first = visual.waypoints[0];
    const firstSrc = first.original ?? first;
    addPortCoordinate(sourceIface, firstSrc.x, firstSrc.y);

    const intermediates = visual.waypoints.slice(1, -1);
    for (let i = 0; i < intermediates.length; i++) {
      const wp = intermediates[i];
      if (wp.original != null) {
        continue;
      }
      addWaypointAttr(sourceIface, i + 1, wp.x, wp.y);
    }

    if (visual.waypoints.length >= 2) {
      const last = visual.waypoints[visual.waypoints.length - 1];
      const lastSrc = last.original ?? last;
      addPortCoordinate(targetIface, lastSrc.x, lastSrc.y);
    } else {
      addEmptyPortCoordinate(targetIface);
    }
  } else {
    addEmptyPortCoordinate(sourceIface);
    addEmptyPortCoordinate(targetIface);
  }

  // The link name convention of BuildProcess
  const sourceName = (sourceIE.name ?? 'Source').replaceAll(' ', '').replaceAll('\n', '');
  const targetName = (targetIE.name ?? 'Target').replaceAll(' ', '').replaceAll('\n', '');
  const linkName = flowData.type === FpbTypes.Usage
    ? `${sourceName}_uses_${targetName}`
    : `${sourceName}_to_${targetName}`;

  const link = procAml.internalLink.append(linkName);
  link.id = wrapBraces(flowData.id);
  link.aInterface = sourceIface;
  link.bInterface = targetIface;
  return link;
}

/**
 * RemoveOrphanedConnections: InternalLinks whose ID is not in the payload.
 * Links have no FPD class, so a missing ID is the only signal; FPB.js owns the
 * link lifecycle.
 */
function removeOrphanedConnections(linkIndex, incomingIds) {
  const removedKeys = new IgnoreCaseSet();
  for (const key of linkIndex.keys()) {
    if (!incomingIds.has(key)) {
      removedKeys.add(key);
    }
  }
  if (removedKeys.size === 0) {
    return 0;
  }

  // Interfaces still referenced by SURVIVING links stay; only those that
  // become unreferenced go with their link. A partner side is an interface
  // GUID (CAEX 3.0) or "elementId:interfaceName" (CAEX 2.x, other tools):
  // take the interface part first, or a shared interface looks unreferenced.
  const sideId = (side) => {
    if (!side) {
      return '';
    }
    const colonIdx = side.lastIndexOf(':');
    return stripBraces(colonIdx < 0 ? side : side.substring(colonIdx + 1));
  };
  const survivingIfaceIds = new IgnoreCaseSet();
  for (const [key, link] of linkIndex) {
    if (removedKeys.has(key)) {
      continue;
    }
    const a = sideId(link.refPartnerSideA);
    const b = sideId(link.refPartnerSideB);
    if (a.length > 0) {
      survivingIfaceIds.add(a);
    }
    if (b.length > 0) {
      survivingIfaceIds.add(b);
    }
  }

  for (const key of removedKeys) {
    const link = linkIndex.get(key);
    // Resolve the interfaces BEFORE the link disappears; left behind they
    // were 2 corpse interfaces per removed flow
    const aIface = link.aInterface;
    const bIface = link.bInterface;
    link.remove();
    if (aIface != null && !survivingIfaceIds.has(stripBraces(aIface.id ?? ''))) {
      aIface.remove();
    }
    if (bIface != null && !survivingIfaceIds.has(stripBraces(bIface.id ?? ''))) {
      bIface.remove();
    }
  }
  return removedKeys.size;
}

// -- Process lifecycle -------------------------------------------------------

/**
 * AddProcess: a new FPD_Process IE for a newly decomposed PO, with refObj to
 * the parent PO and refProcess on the PO back to it, as Convert writes them.
 */
function addProcess(fpdIH, incomingProcess, elementIndex, sucLookup, warnings, options = null) {
  if (!incomingProcess.isDecomposedProcessOperator) {
    warnings.push(`Cannot add top-level process '${incomingProcess.id}' via UpdateInPlace ` +
      '— only decomposed sub-processes can be created from FPB.JS edits.');
    return null;
  }
  // Diagnostic: the index keys and the looked-up key, to see whether the
  // snapshot ID matches what BuildElementIndex produced
  const rawKey = incomingProcess.isDecomposedProcessOperator;
  const bareKey = stripBraces(rawKey);
  const parentPo = elementIndex.get(rawKey) ?? elementIndex.get(bareKey);
  if (parentPo === undefined) {
    const sampleKeys = [...elementIndex.keys()].slice(0, 8).map((k) => `'${k}'`).join(', ');
    warnings.push(`Cannot decompose: parent PO raw='${rawKey}' bare='${bareKey}' ` +
      `not found in elementIndex (size=${elementIndex.size}). ` +
      `Sample keys: [${sampleKeys}${elementIndex.size > 8 ? ', …' : ''}].`);
    return null;
  }

  return addProcessImpl(fpdIH, parentPo, sucLookup, elementIndex);
}

/**
 * RemoveOrphanedSubProcesses: sub-process IEs whose parent PO no longer comes
 * decomposed (the user composed it back). Top-level processes stay: dropping
 * them would dump the whole model.
 */
function removeOrphanedSubProcesses(fpdIH, incomingDecomposedParentPoIds, elementIndex, removedTargets, options = null) {
  const processSuc = ElementToSuc.get(FpbTypes.Process);
  const subProcesses = [...fpdIH.internalElement]
    .filter((ie) => stripAlias(ie.refBaseSystemUnitPath) === processSuc && getRefObjOrDerived(ie));

  let removed = 0;
  for (const sub of subProcesses) {
    const parentRef = getRefObjOrDerived(sub) ?? '';
    const parentBare = stripBraces(parentRef);
    if (incomingDecomposedParentPoIds.has(parentBare)) {
      continue;
    }

    MapperTrace.attempt(options, 'RemoveSubProcess',
      `sub-process id='${text(sub.id)}' name='${text(sub.name)}' parentPO bare='${parentBare}' (parent no longer carries decomposedView)`);

    // Clear the back-link on the parent PO, or it keeps pointing at a
    // detached IE
    const parentPo = elementIndex.get(parentBare);
    if (parentPo !== undefined) {
      setAttrValue(parentPo, 'refProcess', '');
    }

    // Drop the whole subtree from elementIndex too, or later passes see
    // detached elements
    purgeSubtreeFromIndex(sub, elementIndex);
    removedTargets.collect(sub);
    sub.remove();
    removed++;
    MapperTrace.result(options, 'RemoveSubProcess', 'removed (plus purged subtree from elementIndex)');
  }
  return removed;
}

/**
 * PurgeSubtreeFromIndex: keep elementIndex consistent with the tree after a
 * removal; detached IEs have no CAEXParent and changes to them never reach
 * the saved file.
 */
function purgeSubtreeFromIndex(subtreeRoot, elementIndex) {
  const rootId = stripBraces(subtreeRoot.id);
  if (rootId) {
    elementIndex.delete(rootId);
  }
  walkInternalElements(subtreeRoot.internalElement, (child) => {
    const id = stripBraces(child.id);
    if (id) {
      elementIndex.delete(id);
    }
  });
}

function addProcessImpl(fpdIH, parentPo, sucLookup, elementIndex) {
  const procIE = createInstance(sucLookup, 'FPD_Process');
  // Derived from the parent PO: Decompose, Compose, Decompose gives the same
  // sub-process ID, so tools watching the file see a clean diff
  procIE.id = deriveSubProcessId(stripBraces(parentPo.id));
  procIE.name = parentPo.name ?? 'Sub-Process';
  fpdIH.insert(procIE);
  // refObj brace-free (the parent PO's uniqueIdent), as Convert writes it;
  // VDI 3682 rule F1 resolves it against uniqueIdent
  setAttrValue(procIE, 'refObj', stripBraces(parentPo.id));

  // No FPD_SystemLimit here: the entry carries a fpb:SystemLimit with its
  // FPB.js ID, and AddElement creates it; a second one would follow otherwise.

  setAttrValue(parentPo, 'refProcess', procIE.id);

  const procBare = stripBraces(procIE.id);
  if (procBare) {
    elementIndex.set(procBare, procIE);
  }

  return procIE;
}

/**
 * UpdateExistingElement: the FPD-managed properties of an existing IE (Name,
 * Identification, ViewInformation, Characteristics); user attributes,
 * interfaces and mappings stay.
 */
function updateExistingElement(ie, data, visualMap, elementIndex, options = null) {
  if (data.name && ie.name !== data.name) {
    MapperTrace.info(options, `UpdateExistingElement: ie='${text(ie.id)}' name '${text(ie.name)}' -> '${data.name}'`);
    ie.name = data.name;
  }

  setIdentification(ie, data.identification, data.name, options);

  if (visualMap.has(data.id)) {
    setViewInformation(ie, visualMap.get(data.id), options);
  }

  // SetCharacteristics replaces the Characteristic_N entries, so edits in
  // FPB.js round-trip
  if (data.characteristics != null) {
    setCharacteristics(ie, data.characteristics, options);
  }
}

/**
 * SyncDecompositionNamesPostPass: PO names to their decomposed child Process
 * IEs, after the main loop so the loop order cannot overwrite it. PO to child
 * only.
 */
function syncDecompositionNamesPostPass(elementIndex, warnings = null, options = null) {
  const poSuc = ElementToSuc.get(FpbTypes.ProcessOperator);
  let syncs = 0;

  for (const ie of elementIndex.values()) {
    if (stripAlias(ie.refBaseSystemUnitPath) !== poSuc) {
      continue;
    }
    if (!ie.name) {
      continue;
    }

    const refProcess = ie.attribute.item('refProcess')?.value ?? null;
    if (!refProcess) {
      continue;
    }

    const key = stripBraces(refProcess);
    const child = elementIndex.get(key);
    if (child === undefined) {
      MapperTrace.info(options,
        `SyncDecompositionNames: PO id='${text(ie.id)}' name='${ie.name}' refProcess='${refProcess}' — child not in elementIndex (likely orphaned)`);
      continue;
    }
    // A detached IE: the change would never reach the saved file
    if (child.caexParent == null) {
      MapperTrace.info(options,
        `SyncDecompositionNames: child id='${text(child.id)}' is detached (CAEXParent=null) — skipping name sync`);
      continue;
    }
    if (child.name !== ie.name) {
      MapperTrace.info(options,
        `SyncDecompositionNames: PO id='${text(ie.id)}' name '${text(child.name)}' -> '${ie.name}'`);
      child.name = ie.name;
      syncs++;
    }
  }
  return syncs;
}

/**
 * SyncBoundaryStateRefObjs: refObj of every sub-process state from the
 * snapshot. A state ID in both the parent entry and the sub-process entry is
 * a boundary state and gets refObj = the normalised state ID. Only enriches:
 * an explicit refObj stays (the round trip gives each copy its own ID, so
 * clearing would lose every legitimate refObj).
 */
function syncBoundaryStateRefObjs(entries, elementIndex, options = null) {
  // Every entry can be the parent of a deeper sub-process
  const parentEntries = entries.slice();

  let updated = 0;
  for (const entry of entries) {
    if (!entry.process.isDecomposedProcessOperator) {
      continue;
    }
    const parentPoBare = stripBraces(entry.process.isDecomposedProcessOperator);

    // Any entry whose elementData contains this parent PO
    const parentEntry = parentEntries.find((p) => p.elementData.some((d) => stripBraces(d.id) === parentPoBare)) ?? null;
    if (parentEntry == null) {
      MapperTrace.info(options,
        `SyncBoundaryStateRefObjs: sub-process entry parent='${parentPoBare}' has no matching parent entry — leaving refObjs untouched`);
      continue;
    }

    const parentStateIds = new IgnoreCaseSet(
      parentEntry.elementData.filter((d) => StateTypes.has(d.type)).map((d) => stripBraces(d.id)));

    for (const data of entry.elementData) {
      if (!StateTypes.has(data.type)) {
        continue;
      }
      const stateBare = stripBraces(data.id);
      const stateIe = elementIndex.get(stateBare);
      if (stateIe === undefined) {
        continue;
      }
      if (stateIe.caexParent == null) {
        continue;
      }

      // brace-free: refObj carries the uniqueIdent form
      const expected = parentStateIds.has(stateBare) ? stripBraces(normalizeId(data.id)) : '';
      const current = stateIe.attribute.item('refObj')?.value ?? '';

      if (!expected) {
        if (current) {
          MapperTrace.info(options,
            `SyncBoundaryStateRefObjs: state id='${text(stateIe.id)}' name='${text(stateIe.name)}' has explicit refObj='${current}' — preserved (no ID-sharing translation needed)`);
        }
        continue;
      }

      if (current !== expected) {
        MapperTrace.info(options,
          `SyncBoundaryStateRefObjs: state id='${text(stateIe.id)}' name='${text(stateIe.name)}' refObj '${current}' -> '${expected}' (boundary state derived from ID-sharing)`);
        setAttrValue(stateIe, 'refObj', expected);
        updated++;
      }
    }
  }
  return updated;
}

// -- UpdateInPlace helpers ---------------------------------------------------

/** FindFpdInstanceHierarchy: the first IH with an FPD_Process IE at its top level, or null */
function findFpdInstanceHierarchy(caex) {
  const fpdProcessSuc = ElementToSuc.get(FpbTypes.Process);
  for (const ih of caex.instanceHierarchy) {
    for (const ie of ih.internalElement) {
      if (stripAlias(ie.refBaseSystemUnitPath) === fpdProcessSuc) {
        return ih;
      }
    }
  }
  return null;
}

/**
 * BuildElementIndex: every IE of the FPD IH by its bare ID (the form
 * CaexToFpbJson gives FPB.js).
 */
function buildElementIndex(fpdIH, options = null, warnings = null) {
  const index = new IgnoreCaseMap();
  walkInternalElements(fpdIH.internalElement, (ie) => {
    const bare = stripBraces(ie.id);
    if (!bare) {
      return;
    }
    // A duplicate ID would silently overwrite an earlier IE, and later passes
    // would change the wrong element: report it and keep the first.
    const existing = index.get(bare);
    if (existing !== undefined) {
      const msg = `BuildElementIndex: duplicate ID '${bare}' detected — existing parent='${existing.caexParent?.toString() ?? '?'}' name='${text(existing.name)}', ` +
        `new parent='${ie.caexParent?.toString() ?? '?'}' name='${text(ie.name)}'. ` +
        'Keeping the first; the second one cannot be addressed via elementIndex lookups.';
      if (warnings != null) {
        warnings.push(msg);
      }
      MapperTrace.info(options, msg);
      return;
    }
    index.set(bare, ie);
  });
  return index;
}

/** StripBraces: the raw GUID form FPB.js uses, without the B-format braces */
function stripBraces(amlId) {
  if (!amlId) {
    return '';
  }
  if (amlId.length >= 2 && amlId[0] === '{' && amlId[amlId.length - 1] === '}') {
    return amlId.substring(1, amlId.length - 1);
  }
  return amlId;
}

/**
 * AppendInto: validates, ensures the libraries and appends a fresh
 * InstanceHierarchy with the FPD processes. FileName and
 * SourceDocumentInformation stay.
 */
function appendInto(doc, project, entries, options = null) {
  const warnings = [];
  MapperTrace.info(options, `AppendInto ENTRY: project='${text(project.name)}' entries=${entries.length}`);
  validate(project, entries, warnings);
  const processMap = toDictionary(entries, (e) => e.process.id);
  const entryProcessId = project.entryPoint;

  // AML IDs of the processes, assigned up front
  const processAmlIds = new Map();
  const poToChildProcess = new Map();
  const allProcessIds = collectProcessIds(entryProcessId, processMap);

  for (const pid of allProcessIds) {
    processAmlIds.set(pid, newId());
    const entry = processMap.get(pid);
    if (entry === undefined) {
      continue;
    }
    for (const obj of entry.elementData) {
      if (obj.type === FpbTypes.ProcessOperator && obj.decomposedView) {
        poToChildProcess.set(obj.id, obj.decomposedView);
      }
    }
  }

  const caex = doc.caexFile;

  // CreateClassInstance needs the libraries (no-op when present)
  ensureLibraries(caex, options);

  const sucLib = caex.systemUnitClassLib.item(LibNames.SystemUnitClassLib);
  const sucLookup = new Map();
  for (const suc of sucLib.systemUnitClass) {
    sucLookup.set(suc.name, suc);
  }

  // Always a fresh InstanceHierarchy: keeps imports isolated
  const ihName = project.name ? project.name : 'InstanceHierarchy';
  const ih = caex.instanceHierarchy.append(ihName);
  ih.id = newId();
  ih.version = '1.0.0';

  // The FPB.js IDs already written as AML IDs
  const usedAmlIds = new Set();

  for (const pid of allProcessIds) {
    buildProcess(ih, pid, processMap, processAmlIds, poToChildProcess, usedAmlIds, sucLookup, warnings, options);
  }

  return warnings;
}

const MaxDecompositionDepth = 50;

function collectProcessIds(processId, processMap, visited = null, depth = 0) {
  if (depth > MaxDecompositionDepth) {
    throw new InvalidOperationException(`Decomposition depth exceeds ${MaxDecompositionDepth} levels — possible circular reference`);
  }

  if (visited == null) {
    visited = new Set();
  }
  if (visited.has(processId)) {
    throw new InvalidOperationException(`Circular decomposition detected: process '${text(processId)}' references itself`);
  }
  visited.add(processId);

  const result = [processId];
  const entry = processMap.get(processId);
  if (entry === undefined) {
    return result;
  }

  for (const obj of entry.elementData) {
    if (obj.type === FpbTypes.ProcessOperator && obj.decomposedView) {
      if (processMap.has(obj.decomposedView)) {
        result.push(...collectProcessIds(obj.decomposedView, processMap, visited, depth + 1));
      }
    }
  }
  return result;
}

// -- Process builder ---------------------------------------------------------

function buildProcess(ih, processId, processMap, processAmlIds, poToChildProcess, usedAmlIds, sucLookup, warnings, options = null) {
  const entry = processMap.get(processId);
  if (entry === undefined) {
    return;
  }

  const process = entry.process;
  const visualMap = toDictionary(entry.elementVisual, (v) => v.id);
  const dataMap = toDictionary(entry.elementData, (d) => d.id);

  // The process name
  const slData = entry.elementData.find((e) => e.type === FpbTypes.SystemLimit) ?? null;
  const parentPOId = process.isDecomposedProcessOperator;
  let processName = null;

  if (parentPOId) {
    for (const pe of processMap.values()) {
      const po = pe.elementData.find((e) => e.id === parentPOId);
      if (po !== undefined) {
        processName = po.name;
        break;
      }
    }
  }
  if (processName == null) {
    processName = slData?.name ?? 'Process';
  }

  const procIE = createInstance(sucLookup, 'FPD_Process');
  procIE.name = processName;
  procIE.id = processAmlIds.get(processId);
  ih.insert(procIE);

  // refObj: a child process points to its parent PO (brace-free, the uniqueIdent)
  setAttrValue(procIE, 'refObj', parentPOId ? stripBraces(normalizeId(parentPOId)) : '');

  // SystemLimit
  if (slData != null) {
    const slIE = createInstance(sucLookup, 'FPD_SystemLimit');
    slIE.name = 'SystemLimit_' + processName.replaceAll(' ', '');
    slIE.id = normalizeId(slData.id);
    procIE.insert(slIE);
    // The SystemLimit's own name first: processName is the parent operator's
    // name for a sub-process
    setIdentification(slIE, slData.identification,
      slData.name ? slData.name : processName, options);
    // No default layout without visual data: FPB.js arranges the whole
    // process on import when nothing is placed
    if (visualMap.has(slData.id)) {
      setViewInformation(slIE, visualMap.get(slData.id), options);
    }
  }

  // ExternalInterfaces per flow, for the InternalLinks
  const linkMap = new Map();
  const ifaceCounters = new Map();

  const getNextInterfaceName = (elementId, baseName) => {
    let counters = ifaceCounters.get(elementId);
    if (counters === undefined) {
      counters = new Map();
      ifaceCounters.set(elementId, counters);
    }
    const count = counters.get(baseName) ?? 0;
    counters.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  };

  const flows = entry.elementData.filter((e) => ConnectionTypes.has(e.type));
  const objects = entry.elementData.filter((e) => ObjectTypes.has(e.type));

  const flowsBySource = groupBy(flows.filter((f) => f.sourceRef != null), (f) => f.sourceRef);
  const flowsByTarget = groupBy(flows.filter((f) => f.targetRef != null), (f) => f.targetRef);

  const isChildProcess = !!parentPOId;
  let parentEntry = null;
  if (isChildProcess) {
    for (const pe of processMap.values()) {
      if (pe.elementData.some((e) => e.type === FpbTypes.ProcessOperator && e.decomposedView === processId)) {
        parentEntry = pe;
        break;
      }
    }
  }

  // Object InternalElements
  for (const obj of objects) {
    if (obj.type === FpbTypes.SystemLimit) {
      continue;
    }
    const sucPath = ElementToSuc.get(obj.type);
    if (sucPath === undefined) {
      continue;
    }

    const sucName = sucPath.split('/')[1]; // e.g. "FPD_Product"
    let elemName = obj.name ? obj.name : obj.type.split(':')[1];
    elemName = elemName.replaceAll('\n', '');

    // AML ID: the FPB.js ID in {GUID} form
    let elemAmlId;
    const normalizedId = normalizeId(obj.id);
    if (usedAmlIds.has(normalizedId)) {
      // The element is already written under another process. A boundary
      // STATE (one FPB.js id on the parent and the sub-process layer) gets an
      // id derived from (shared id, sub-process), stable across round trips;
      // any other collision a fresh id.
      const isBoundaryState = isChildProcess && StateTypes.has(obj.type)
        && parentEntry != null
        && parentEntry.elementData.some((e) => e.id === obj.id && StateTypes.has(e.type));
      elemAmlId = isBoundaryState
        ? deriveBoundaryStateId(stripBraces(normalizedId), stripBraces(normalizeId(processId)))
        : newId();
    } else {
      elemAmlId = normalizedId;
    }
    usedAmlIds.add(elemAmlId);

    // CreateClassInstance: attributes and RoleRequirements come with it
    const ie = createInstance(sucLookup, sucName);
    ie.name = elemName;
    ie.id = elemAmlId;
    procIE.insert(ie);

    setIdentification(ie, obj.identification, elemName, options);
    setCharacteristics(ie, obj.characteristics, options);

    if (obj.type === FpbTypes.ProcessOperator) {
      if (obj.decomposedView && poToChildProcess.has(obj.id)) {
        const childProcessId = poToChildProcess.get(obj.id);
        setAttrValue(ie, 'refProcess', processAmlIds.get(childProcessId) ?? '');
      } else {
        setAttrValue(ie, 'refProcess', '');
      }
    } else if (StateTypes.has(obj.type)) {
      if (isChildProcess && parentEntry != null) {
        const parentState = parentEntry.elementData.find((e) => e.id === obj.id && StateTypes.has(e.type)) ?? null;
        setAttrValue(ie, 'refObj', parentState != null ? stripBraces(normalizeId(obj.id)) : '');
      } else {
        setAttrValue(ie, 'refObj', '');
      }
    }

    if (visualMap.has(obj.id)) {
      setViewInformation(ie, visualMap.get(obj.id), options);
    }

    // ExternalInterfaces for outgoing flows
    const outFlows = flowsBySource.get(obj.id);
    if (outFlows !== undefined) {
      for (const flow of outFlows) {
        const ifacePaths = FlowToInterface.get(flow.type);
        if (ifacePaths === undefined) {
          continue;
        }

        const outBaseName = ifacePaths.out.split('/')[1];
        const ifaceName = getNextInterfaceName(obj.id, outBaseName);
        const ifaceId = newId();

        const extIf = ie.externalInterface.append(ifaceName);
        extIf.id = ifaceId;
        extIf.refBaseClassPath = ifacePaths.out;

        const flowVisual = visualMap.get(flow.id);
        if (flowVisual !== undefined && flowVisual.waypoints.length > 0) {
          const firstWp = flowVisual.waypoints[0];
          const portCoord = firstWp.original ?? firstWp;
          addPortCoordinate(extIf, portCoord.x, portCoord.y);

          const intermediates = flowVisual.waypoints.slice(1, -1);
          for (let i = 0; i < intermediates.length; i++) {
            const wp = intermediates[i];
            if (wp.original != null) {
              continue;
            }
            addWaypointAttr(extIf, i + 1, wp.x, wp.y);
          }
        } else {
          addEmptyPortCoordinate(extIf);
        }

        if (!linkMap.has(flow.id)) {
          linkMap.set(flow.id, { outIf: null, inIf: null });
        }
        const cur = linkMap.get(flow.id);
        linkMap.set(flow.id, { outIf: extIf, inIf: cur.inIf });
      }
    }

    // ExternalInterfaces for incoming flows
    const inFlows = flowsByTarget.get(obj.id);
    if (inFlows !== undefined) {
      for (const flow of inFlows) {
        const ifacePaths = FlowToInterface.get(flow.type);
        if (ifacePaths === undefined) {
          continue;
        }

        const inBaseName = ifacePaths.in.split('/')[1];
        const ifaceName = getNextInterfaceName(obj.id, inBaseName);
        const ifaceId = newId();

        const extIf = ie.externalInterface.append(ifaceName);
        extIf.id = ifaceId;
        extIf.refBaseClassPath = ifacePaths.in;

        const flowVisual = visualMap.get(flow.id);
        if (flowVisual !== undefined && flowVisual.waypoints.length > 0) {
          const lastWp = flowVisual.waypoints[flowVisual.waypoints.length - 1];
          const portCoord = lastWp.original ?? lastWp;
          addPortCoordinate(extIf, portCoord.x, portCoord.y);
        } else {
          addEmptyPortCoordinate(extIf);
        }

        if (!linkMap.has(flow.id)) {
          linkMap.set(flow.id, { outIf: null, inIf: null });
        }
        const cur = linkMap.get(flow.id);
        linkMap.set(flow.id, { outIf: cur.outIf, inIf: extIf });
      }
    }
  }

  // InternalLinks through AInterface/BInterface, for correct CAEX paths
  for (const [flowId, ifs] of linkMap) {
    if (ifs.outIf == null || ifs.inIf == null) {
      warnings.push(`Flow '${flowId}' skipped: missing ${ifs.outIf == null ? 'source' : 'target'} interface.`);
      continue;
    }

    const flow = dataMap.get(flowId) ?? null;
    const sourceData = flow?.sourceRef != null ? (dataMap.get(flow.sourceRef) ?? null) : null;
    const targetData = flow?.targetRef != null ? (dataMap.get(flow.targetRef) ?? null) : null;
    const sourceName = sourceData?.name.replaceAll(' ', '').replaceAll('\n', '') ?? 'Source';
    const targetName = targetData?.name.replaceAll(' ', '').replaceAll('\n', '') ?? 'Target';

    const linkName = flow?.type === FpbTypes.Usage
      ? `${sourceName}_uses_${targetName}`
      : `${sourceName}_to_${targetName}`;

    const link = procIE.internalLink.append(linkName);
    // The FPB.js flow ID (B-format), so NormalizeId(link.ID) on the way back
    // recovers it
    link.id = normalizeId(flowId);
    link.aInterface = ifs.outIf;
    link.bInterface = ifs.inIf;
  }
}

// -- CAEX instantiation ------------------------------------------------------

function createInstance(sucLookup, sucName) {
  const suc = sucLookup.get(sucName);
  if (suc === undefined) {
    throw new InvalidOperationException(`SystemUnitClass '${sucName}' not found in library`);
  }
  // The extension CreateClassInstance(IInstantiable<T>, string name)
  const ie = InheritanceExtensions.createClassInstance(suc, sucName);

  // CreateClassInstance only copies the first SupportedRoleClass as
  // RoleRequirement; the others (AML base roles) are added here
  const existingRRs = new Set([...ie.roleRequirements].map((r) => r.refBaseRoleClassPath));
  for (const src of suc.supportedRoleClass) {
    if (!existingRRs.has(src.refRoleClassPath)) {
      ie.roleRequirements.append().refBaseRoleClassPath = src.refRoleClassPath;
    }
  }

  return ie;
}

// -- Attribute setters (on the attributes CreateClassInstance created) -------

/**
 * SetAttrValue: set or CLEAR an attribute value. Empty values are written as
 * "", which every consumer reads as cleared (skipping them left refProcess
 * pointing at removed sub-processes).
 */
function setAttrValue(ie, name, value) {
  const attr = ie.attribute.item(name);
  if (attr != null) {
    attr.value = value ?? '';
  } else {
    // Missing only with a malformed SUC; "" as on the main path
    const newAttr = ie.attribute.append(name);
    newAttr.attributeDataType = 'xs:string';
    newAttr.value = value ?? '';
  }
}

function setIdentification(ie, ident, fallbackName, options = null) {
  const attr = ie.attribute.item(IdentificationSchema.AttributeName);
  if (attr == null) {
    MapperTrace.info(options, `SetIdentification: ie='${text(ie.id)}' has no Identification container (SUC malformed?) — skipped`);
    return;
  }

  setSubAttr(attr, IdentificationSchema.UniqueIdent, ident?.uniqueIdent);
  setSubAttr(attr, IdentificationSchema.LongName, ident?.longName);
  setSubAttr(attr, IdentificationSchema.ShortName, ident?.shortName ?? fallbackName);
  setSubAttr(attr, IdentificationSchema.VersionNumber, ident?.versionNumber);
  setSubAttr(attr, IdentificationSchema.RevisionNumber, ident?.revisionNumber);
  MapperTrace.info(options, `SetIdentification: ie='${text(ie.id)}' shortName='${text(ident?.shortName ?? fallbackName)}'`);
}

/**
 * SetCharacteristics: replaces the Characteristic_N entries of the
 * Characteristics container, so it is safe on an already filled IE.
 */
function setCharacteristics(ie, characteristics, options = null) {
  let container = ie.attribute.item('Characteristics');
  let removedExisting = 0;

  // Remove the existing entries first, or the IE carries two copies
  if (container != null) {
    const existing = [...container.attribute].filter((a) => a.name != null && a.name.startsWith('Characteristic_'));
    for (const old of existing) {
      old.remove();
    }
    removedExisting = existing.length;
  }

  if (characteristics.length === 0) {
    MapperTrace.info(options, `SetCharacteristics: ie='${text(ie.id)}' wiped ${removedExisting} existing, no new ones (user cleared)`);
    return;
  }

  if (container == null) {
    container = ie.attribute.append('Characteristics');
    container.attributeDataType = 'xs:string';
  }
  MapperTrace.info(options, `SetCharacteristics: ie='${text(ie.id)}' removed=${removedExisting}, adding=${characteristics.length}`);

  for (let i = 0; i < characteristics.length; i++) {
    const c = characteristics[i];
    const cAttr = container.attribute.append(`Characteristic_${i + 1}`);
    cAttr.attributeDataType = 'xs:string';
    cAttr.refAttributeType = AttrRefs.Characteristic;

    const cat = c.category;
    const identAttr = cAttr.attribute.append('Category');
    identAttr.attributeDataType = 'xs:string';
    identAttr.refAttributeType = AttrRefs.Identification;
    for (const f of IdentificationSchema.Fields) {
      let val;
      switch (f) {
        case IdentificationSchema.UniqueIdent: val = cat?.uniqueIdent ?? ''; break;
        case IdentificationSchema.LongName: val = cat?.longName ?? ''; break;
        case IdentificationSchema.ShortName: val = cat?.shortName ?? ''; break;
        case IdentificationSchema.VersionNumber: val = cat?.versionNumber ?? ''; break;
        case IdentificationSchema.RevisionNumber: val = cat?.revisionNumber ?? ''; break;
        default: val = ''; break;
      }
      const sub = identAttr.attribute.append(f);
      sub.attributeDataType = 'xs:string';
      if (val) {
        sub.value = val;
      }
    }

    const desc = c.descriptiveElement;
    const descAttr = cAttr.attribute.append('DescriptiveElement');
    descAttr.attributeDataType = 'xs:string';
    addStringSubAttr(descAttr, 'valueDeterminationProcess', desc?.valueDeterminationProcess);
    addStringSubAttr(descAttr, 'representivity', desc?.representivity);

    // Setpoint value (Bild 6): value/unit compound
    const setpointAttr = descAttr.attribute.append('setpointValue');
    setpointAttr.attributeDataType = 'xs:string';
    addStringSubAttr(setpointAttr, 'value', desc?.setpointValue?.value);
    addStringSubAttr(setpointAttr, 'unit', desc?.setpointValue?.unit);

    // Validity limits (Bild 6): validityLimit_N {limitType, from, to}
    const validityAttr = descAttr.attribute.append('validityLimits');
    validityAttr.attributeDataType = 'xs:string';
    for (let v = 0; v < (desc?.validityLimits.length ?? 0); v++) {
      const lim = desc.validityLimits[v];
      const limAttr = validityAttr.attribute.append(`validityLimit_${v + 1}`);
      limAttr.attributeDataType = 'xs:string';
      addStringSubAttr(limAttr, 'limitType', lim.limitType);
      addStringSubAttr(limAttr, 'from', lim.from);
      addStringSubAttr(limAttr, 'to', lim.to);
    }

    // Actual values (Bild 6): actualValue_N {value, unit}
    const actualAttr = descAttr.attribute.append('actualValues');
    actualAttr.attributeDataType = 'xs:string';
    for (let v = 0; v < (desc?.actualValues.length ?? 0); v++) {
      const av = desc.actualValues[v];
      const avAttr = actualAttr.attribute.append(`actualValue_${v + 1}`);
      avAttr.attributeDataType = 'xs:string';
      addStringSubAttr(avAttr, 'value', av.value);
      addStringSubAttr(avAttr, 'unit', av.unit);
    }

    const rel = c.relationalElement;
    const relAttr = cAttr.attribute.append('RelationalElement');
    relAttr.attributeDataType = 'xs:string';
    addStringSubAttr(relAttr, 'view', rel?.view);
    addStringSubAttr(relAttr, 'model', rel?.model);
    addStringSubAttr(relAttr, 'regulationsForRelationalGeneration', rel?.regulationsForRelationalGeneration);
  }
}

function setViewInformation(ie, visual, options = null) {
  const attr = ie.attribute.item('ViewInformation');
  if (attr == null) {
    MapperTrace.info(options, `SetViewInformation: ie='${text(ie.id)}' has no ViewInformation container — skipped`);
    return;
  }

  const pos = attr.attribute.item('position');
  if (pos != null) {
    setDoubleSubAttr(pos, 'x', visual.x);
    setDoubleSubAttr(pos, 'y', visual.y);
  }
  setDoubleSubAttr(attr, 'width', visual.width);
  setDoubleSubAttr(attr, 'height', visual.height);
  MapperTrace.info(options, `SetViewInformation: ie='${text(ie.id)}' x=${system.formatDouble(visual.x)} y=${system.formatDouble(visual.y)} w=${system.formatDouble(visual.width)} h=${system.formatDouble(visual.height)}`);
}

function setSubAttr(parent, name, value) {
  // "" for empty values, so clearing an Identification field clears it
  const attr = parent.attribute.item(name);
  if (attr != null) {
    attr.value = value ?? '';
  }
}

function setDoubleSubAttr(parent, name, value) {
  const attr = parent.attribute.item(name);
  if (attr != null) {
    attr.value = system.formatDouble(value);
  }
}

function addStringSubAttr(parent, name, value) {
  const attr = parent.attribute.append(name);
  attr.attributeDataType = 'xs:string';
  if (value) {
    attr.value = value;
  }
}

function addPortCoordinate(extIf, x, y) {
  const attr = extIf.attribute.append('PortCoordinate');
  attr.attributeDataType = 'xs:string';
  attr.refAttributeType = AttrRefs.Point;
  addDoubleAttr(attr, 'x', x);
  addDoubleAttr(attr, 'y', y);
}

function addEmptyPortCoordinate(extIf) {
  const attr = extIf.attribute.append('PortCoordinate');
  attr.attributeDataType = 'xs:string';
  attr.refAttributeType = AttrRefs.Point;
  const xAttr = attr.attribute.append('x');
  xAttr.attributeDataType = 'xs:double';
  const yAttr = attr.attribute.append('y');
  yAttr.attributeDataType = 'xs:double';
}

function addWaypointAttr(extIf, index, x, y) {
  const wpAttr = extIf.attribute.append(`Waypoint_${index}`);
  wpAttr.attributeDataType = 'xs:string';
  wpAttr.refAttributeType = AttrRefs.Waypoint;
  const wpPos = wpAttr.attribute.append('position');
  wpPos.attributeDataType = 'xs:string';
  wpPos.refAttributeType = AttrRefs.Point;
  addDoubleAttr(wpPos, 'x', x);
  addDoubleAttr(wpPos, 'y', y);
}

function addDoubleAttr(parent, name, value) {
  const attr = parent.attribute.append(name);
  attr.attributeDataType = 'xs:double';
  attr.value = system.formatDouble(value);
}

function normalizeId(id) {
  if (!id) {
    return newId();
  }
  if (id.startsWith('{') && id.endsWith('}')) {
    return id;
  }
  const guid = Guid.tryParse(id);
  if (guid !== null) {
    return guid.toString('B');
  }
  return id;
}

// -- Input validation --------------------------------------------------------

function validate(project, entries, warnings) {
  if (entries.length === 0) {
    throw new InvalidOperationException('No process entries found in JSON input.');
  }

  if (!project.entryPoint) {
    throw new InvalidOperationException('Project has no entryPoint.');
  }

  if (!entries.some((e) => e.process.id === project.entryPoint)) {
    throw new InvalidOperationException(`Entry point '${project.entryPoint}' not found in process entries.`);
  }

  // NormalizeId here (wrap) and in CaexToFpbJson (strip) are inverse for
  // GUIDs only: warn early about other IDs, for a paper trail
  for (const entry of entries) {
    if (Guid.tryParse(entry.process.id) === null) {
      warnings.push(`Non-GUID process ID '${text(entry.process.id)}' — round-trip ID normalization may not be idempotent.`);
    }
    for (const d of entry.elementData) {
      if (Guid.tryParse(d.id) === null) {
        warnings.push(`Non-GUID element ID '${text(d.id)}' (type='${text(d.type)}') — round-trip ID normalization may not be idempotent.`);
      }
    }
  }

  for (const entry of entries) {
    const hasSL = entry.elementData.some((e) => e.type === FpbTypes.SystemLimit);
    if (!hasSL) {
      warnings.push(`Process '${text(entry.process.id)}' has no SystemLimit.`);
    }

    const hasPO = entry.elementData.some((e) => e.type === FpbTypes.ProcessOperator);
    if (!hasPO) {
      warnings.push(`Process '${text(entry.process.id)}' has no ProcessOperator.`);
    }

    // Flows that reference unknown elements
    const elementIds = new Set(entry.elementData.map((e) => e.id));
    for (const flow of entry.elementData.filter((e) => ConnectionTypes.has(e.type))) {
      if (flow.sourceRef && !elementIds.has(flow.sourceRef)) {
        warnings.push(`Flow '${text(flow.id)}' references unknown source '${flow.sourceRef}'.`);
      }
      if (flow.targetRef && !elementIds.has(flow.targetRef)) {
        warnings.push(`Flow '${text(flow.id)}' references unknown target '${flow.targetRef}'.`);
      }
    }
  }
}

// -- .NET idioms ---------------------------------------------------------------

/** A value as C# interpolates it: null is "" */
function text(value) {
  return value == null ? '' : value;
}

/** char.IsWhiteSpace: the control spaces and Unicode Zs, Zl, Zp */
const WHITE_SPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000]);

/** string.IsNullOrWhiteSpace */
function isNullOrWhiteSpace(s) {
  if (s == null) {
    return true;
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!WHITE_SPACE.has(c) && !(c >= 0x2000 && c <= 0x200a)) {
      return false;
    }
  }
  return true;
}

/** string.Equals(a, b, StringComparison.OrdinalIgnoreCase) */
function equalsIgnoreCase(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

/** `x as InternalElementType` */
function asInternalElement(x) {
  return x instanceof InternalElementType ? x : null;
}

/** ToDictionary: ArgumentException on a duplicate key, as in C# */
function toDictionary(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key == null) {
      throw new ArgumentNullException('key');
    }
    if (map.has(key)) {
      throw new ArgumentException(`An item with the same key has already been added. Key: ${key}`);
    }
    map.set(key, item);
  }
  return map;
}

/** GroupBy(key).ToDictionary(g => g.Key, g => g.ToList()): groups in order of first appearance */
function groupBy(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }
  return map;
}

/**
 * Dictionary<string, T> with StringComparer.OrdinalIgnoreCase: insertion
 * order, and the first spelling of a key is the one enumerated. Nothing here
 * adds after a removal, so the order is that of the C# Dictionary.
 */
class IgnoreCaseMap {
  constructor() {
    this._map = new Map();
  }

  get size() {
    return this._map.size;
  }

  has(key) {
    return this._map.has(key.toLowerCase());
  }

  get(key) {
    const e = this._map.get(key.toLowerCase());
    return e === undefined ? undefined : e.value;
  }

  set(key, value) {
    const folded = key.toLowerCase();
    const e = this._map.get(folded);
    if (e !== undefined) {
      e.value = value;
    } else {
      this._map.set(folded, { key, value });
    }
    return this;
  }

  delete(key) {
    return this._map.delete(key.toLowerCase());
  }

  * keys() {
    for (const e of this._map.values()) {
      yield e.key;
    }
  }

  * values() {
    for (const e of this._map.values()) {
      yield e.value;
    }
  }

  * [Symbol.iterator]() {
    for (const e of this._map.values()) {
      yield [e.key, e.value];
    }
  }
}

/** HashSet<string> with StringComparer.OrdinalIgnoreCase */
class IgnoreCaseSet {
  constructor(items = []) {
    this._map = new Map();
    for (const item of items) {
      this.add(item);
    }
  }

  get size() {
    return this._map.size;
  }

  add(value) {
    const folded = value.toLowerCase();
    if (this._map.has(folded)) {
      return false;
    }
    this._map.set(folded, value);
    return true;
  }

  has(value) {
    return this._map.has(value.toLowerCase());
  }

  [Symbol.iterator]() {
    return this._map.values();
  }
}
