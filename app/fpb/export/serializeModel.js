/**
 * The JSON form of a model, as the download writes it.
 *
 * References between model objects become ids, diagram-js internals are left
 * out. The download dialog, the XML mapper and the browser backup (autosave)
 * all write through this, so a restored backup is the same as a downloaded
 * file.
 */

/** Id of a referenced object, or the value itself if it has none */
function extractId(item) {
  if (typeof item === 'string') return item;
  if (!item) return item;
  return item.id || item.uniqueIdent || item.$id || item;
}

/**
 * JSON.stringify replacer.
 *
 * @param {Object} [options]
 * @param {boolean} [options.withLayout=true] false leaves out elementVisualInformation
 */
export function modelReplacer(options = {}) {
  const withLayout = options.withLayout !== false;

  return function (name, val) {
    if (!withLayout && name === 'elementVisualInformation') {
      return undefined;
    }

    switch (name) {
      case 'entryPoint':
        return extractId(val);

      case 'elementsContainer':
      case 'consistsOfStates':
      case 'consistsOfProcessOperator':
      case 'consistsOfProcesses':
      case 'inTandemWith':
      case 'isAssignedTo':
      case 'incoming':
      case 'outgoing':
        if (Array.isArray(val)) {
          return val.map(el => extractId(el));
        }
        return extractId(val);

      case 'sourceRef':
      case 'targetRef':
      case 'decomposedView':
      case 'parent':
      case 'consistsOfSystemLimit':
        return extractId(val);

      case 'isDecomposedProcessOperator':
        if (val === null || val === undefined) {
          return null;
        }
        return extractId(val);

      case 'di':
      case 'children':
      case 'labels':
      case 'ProjectAssignment':
      case 'TemporaryFlowHint':
      // diagram-js keeps CSS markers of the canvas as a Set on the shape
      case 'markers':
        return undefined;

      default:
        return val;
    }
  };
}

/**
 * @param {*} data processes (or a part of them) as the modeler holds them
 * @param {Object} [options] see modelReplacer, plus `indent` (default 4)
 * @return {string}
 */
export function serializeModel(data, options = {}) {
  const indent = options.indent === undefined ? 4 : options.indent;

  return JSON.stringify(data, modelReplacer(options), indent);
}
