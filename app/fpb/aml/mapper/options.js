import { AttrRefs, ObjectReferencesLibrary } from './mappings';

/**
 * Port of MapperOptions and MapperTrace (MapperOptions.cs). Plain objects:
 * `{ useObjectReferencesLibrary, refObjAttributeTypePath, trace }`, all
 * optional; `resolveOptions` fills in the defaults and the derived paths.
 */

const DEFAULTS = Object.freeze({
  useObjectReferencesLibrary: true,
  refObjAttributeTypePath: null,
  trace: null
});

/** The options with defaults and the Effective* paths of C# */
export function resolveOptions(options) {
  const o = Object.assign({}, DEFAULTS, options || {});
  const pick = (official) => o.refObjAttributeTypePath
    ?? (o.useObjectReferencesLibrary ? official : AttrRefs.RefObj);
  return Object.freeze({
    ...o,
    effectiveRefObjAttributeTypePath: pick(ObjectReferencesLibrary.RefObjAttributeTypePath),
    effectiveRefProcessAttributeTypePath: pick(ObjectReferencesLibrary.RefDetailObjAttributeTypePath),
    effectiveSubProcessRefObjAttributeTypePath: pick(ObjectReferencesLibrary.RefAbstractObjAttributeTypePath),
    effectiveBoundaryStateRefObjAttributeTypePath: pick(ObjectReferencesLibrary.RefBaseObjAttributeTypePath),
    referenceAttributeDataType: o.useObjectReferencesLibrary ? 'xs:IDREF' : 'xs:string'
  });
}

export const DEFAULT_OPTIONS = resolveOptions(null);

/** MapperTrace: `options` may be null or unresolved; only `trace` is read */
export const MapperTrace = Object.freeze({
  attempt(options, operation, details) {
    if (options && options.trace) {
      options.trace(`attempt: ${operation} — ${details}`);
    }
  },
  result(options, operation, outcome) {
    if (options && options.trace) {
      options.trace(`result:  ${operation} — ${outcome}`);
    }
  },
  info(options, message) {
    if (options && options.trace) {
      options.trace(`info:    ${message}`);
    }
  }
});
