import { AmlBase, AttrRefs, DiagramInterchangeNames, LibNames, ObjectReferencesLibrary } from './mappings';
import { IdentificationSchema } from './types';
import { resolveOptions } from './options';

/**
 * Port of FpdLibraries.cs: the FPD libraries built with the engine. The
 * RoleClassLib is flat with explicit RefBaseClassPath inheritance, the
 * SystemUnitClassLib hierarchical (FPD_Object, FPD_State, concrete classes)
 * with mirrored attributes and SupportedRoleClass. Every Ensure step is a
 * no-op when its library exists.
 */

/** EnsureLibraries */
export function ensureLibraries(caex, options) {
  options = resolveOptions(options);
  // A document that already carries the FPD libraries keeps its layout, so the
  // ObjectReferences ExternalReference is only added when they are created here.
  const fresh = caex.systemUnitClassLib.item(LibNames.SystemUnitClassLib) == null;
  ensureExternalReference(caex, AmlBase.Alias, AmlBase.Path);
  if (options.useObjectReferencesLibrary && fresh) {
    ensureExternalReference(caex, ObjectReferencesLibrary.Alias, ObjectReferencesLibrary.FileName);
  }
  if (fresh) {
    ensureExternalReference(caex, DiagramInterchangeNames.Alias, DiagramInterchangeNames.FileName);
  }
  ensureInterfaceClassLib(caex);
  ensureRoleClassLib(caex, options);
  ensureAttributeTypeLib(caex, options);
  ensureSystemUnitClassLib(caex, options);
}

// -- 0. ExternalReferences ---------------------------------------------------

function ensureExternalReference(caex, alias, path) {
  for (const er of caex.externalReference) {
    if (er.alias === alias) {
      return;
    }
  }
  const extRef = caex.externalReference.append();
  extRef.alias = alias;
  extRef.path = path;
}

// -- 1. InterfaceClassLib ----------------------------------------------------

function ensureInterfaceClassLib(caex) {
  if (caex.interfaceClassLib.item(LibNames.InterfaceClassLib) != null) {
    return;
  }

  const icl = caex.interfaceClassLib.append(LibNames.InterfaceClassLib);
  icl.description = 'Flow and usage port interfaces for the Formalized Process Description (FPD).';
  icl.version = LibNames.Version;

  const port = icl.interfaceClass.append('FPD_Port');
  port.description = 'Abstract base port for all FPD connections.';
  port.version = LibNames.Version;
  port.refBaseClassPath = AmlBase.Port;
  addPointAttr(port, 'PortCoordinate');

  for (const name of [
    'FPD_FlowIn', 'FPD_FlowOut',
    'FPD_Usage',
    'FPD_ParallelFlowIn', 'FPD_ParallelFlowOut',
    'FPD_AlternativeFlowIn', 'FPD_AlternativeFlowOut'
  ]) {
    const ic = icl.interfaceClass.append(name);
    ic.version = LibNames.Version;
    ic.refBaseClassPath = `${LibNames.InterfaceClassLib}/FPD_Port`;
  }
}

// -- 2. RoleClassLib (flat with explicit RefBaseClassPath) -------------------

function ensureRoleClassLib(caex, options) {
  if (caex.roleClassLib.item(LibNames.RoleClassLib) != null) {
    return;
  }

  const rcl = caex.roleClassLib.append(LibNames.RoleClassLib);
  rcl.description = 'Semantic model of the FPD per VDI/VDE 3682. Flat layout with explicit inheritance via RefBaseClassPath.';
  rcl.version = LibNames.Version;

  const proc = rcl.roleClass.append('FPD_Process');
  proc.description = 'Process (Part 2, Fig. 2). Aggregates states (2..*), system limit (1), and process operators (1..*).';
  proc.version = LibNames.Version;
  proc.refBaseClassPath = AmlBase.Structure;
  addRefAttr(proc, 'refObj', options.effectiveSubProcessRefObjAttributeTypePath, options,
    'Reference to the parent process operator whose decomposition this process represents (refAbstractObj: this process is the detail representation of the operator).');

  const sl = rcl.roleClass.append('FPD_SystemLimit');
  sl.description = 'System limit (Part 1, p. 9). Peer aggregate of the process, not a container.';
  sl.version = LibNames.Version;
  addIdentificationAttr(sl);
  addBoundsAttr(sl, 'ViewInformation');

  const obj = rcl.roleClass.append('FPD_Object');
  obj.description = 'Abstract base for all FPB objects (Part 1, p. 4: product, energy, information, process operator, technical resource).';
  obj.version = LibNames.Version;
  obj.refBaseClassPath = AmlBase.BaseRole;
  addIdentificationAttr(obj);
  const charAttr = addAttr(obj, 'Characteristics', 'xs:string');
  charAttr.description = 'Container for characteristics (Part 2, Fig. 3).';
  addBoundsAttr(obj, 'ViewInformation');

  const state = rcl.roleClass.append('FPD_State');
  state.description = 'Abstract state (Part 2, Fig. 2). Inherits Identification and Characteristics from FPD_Object.';
  state.version = LibNames.Version;
  state.refBaseClassPath = `${LibNames.RoleClassLib}/FPD_Object`;
  addRefAttr(state, 'refObj', options.effectiveBoundaryStateRefObjAttributeTypePath, options,
    'Reference to the original state instance that this boundary state represents (refBaseObj: same logical object, complementary view). Always points to the top-level original, regardless of decomposition depth.');

  for (const name of ['FPD_Product', 'FPD_Energy', 'FPD_Information']) {
    const s = rcl.roleClass.append(name);
    s.version = LibNames.Version;
    s.refBaseClassPath = `${LibNames.RoleClassLib}/FPD_State`;
  }

  const po = rcl.roleClass.append('FPD_ProcessOperator');
  po.description = 'Process operator (Part 2, Fig. 2). Inherits Identification and Characteristics from FPD_Object.';
  po.version = LibNames.Version;
  po.refBaseClassPath = `${LibNames.RoleClassLib}/FPD_Object`;
  addRefAttr(po, 'refProcess', options.effectiveRefProcessAttributeTypePath, options,
    'Reference to the child process that decomposes this operator (refDetailObj: the child process is the more detailed representation). Empty if the operator is not further decomposed.');

  const tr = rcl.roleClass.append('FPD_TechnicalResource');
  tr.description = 'Technical resource (Part 1, p. 9). Located outside the system limit, associated via usage.';
  tr.version = LibNames.Version;
  tr.refBaseClassPath = `${LibNames.RoleClassLib}/FPD_Object`;
}

