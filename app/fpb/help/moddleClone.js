// Properties that must not be carried over into a copy: identity, references to
// other elements and the drawing.
const SKIP = [
  'id', 'di', 'incoming', 'outgoing', 'isAssignedTo', 'inTandemWith',
  'sourceRef', 'targetRef', 'decomposedView', 'parent', 'elementsContainer',
  'consistsOfStates', 'consistsOfProcesses', 'consistsOfProcessOperator',
  'consistsOfSystemLimit', 'isDecomposedProcessOperator', 'refObj'
];

/**
 * Deep copy of a business object (identification, characteristics, ...).
 *
 * A copied element must not share its data with the original, otherwise
 * editing one would change the other.
 */
export function cloneModdle(fpbFactory, source) {
  if (source === null || typeof source !== 'object') {
    return source;
  }
  if (Array.isArray(source)) {
    return source.map(function (entry) { return cloneModdle(fpbFactory, entry); });
  }
  if (!source.$type) {
    // plain object
    const plain = {};
    Object.keys(source).forEach(function (key) { plain[key] = cloneModdle(fpbFactory, source[key]); });
    return plain;
  }

  const attrs = {};
  Object.keys(source).forEach(function (key) {
    if (SKIP.indexOf(key) === -1) {
      attrs[key] = cloneModdle(fpbFactory, source[key]);
    }
  });
  return fpbFactory.create(source.$type, attrs);
}
