import { FpbTypes } from './mapper/types';
import { ElementToSuc, SucToElement, InterfaceToFlow, StateTypes, stripAlias } from './mapper/mappings.js';
import { getRefObjOrDerived } from './mapper/references.js';
import { walkDocumentInternalElements, walkInternalElements } from './mapper/walker.js';

/**
 * Port of ForeignLinks.cs and of FpdElementIndex and AmlLinkList of the
 * plugin AMLFPB.js (B19): which InternalLinks the AML export removes from the
 * file when an element is deleted, per layer and element of the diagram. The
 * web app's delete question names them, as the plugin's does with the C#
 * list; the oracle (tools/aml-oracle, kind "foreignlinks") holds the port to
 * the C# mapper.
 */

const FPD_PORT = 'VDI_FPD_InterfaceClassLib/FPD_Port';
const PROCESS_SUC = ElementToSuc.get(FpbTypes.Process);
const OPERATOR_SUC = ElementToSuc.get(FpbTypes.ProcessOperator);

/** The id without braces, as the C# Bare */
const bare = (id) => (id || '').trim().replace(/^\{+/, '').replace(/\}+$/, '');
/** OrdinalIgnoreCase */
const key = (id) => bare(id).toLowerCase();

/**
 * ForeignLinks.Find: for each element of the hierarchy, the links deleting it
 * removes from the document. Flows of the model do not count.
 *
 * - An element (a direct child of a process with an FPD class) goes with
 *   everything below it: a link counts when it is stored outside and one side
 *   lies in the element, its child elements or their interfaces, or when it is
 *   stored inside and not both sides lie inside.
 * - A process (the layer of a decomposed operator) counts only for itself and
 *   its interfaces; its elements have their own entries. A link stored in the
 *   process counts when no side lies in one of its elements.
 *
 * Partner sides: an interface id first, else "element id:interface name".
 *
 * @return {Array<{ elementId: string, elementName: string, links: Array<{ link: string, owner: string }> }>}
 */
export function findForeignLinks(doc, ih) {
  if (!ih) {
    return [];
  }
  const processes = [...ih.internalElement].filter((ie) => stripAlias(ie.refBaseSystemUnitPath) === PROCESS_SUC);

  // the deletable unit each object belongs to, and the process each element lies in
  const unitOfElement = new Map();
  const unitOfInterface = new Map();
  const processOfObject = new Map();
  const fpdElements = new Set();
  const units = [];

  for (const process of processes) {
    const processUnit = { element: process, process: null, links: [] };
    units.push(processUnit);
    unitOfElement.set(key(process.id), processUnit);
    forEachInterface(process.externalInterface, (iface) => unitOfInterface.set(key(iface.id), processUnit));
    walkInternalElements(process.internalElement, (ie) => processOfObject.set(key(ie.id), process));

    for (const element of process.internalElement) {
      const type = SucToElement.get(stripAlias(element.refBaseSystemUnitPath));
      if (!type || type === FpbTypes.Process) {
        continue;
      }
      const unit = { element, process, links: [] };
      units.push(unit);
      fpdElements.add(key(element.id));
      walkInternalElements([element], (ie) => {
        unitOfElement.set(key(ie.id), unit);
        forEachInterface(ie.externalInterface, (iface) => unitOfInterface.set(key(iface.id), unit));
      });
    }
  }

  // every interface and every element of the document by id, to resolve partner sides
  const interfaces = new Map();
  const elements = new Map();
  walkDocumentInternalElements(doc, (ie) => {
    if (ie.id) {
      elements.set(key(ie.id), ie);
    }
    forEachInterface(ie.externalInterface, (iface) => {
      if (iface.id) {
        interfaces.set(key(iface.id), { iface, owner: ie });
      }
    });
  });

  const isFlowPort = (iface, owner) => {
    if (!fpdElements.has(key(owner.id))) {
      return false;
    }
    const path = stripAlias(iface.refBaseClassPath);
    return InterfaceToFlow.has(path) || path === FPD_PORT;
  };

  const resolve = (reference) => {
    if (!reference) {
      return { unit: null, flowPort: false };
    }
    // an interface id first: ids such as "urn:uuid:..." contain colons too
    const hit = interfaces.get(key(reference));
    if (hit) {
      return { unit: unitOfInterface.get(key(reference)) || null, flowPort: isFlowPort(hit.iface, hit.owner) };
    }
    const colon = reference.lastIndexOf(':');
    if (colon <= 0) {
      return { unit: null, flowPort: false };
    }
    const elementId = key(reference.substring(0, colon));
    const name = reference.substring(colon + 1);
    const owner = elements.get(elementId);
    const iface = owner ? [...owner.externalInterface].find((i) => i.name === name) : null;
    return { unit: unitOfElement.get(elementId) || null, flowPort: !!iface && isFlowPort(iface, owner) };
  };

  walkDocumentInternalElements(doc, (holder) => {
    for (const link of holder.internalLink) {
      const a = resolve(link.refPartnerSideA);
      const b = resolve(link.refPartnerSideB);
      if (a.flowPort && b.flowPort) {
        continue;
      }
      const stored = unitOfElement.get(key(holder.id)) || null;
      const entry = { link: link.name || '', owner: holder.name || holder.id || '' };

      for (const unit of units) {
        const sideIn = a.unit === unit || b.unit === unit;
        let counts;
        if (unit.process === null) {
          // a process: stored outside its layer and pointing at it, or stored in it and touching none of its elements
          const storedOnLayer = stored === unit || processOfObject.get(key(holder.id)) === unit.element;
          const touchesElement = (a.unit && a.unit.process) === unit.element || (b.unit && b.unit.process) === unit.element;
          counts = storedOnLayer ? stored === unit && !touchesElement : sideIn;
        } else {
          counts = stored === unit ? !(a.unit === unit && b.unit === unit) : sideIn;
        }
        if (counts && !unit.links.some((l) => l.link === entry.link && l.owner === entry.owner)) {
          unit.links.push(entry);
        }
      }
    }
  });

  return units
    .filter((unit) => unit.links.length > 0)
    .map((unit) => ({ elementId: bare(unit.element.id), elementName: unit.element.name || '', links: unit.links }));
}