// -- 3. AttributeTypeLib -----------------------------------------------------

function ensureAttributeTypeLib(caex, options) {
  if (caex.attributeTypeLib.item(LibNames.AttributeTypeLib) != null) {
    return;
  }

  const atl = caex.attributeTypeLib.append(LibNames.AttributeTypeLib);
  atl.version = LibNames.Version;

  const ident = atl.attributeType.append('FPD_Identification');
  ident.attributeDataType = 'xs:string';
  ident.version = LibNames.Version;
  for (const f of IdentificationSchema.Fields) {
    addAttr(ident, f, 'xs:string');
  }

  const charac = atl.attributeType.append('FPD_Characteristic');
  charac.attributeDataType = 'xs:string';
  charac.version = LibNames.Version;

  const cIdent = addAttr(charac, 'Category', 'xs:string');
  cIdent.refAttributeType = AttrRefs.Identification;
  for (const f of IdentificationSchema.Fields) {
    addAttr(cIdent, f, 'xs:string');
  }

  // DescriptiveElement per VDI 3682 Blatt 2 Bild 6; the templates document the
  // shape of the indexed children added per instance
  const desc = addAttr(charac, 'DescriptiveElement', 'xs:string');
  addAttr(desc, 'valueDeterminationProcess', 'xs:string');
  addAttr(desc, 'representivity', 'xs:string');
  const setpoint = addAttr(desc, 'setpointValue', 'xs:string');
  addAttr(setpoint, 'value', 'xs:string');
  addAttr(setpoint, 'unit', 'xs:string');
  const validity = addAttr(desc, 'validityLimits', 'xs:string');
  const validityTpl = addAttr(validity, 'validityLimit', 'xs:string');
  addAttr(validityTpl, 'limitType', 'xs:string');
  addAttr(validityTpl, 'from', 'xs:double');
  addAttr(validityTpl, 'to', 'xs:double');
  const actual = addAttr(desc, 'actualValues', 'xs:string');
  const actualTpl = addAttr(actual, 'actualValue', 'xs:string');
  addAttr(actualTpl, 'value', 'xs:string');
  addAttr(actualTpl, 'unit', 'xs:string');

  const rel = addAttr(charac, 'RelationalElement', 'xs:string');
  for (const f of ['view', 'model', 'regulationsForRelationalGeneration']) {
    addAttr(rel, f, 'xs:string');
  }

  // Legacy layout only: with the ObjectReferences library the reference
  // attributes are typed by that library
  if (!options.useObjectReferencesLibrary) {
    const refObjType = atl.attributeType.append('refObj');
    refObjType.attributeDataType = 'xs:string';
    refObjType.description = 'Generic IDREF attribute. Semantics depend on the carrying element (see RoleClassLib descriptions).';
    refObjType.version = LibNames.Version;
  }
}

// -- 4. SystemUnitClassLib (hierarchical, mirrored attributes) ---------------

