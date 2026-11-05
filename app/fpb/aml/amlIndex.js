import { markText } from '../i18n/markText';
import { ElementToSuc, InterfaceToFlow, stripAlias } from './mapper/mappings.js';
import { getRefObjOrDerived } from './mapper/references.js';
import { walkDocumentInternalElements, walkInternalElements } from './mapper/walker.js';
import { InstanceHierarchyType } from 'amlengine-js';

/**
 * What an AML file holds for each FPB element: where it stands in the file
 * (path, ID, class, roles), its flows, and what goes beyond FPD: attributes,
 * interfaces and the InternalLinks that reach it from elsewhere (a plant
 * hierarchy, links drawn in another tool). The properties panel shows it
 * (read only); deleting an element with such links asks first, since the AML
 * export removes those links with it.
 *
 * Keyed by the FPB element id, as CaexToFpbJson gives it: the AML id without
 * braces; a boundary state copy on a sub-process layer counts for the state
 * its refObj names.
 */

/** Attributes FPD itself writes (FpdLibraries) */
const FPD_ATTRIBUTES = new Set(['Identification', 'Characteristics', 'ViewInformation', 'refObj', 'refProcess']);
const FPD_SUCS = new Set([...ElementToSuc.values()].filter((suc) => !suc.endsWith('/FPD_Process')));
const STATE_SUCS = new Set(['VDI_FPD_SystemUnitClassLib/FPD_Product', 'VDI_FPD_SystemUnitClassLib/FPD_Energy', 'VDI_FPD_SystemUnitClassLib/FPD_Information']);
const FPD_PORT = 'VDI_FPD_InterfaceClassLib/FPD_Port';

const bare = (id) => (id && id.length >= 2 && id[0] === '{' && id[id.length - 1] === '}' ? id.substring(1, id.length - 1) : id || '');
const key = (id) => bare(id).toLowerCase();

const isFpdInterface = (iface) => {
  const path = stripAlias(iface.refBaseClassPath);
  return InterfaceToFlow.has(path) || path === FPD_PORT;
};

/**
 * @param doc CAEXDocument of the kept file
 * @param ih its FPD InstanceHierarchy, or null
 * @return {Map<string, { name, amlId, path, systemUnitClass, roles, copies, flows, attributes, interfaces, links }>}
 *   `links` are the foreign ones (not flows of the model); `copies` the paths of
 *   the copies of a boundary state on sub-process layers
 */
export function buildAmlIndex(doc, ih) {
  const index = new Map();
  if (!ih) {
    return index;
  }

  // FPB id of every FPD element, and its interfaces
  const fpbIdOfElement = new Map();
  const interfaces = new Map();
  walkInternalElements(ih.internalElement, (ie) => {
    const suc = stripAlias(ie.refBaseSystemUnitPath);
    if (!FPD_SUCS.has(suc)) {
      return;
    }
    const shared = STATE_SUCS.has(suc) ? getRefObjOrDerived(ie) : null;
    const fpbId = bare(shared || ie.id);
    fpbIdOfElement.set(key(ie.id), fpbId);

    const entry = index.get(fpbId) || {
      name: ie.name, amlId: ie.id, path: pathOf(ie), systemUnitClass: ie.refBaseSystemUnitPath || '',
      roles: rolesOf(ie), copies: [], flows: [], attributes: [], interfaces: [], links: []
    };
    // a boundary state copy may be named differently: the original names it
    if (bare(ie.id) === fpbId) {
      if (index.has(fpbId)) {
        entry.copies.push(entry.path);
      }
      Object.assign(entry, { name: ie.name, amlId: ie.id, path: pathOf(ie), systemUnitClass: ie.refBaseSystemUnitPath || '', roles: rolesOf(ie) });
    } else if (index.has(fpbId)) {
      entry.copies.push(pathOf(ie));
    }
    index.set(fpbId, entry);

    for (const attribute of ie.attribute) {
      if (!FPD_ATTRIBUTES.has(attribute.name)) {
        collectAttribute(entry.attributes, attribute, attribute.name);
      }
    }
    forEachInterface(ie, (iface) => {
      interfaces.set(key(iface.id), { ie, iface, fpbId });
      if (!isFpdInterface(iface)) {
        entry.interfaces.push({ name: iface.name, class: iface.refBaseClassPath || '' });
      }
    });
  });

  // every interface of the document, to name the partner of a link
  const allInterfaces = new Map();
  walkDocumentInternalElements(doc, (ie) => {
    forEachInterface(ie, (iface) => allInterfaces.set(key(iface.id), { ie, iface }));
  });

  // InternalLinks anywhere in the document that reach an FPD element. The
  // flows of the model join two FPD ports; everything else is foreign
  walkDocumentInternalElements(doc, (owner) => {
    for (const link of owner.internalLink) {
      const a = resolve(link.refPartnerSideA, interfaces, fpbIdOfElement);
      const b = resolve(link.refPartnerSideB, interfaces, fpbIdOfElement);
      if (!a && !b) {
        continue;
      }
      const flow = !!(a && b && a.iface && b.iface && isFpdInterface(a.iface) && isFpdInterface(b.iface));
      [[a, link.refPartnerSideB, b], [b, link.refPartnerSideA, a]].forEach(([side, otherRef, other]) => {
        if (!side) {
          return;
        }
        const entry = index.get(side.fpbId);
        if (!entry) {
          return;
        }
        const partnerSide = other || allInterfaces.get(key(otherRef));
        if (flow) {
          const own = InterfaceToFlow.get(stripAlias(side.iface.refBaseClassPath));
          entry.flows.push({
            link: link.name,
            type: own ? own.flowType : '',
            direction: own ? own.direction : '',
            partner: describe(partnerSide, otherRef)
          });
        } else if (!entry.links.some((l) => l.link === link.name && l.owner === owner.name)) {
          entry.links.push({
            link: link.name,
            owner: owner.name,
            partner: describe(partnerSide, otherRef),
            hierarchy: partnerSide && partnerSide.ie ? hierarchyOf(partnerSide.ie) : ''
          });
        }
      });
    }
  });

  return index;
}