/**
 * FpdElementIndex.Build: which object of the hierarchy is which element on
 * which layer of the diagram. A sub-process carries the id of its operator
 * (refObj of the process, else the operator whose refProcess names it); the
 * copy of a boundary state on a lower layer is the state its refObj names.
 *
 * @return {{ get(objectId: string): ({ fpbId: string, processId: string }|null) }}
 */
export function buildFpdElementIndex(ih) {
  const byObject = new Map();
  const add = (objectId, fpbId, processId) => {
    if (objectId) {
      byObject.set(key(objectId), { fpbId, processId });
    }
  };
  const processes = ih ? [...ih.internalElement].filter((ie) => stripAlias(ie.refBaseSystemUnitPath) === PROCESS_SUC) : [];

  // operator → the sub-process it names (refProcess), for sub-processes without refObj
  const operatorOf = new Map();
  for (const process of processes) {
    for (const ie of process.internalElement) {
      if (stripAlias(ie.refBaseSystemUnitPath) !== OPERATOR_SUC) {
        continue;
      }
      const attribute = ie.attribute.item('refProcess');
      const named = bare(attribute ? attribute.value : '');
      if (named) {
        operatorOf.set(named.toLowerCase(), bare(ie.id));
      }
    }
  }

  for (const process of processes) {
    const processBare = bare(process.id);
    const parentOperator = bare(getRefObjOrDerived(process));
    const processId = parentOperator || operatorOf.get(processBare.toLowerCase()) || processBare;
    add(processBare, processId, processId);

    for (const ie of process.internalElement) {
      const type = SucToElement.get(stripAlias(ie.refBaseSystemUnitPath));
      if (!type || type === FpbTypes.Process) {
        continue;
      }
      let fpbId = bare(ie.id);
      if (StateTypes.has(type)) {
        const shared = bare(getRefObjOrDerived(ie));
        if (shared) {
          fpbId = shared;
        }
      }
      add(bare(ie.id), fpbId, processId);
    }

    for (const link of process.internalLink) {
      const linkId = bare(link.id);
      if (linkId) {
        add(linkId, linkId, processId);
      }
    }
  }

  return {
    get: (objectId) => byObject.get(key(objectId)) || null
  };
}

/**
 * AmlLinkList.For: the found links placed on the layer and element of the
 * diagram, as setAmlLinks takes them and sorted the same way; objects the
 * diagram does not show are left out.
 *
 * @return {Array<{ processId: string, elementId: string, name: string, link: string, owner: string }>}
 */
export function amlLinkList(found, index) {
  const list = [];
  for (const element of found) {
    const hit = index.get(element.elementId);
    if (!hit) {
      continue;
    }
    for (const l of element.links) {
      list.push({ processId: hit.processId, elementId: hit.fpbId, name: element.elementName, link: l.link, owner: l.owner });
    }
  }
  // as Sorted: layer, element, link, owner, OrdinalIgnoreCase
  const key = (e) => [e.processId, e.elementId, e.link, e.owner].map((v) => v.toUpperCase());
  return list.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) {
        return ka[i] < kb[i] ? -1 : 1;
      }
    }
    return 0;
  });
}

function forEachInterface(roots, visit) {
  for (const iface of roots) {
    visit(iface);
    forEachInterface(iface.externalInterface, visit);
  }
}
