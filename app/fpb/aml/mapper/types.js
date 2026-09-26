/**
 * Port of FpbTypes.cs, IdentificationSchema.cs and ElementMetadata.cs: the
 * $type values of FPB.js, the fields of the VDI 3682 Identification and the
 * behaviour flags per element type.
 */

export const FpbTypes = Object.freeze({
  Project: 'fpb:Project',
  Process: 'fpb:Process',
  SystemLimit: 'fpb:SystemLimit',

  Product: 'fpb:Product',
  Energy: 'fpb:Energy',
  Information: 'fpb:Information',

  ProcessOperator: 'fpb:ProcessOperator',
  TechnicalResource: 'fpb:TechnicalResource',

  Flow: 'fpb:Flow',
  ParallelFlow: 'fpb:ParallelFlow',
  AlternativeFlow: 'fpb:AlternativeFlow',
  Usage: 'fpb:Usage',

  Identification: 'fpb:Identification'
});

export const IdentificationSchema = Object.freeze({
  AttributeName: 'Identification',

  UniqueIdent: 'uniqueIdent',
  LongName: 'longName',
  ShortName: 'shortName',
  VersionNumber: 'versionNumber',
  RevisionNumber: 'revisionNumber',

  /** In the order the library generator emits them */
  Fields: Object.freeze(['uniqueIdent', 'longName', 'shortName', 'versionNumber', 'revisionNumber'])
});

const metadata = (fpbType, flags) => Object.freeze({
  fpbType,
  isState: false,
  isObject: false,
  isConnection: false,
  canBeDecomposed: false,
  livesOutsideSystemLimit: false,
  ...flags
});

/** ElementMetadataRegistry.ByFpbType */
export const ElementMetadataByFpbType = new Map([
  [FpbTypes.Product, metadata(FpbTypes.Product, { isState: true, isObject: true })],
  [FpbTypes.Energy, metadata(FpbTypes.Energy, { isState: true, isObject: true })],
  [FpbTypes.Information, metadata(FpbTypes.Information, { isState: true, isObject: true })],
  [FpbTypes.ProcessOperator, metadata(FpbTypes.ProcessOperator, { isObject: true, canBeDecomposed: true })],
  [FpbTypes.TechnicalResource, metadata(FpbTypes.TechnicalResource, { isObject: true, livesOutsideSystemLimit: true })],
  [FpbTypes.SystemLimit, metadata(FpbTypes.SystemLimit, { isObject: true })],
  [FpbTypes.Flow, metadata(FpbTypes.Flow, { isConnection: true })],
  [FpbTypes.ParallelFlow, metadata(FpbTypes.ParallelFlow, { isConnection: true })],
  [FpbTypes.AlternativeFlow, metadata(FpbTypes.AlternativeFlow, { isConnection: true })],
  [FpbTypes.Usage, metadata(FpbTypes.Usage, { isConnection: true })]
]);

/** ElementMetadataRegistry.Get: the flags of a type, or null */
export function getElementMetadata(fpbType) {
  return ElementMetadataByFpbType.get(fpbType) || null;
}