/** Names from the InstanceHierarchy down to the element */
function pathOf(ie) {
  const names = [];
  for (let node = ie; node; node = node.caexParent) {
    names.unshift(node.name);
    if (node instanceof InstanceHierarchyType) {
      break;
    }
  }
  return names;
}

function hierarchyOf(ie) {
  for (let node = ie; node; node = node.caexParent) {
    if (node instanceof InstanceHierarchyType) {
      return node.name;
    }
  }
  return '';
}

function rolesOf(ie) {
  const roles = [];
  for (const requirement of ie.roleRequirements) {
    if (requirement.refBaseRoleClassPath) {
      roles.push(requirement.refBaseRoleClassPath);
    }
  }
  return roles;
}

/** A partner side: an interface id (CAEX 3.0) or "element id:interface name" (CAEX 2.15) */
function resolve(side, interfaces, fpbIdOfElement) {
  if (!side) {
    return null;
  }
  const byInterface = interfaces.get(key(side));
  if (byInterface) {
    return byInterface;
  }
  const colon = side.lastIndexOf(':');
  if (colon > 0) {
    const fpbId = fpbIdOfElement.get(key(side.substring(0, colon)));
    if (fpbId) {
      return { fpbId, name: side.substring(colon + 1) };
    }
  }
  return null;
}

/** "element (interface)", the bare reference when it names nothing in the document */
function describe(side, reference) {
  if (!side) {
    return reference || '';
  }
  if (side.iface) {
    return side.ie.name + ' (' + side.iface.name + ')';
  }
  return side.name;
}

function collectAttribute(into, attribute, path) {
  const value = attribute.value;
  // a structure without a value of its own shows through its children
  if ((value != null && value !== '') || !hasChildren(attribute)) {
    into.push({ path, value: value == null ? '' : value, unit: attribute.unit || '' });
  }
  for (const child of attribute.attribute) {
    collectAttribute(into, child, path + '/' + child.name);
  }
}

function hasChildren(attribute) {
  for (const child of attribute.attribute) { // eslint-disable-line no-unused-vars
    return true;
  }
  return false;
}

function forEachInterface(owner, visit) {
  for (const iface of owner.externalInterface) {
    visit(iface);
    forEachInterface(iface, visit);
  }
}

const LIBRARY_KINDS = [
  ['instanceHierarchy', null],
  ['systemUnitClassLib', markText('System unit classes')],
  ['roleClassLib', markText('Role classes')],
  ['interfaceClassLib', markText('Interface classes')],
  ['attributeTypeLib', markText('Attribute types')]
];

/** Libraries FPD brings along (FpdLibraries, OMG_DD) */
const isFpdLibrary = (name) => /^VDI_FPD_/.test(name || '') || name === 'OMG_DD_AttributeTypeLib';

/**
 * Everything the kept file holds, for the overview: its hierarchies (the open
 * process view, other process views, the rest), libraries, external
 * references and the elements that carry more than FPD.
 *
 * @param fpdHierarchies the FPD InstanceHierarchies (CaexToFpbJson)
 */
export function buildAmlOverview(doc, ih, index, fpdHierarchies) {
  const caex = doc.caexFile;
  const fpdIds = new Set((fpdHierarchies || []).map((h) => h.id));

  const hierarchies = [];
  for (const hierarchy of caex.instanceHierarchy) {
    let elements = 0;
    walkInternalElements(hierarchy.internalElement, () => {
      elements++;
    });
    hierarchies.push({
      id: hierarchy.id,
      name: hierarchy.name,
      elements,
      fpd: fpdIds.has(hierarchy.id),
      open: !!ih && hierarchy.id === ih.id
    });
  }

  const libraries = [];
  LIBRARY_KINDS.forEach(([kind, label]) => {
    if (!label) {
      return;
    }
    for (const library of caex[kind]) {
      libraries.push({ kind: label, name: library.name, fpd: isFpdLibrary(library.name) });
    }
  });

  const externalReferences = [];
  for (const reference of caex.externalReference) {
    externalReferences.push({ alias: reference.alias, path: reference.path });
  }

  const elements = [];
  for (const [id, entry] of index) {
    if (entry.attributes.length || entry.interfaces.length || entry.links.length) {
      elements.push({ id, name: entry.name, attributes: entry.attributes.length, interfaces: entry.interfaces.length, links: entry.links.length });
    }
  }

  return { schemaVersion: caex.schemaVersion || '', hierarchies, libraries, externalReferences, elements };
}
