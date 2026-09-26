import { ObjectReferencesLibrary } from './mappings';

/**
 * Port of ReferenceTypes.cs: the refObj family of the official
 * AutomationML_ObjectReferences_AttributeTypeLib and the helpers that read
 * them from an InternalElement.
 */

function referenceType(attributeName, attributeTypePath, parent = null, allowsHeterogeneousTargetType = false) {
  return Object.freeze({
    attributeName,
    attributeTypePath,
    parent,
    allowsHeterogeneousTargetType,
    toString: () => attributeName
  });
}

const RefObj = referenceType('refObj', ObjectReferencesLibrary.RefObjAttributeTypePath);

export const ReferenceTypes = Object.freeze({
  RefObj,
  RefBaseObj: referenceType('refBaseObj', ObjectReferencesLibrary.RefBaseObjAttributeTypePath, RefObj),
  RefAspectObj: referenceType('refAspectObj', ObjectReferencesLibrary.RefAspectObjAttributeTypePath, RefObj),
  RefDetailObj: referenceType('refDetailObj', ObjectReferencesLibrary.RefDetailObjAttributeTypePath, RefObj, true),
  RefAbstractObj: referenceType('refAbstractObj', ObjectReferencesLibrary.RefAbstractObjAttributeTypePath, RefObj, true)
});

/** All reference types, refObj first */
export const AllReferenceTypes = Object.freeze([
  ReferenceTypes.RefObj,
  ReferenceTypes.RefBaseObj,
  ReferenceTypes.RefAspectObj,
  ReferenceTypes.RefDetailObj,
  ReferenceTypes.RefAbstractObj
]);

/** ReferenceType.IsOrInheritsFrom */
export function isOrInheritsFrom(type, ancestor) {
  for (let t = type; t; t = t.parent) {
    if (t === ancestor) {
      return true;
    }
  }
  return false;
}

function attributeValue(ie, name) {
  const attribute = ie.attribute.item(name);
  return attribute ? attribute.value : null;
}

/** GetReferenceValue: the value of one reference type, or null if missing or empty */
export function getReferenceValue(ie, refType) {
  if (!ie || !refType) {
    return null;
  }
  const v = attributeValue(ie, refType.attributeName);
  return v ? v : null;
}

/** EnumerateReferences: every reference attribute present, as { type, value } */
export function enumerateReferences(ie) {
  const found = [];
  if (!ie) {
    return found;
  }
  for (const refType of AllReferenceTypes) {
    const v = attributeValue(ie, refType.attributeName);
    if (v) {
      found.push({ type: refType, value: v });
    }
  }
  return found;
}

/**
 * GetRefObjOrDerived: refObj, else the first present type derived from it
 * (documents that use the official type names as attribute names)
 */
export function getRefObjOrDerived(ie) {
  if (!ie) {
    return null;
  }
  for (const refType of AllReferenceTypes) {
    if (!isOrInheritsFrom(refType, ReferenceTypes.RefObj)) {
      continue;
    }
    const v = attributeValue(ie, refType.attributeName);
    if (v) {
      return v;
    }
  }
  return null;
}