function ensureSystemUnitClassLib(caex, options) {
  if (caex.systemUnitClassLib.item(LibNames.SystemUnitClassLib) != null) {
    return;
  }

  const sucl = caex.systemUnitClassLib.append(LibNames.SystemUnitClassLib);
  sucl.description = 'Instantiation templates with mirrored attributes and SUC inheritance.';
  sucl.version = LibNames.Version;

  const procSuc = sucl.systemUnitClass.append('FPD_Process');
  procSuc.version = LibNames.Version;
  addRefAttr(procSuc, 'refObj', options.effectiveSubProcessRefObjAttributeTypePath, options, null);
  procSuc.supportedRoleClass.append().refRoleClassPath = `${LibNames.RoleClassLib}/FPD_Process`;
  procSuc.supportedRoleClass.append().refRoleClassPath = AmlBase.Structure;

  const slSuc = sucl.systemUnitClass.append('FPD_SystemLimit');
  slSuc.version = LibNames.Version;
  addIdentificationAttr(slSuc);
  addBoundsAttr(slSuc, 'ViewInformation');
  slSuc.supportedRoleClass.append().refRoleClassPath = `${LibNames.RoleClassLib}/FPD_SystemLimit`;

  const objSuc = sucl.systemUnitClass.append('FPD_Object');
  objSuc.version = LibNames.Version;
  addIdentificationAttr(objSuc);
  addAttr(objSuc, 'Characteristics', 'xs:string');
  addBoundsAttr(objSuc, 'ViewInformation');
  objSuc.supportedRoleClass.append().refRoleClassPath = `${LibNames.RoleClassLib}/FPD_Object`;

  const stateSuc = sucl.systemUnitClass.append('FPD_State');
  stateSuc.version = LibNames.Version;
  stateSuc.refBaseClassPath = `${LibNames.SystemUnitClassLib}/FPD_Object`;
  addRefAttr(stateSuc, 'refObj', options.effectiveBoundaryStateRefObjAttributeTypePath, options, null);
  stateSuc.supportedRoleClass.append().refRoleClassPath = `${LibNames.RoleClassLib}/FPD_State`;

  // Only FPD_Product gets the AML base Product role
  for (const name of ['FPD_Product', 'FPD_Energy', 'FPD_Information']) {
    const suc = sucl.systemUnitClass.append(name);
    suc.version = LibNames.Version;
    suc.refBaseClassPath = `${LibNames.SystemUnitClassLib}/FPD_State`;
    suc.supportedRoleClass.append().refRoleClassPath = `${LibNames.RoleClassLib}/${name}`;
    if (name === 'FPD_Product') {
      suc.supportedRoleClass.append().refRoleClassPath = AmlBase.Product;
    }
  }

  const poSuc = sucl.systemUnitClass.append('FPD_ProcessOperator');
  poSuc.version = LibNames.Version;
  poSuc.refBaseClassPath = `${LibNames.SystemUnitClassLib}/FPD_Object`;
  addRefAttr(poSuc, 'refProcess', options.effectiveRefProcessAttributeTypePath, options, null);
  poSuc.supportedRoleClass.append().refRoleClassPath = `${LibNames.RoleClassLib}/FPD_ProcessOperator`;
  poSuc.supportedRoleClass.append().refRoleClassPath = AmlBase.Process;

  const trSuc = sucl.systemUnitClass.append('FPD_TechnicalResource');
  trSuc.version = LibNames.Version;
  trSuc.refBaseClassPath = `${LibNames.SystemUnitClassLib}/FPD_Object`;
  trSuc.supportedRoleClass.append().refRoleClassPath = `${LibNames.RoleClassLib}/FPD_TechnicalResource`;
  trSuc.supportedRoleClass.append().refRoleClassPath = AmlBase.Resource;
}

// -- Helpers -----------------------------------------------------------------

function addAttr(parent, name, dataType) {
  const attr = parent.attribute.append(name);
  attr.attributeDataType = dataType;
  return attr;
}

function addPointAttr(parent, name) {
  const attr = parent.attribute.append(name);
  attr.attributeDataType = 'xs:string';
  attr.refAttributeType = AttrRefs.Point;
  addAttr(attr, 'x', 'xs:double');
  addAttr(attr, 'y', 'xs:double');
}

function addBoundsAttr(parent, name) {
  const attr = parent.attribute.append(name);
  attr.attributeDataType = 'xs:string';
  attr.refAttributeType = AttrRefs.Bounds;
  addPointAttr(attr, 'position');
  addAttr(attr, 'width', 'xs:double');
  addAttr(attr, 'height', 'xs:double');
}

function addIdentificationAttr(parent) {
  const attr = parent.attribute.append(IdentificationSchema.AttributeName);
  attr.attributeDataType = 'xs:string';
  attr.refAttributeType = AttrRefs.Identification;
  for (const f of IdentificationSchema.Fields) {
    addAttr(attr, f, 'xs:string');
  }
}

/** A reference attribute: VDI 3682 name, RefAttributeType carries the semantics */
function addRefAttr(parent, name, attributeTypePath, options, description) {
  const attr = parent.attribute.append(name);
  attr.attributeDataType = options.referenceAttributeDataType;
  attr.refAttributeType = attributeTypePath;
  if (description != null) {
    attr.description = description;
  }
}
