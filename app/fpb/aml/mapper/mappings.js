import { FpbTypes } from './types';

/**
 * Port of FpbMappings.cs with the library constants of MapperOptions.cs
 * (ObjectReferencesLibrary) and DiagramInterchangeLibrary.cs: FPB.js types to
 * AML classes and back, library names and paths.
 */

export const ObjectReferencesLibrary = Object.freeze({
  LibName: 'AutomationML_ObjectReferences_AttributeTypeLib',
  Version: '1.1.1-beta',
  FileName: 'AutomationML_ObjectReferences_AttributeTypeLib_AMLEd2_1.1.1-beta.aml',
  Alias: 'ObjectReferences',
  QualifiedLibName: 'ObjectReferences@AutomationML_ObjectReferences_AttributeTypeLib',
  RefObjAttributeTypePath: 'ObjectReferences@AutomationML_ObjectReferences_AttributeTypeLib/refObj',
  RefBaseObjAttributeTypePath: 'ObjectReferences@AutomationML_ObjectReferences_AttributeTypeLib/refBaseObj',
  RefAspectObjAttributeTypePath: 'ObjectReferences@AutomationML_ObjectReferences_AttributeTypeLib/refAspectObj',
  RefDetailObjAttributeTypePath: 'ObjectReferences@AutomationML_ObjectReferences_AttributeTypeLib/refDetailObj',
  RefAbstractObjAttributeTypePath: 'ObjectReferences@AutomationML_ObjectReferences_AttributeTypeLib/refAbstractObj'
});

export const DiagramInterchangeNames = Object.freeze({
  LibName: 'OMG_DD_AttributeTypeLib',
  Version: '0.1.0',
  FileName: 'OMG_DD_AttributeTypeLib_v0.1.aml',
  Alias: 'OMG_DD',
  QualifiedLibName: 'OMG_DD@OMG_DD_AttributeTypeLib',
  BoundsAttributeTypePath: 'OMG_DD@OMG_DD_AttributeTypeLib/DD_Bounds',
  PointAttributeTypePath: 'OMG_DD@OMG_DD_AttributeTypeLib/DD_Point',
  WaypointAttributeTypePath: 'OMG_DD@OMG_DD_AttributeTypeLib/DD_Waypoint'
});

/** Element type -> AML SystemUnitClass path (insertion order as in C#) */
export const ElementToSuc = new Map([
  [FpbTypes.Product, 'VDI_FPD_SystemUnitClassLib/FPD_Product'],
  [FpbTypes.Energy, 'VDI_FPD_SystemUnitClassLib/FPD_Energy'],
  [FpbTypes.Information, 'VDI_FPD_SystemUnitClassLib/FPD_Information'],
  [FpbTypes.ProcessOperator, 'VDI_FPD_SystemUnitClassLib/FPD_ProcessOperator'],
  [FpbTypes.TechnicalResource, 'VDI_FPD_SystemUnitClassLib/FPD_TechnicalResource'],
  [FpbTypes.SystemLimit, 'VDI_FPD_SystemUnitClassLib/FPD_SystemLimit'],
  [FpbTypes.Process, 'VDI_FPD_SystemUnitClassLib/FPD_Process']
]);

/** AML SystemUnitClass path -> element type */
export const SucToElement = new Map([...ElementToSuc].map(([type, suc]) => [suc, type]));

/**
 * StripAlias: the path without a document alias prefix ("alias@path"), so
 * documents that pull the FPD libraries in by ExternalReference resolve to
 * the same types as documents with embedded libraries.
 */
export function stripAlias(path) {
  if (!path) {
    return '';
  }
  const at = path.indexOf('@');
  return at >= 0 ? path.substring(at + 1) : path;
}

/** Flow type -> InterfaceClass paths { out, in } */
export const FlowToInterface = new Map([
  [FpbTypes.Flow, { out: 'VDI_FPD_InterfaceClassLib/FPD_FlowOut', in: 'VDI_FPD_InterfaceClassLib/FPD_FlowIn' }],
  [FpbTypes.ParallelFlow, { out: 'VDI_FPD_InterfaceClassLib/FPD_ParallelFlowOut', in: 'VDI_FPD_InterfaceClassLib/FPD_ParallelFlowIn' }],
  [FpbTypes.AlternativeFlow, { out: 'VDI_FPD_InterfaceClassLib/FPD_AlternativeFlowOut', in: 'VDI_FPD_InterfaceClassLib/FPD_AlternativeFlowIn' }],
  [FpbTypes.Usage, { out: 'VDI_FPD_InterfaceClassLib/FPD_Usage', in: 'VDI_FPD_InterfaceClassLib/FPD_Usage' }]
]);

/** InterfaceClass path -> { flowType, direction } */
export const InterfaceToFlow = new Map();
for (const [flowType, paths] of FlowToInterface) {
  InterfaceToFlow.set(paths.out, { flowType, direction: 'out' });
  if (paths.in !== paths.out) {
    InterfaceToFlow.set(paths.in, { flowType, direction: 'in' });
  }
}

/** Object types (Identification, Characteristics, visual) */
export const ObjectTypes = new Set([
  FpbTypes.Product, FpbTypes.Energy, FpbTypes.Information,
  FpbTypes.ProcessOperator, FpbTypes.TechnicalResource, FpbTypes.SystemLimit
]);

/** Connection types (sourceRef, targetRef) */
export const ConnectionTypes = new Set([
  FpbTypes.Flow, FpbTypes.ParallelFlow, FpbTypes.AlternativeFlow, FpbTypes.Usage
]);

export const StateTypes = new Set([FpbTypes.Product, FpbTypes.Energy, FpbTypes.Information]);

/** AML AttributeType references */
export const AttrRefs = Object.freeze({
  Identification: 'VDI_FPD_AttributeTypeLib/FPD_Identification',
  Characteristic: 'VDI_FPD_AttributeTypeLib/FPD_Characteristic',
  RefObj: 'VDI_FPD_AttributeTypeLib/refObj',
  Bounds: DiagramInterchangeNames.BoundsAttributeTypePath,
  Point: DiagramInterchangeNames.PointAttributeTypePath,
  Waypoint: DiagramInterchangeNames.WaypointAttributeTypePath
});

export const LibNames = Object.freeze({
  InterfaceClassLib: 'VDI_FPD_InterfaceClassLib',
  RoleClassLib: 'VDI_FPD_RoleClassLib',
  SystemUnitClassLib: 'VDI_FPD_SystemUnitClassLib',
  AttributeTypeLib: 'VDI_FPD_AttributeTypeLib',
  DIAttributeTypeLib: DiagramInterchangeNames.LibName,
  Version: '1.2.0'
});

/** AML Base Library references (AutomationML Edition 2, v2.11.0) */
const BASE_ALIAS = 'AutomationMLBaseLibrariesAMLEd22_11_0';
export const AmlBase = Object.freeze({
  Alias: BASE_ALIAS,
  Path: 'AutomationML_Base_Libraries_AMLEd2_2.11.0.aml',
  Port: BASE_ALIAS + '@AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Port',
  BaseRole: BASE_ALIAS + '@AutomationMLBaseRoleClassLib/AutomationMLBaseRole',
  Structure: BASE_ALIAS + '@AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure',
  Product: BASE_ALIAS + '@AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Product',
  Process: BASE_ALIAS + '@AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Process',
  Resource: BASE_ALIAS + '@AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Resource'
});
