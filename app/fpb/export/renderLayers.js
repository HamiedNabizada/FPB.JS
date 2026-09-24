/**
 * Renders every given layer to an image, one after the other.
 *
 * Used by the download dialog and by the API (toPDF with allLayers). Both used
 * to carry their own copy of this walk, and only the dialog's copy knew that
 * the walk must neither end the undo history nor leave the user on another
 * layer when something fails. The API copy did both.
 *
 * The walk switches with `fpbTransient` and runs inside
 * `layerUndoBoundary.keepHistory`, and it always returns to the layer it
 * started from.
 *
 * @param {Object} modeler
 * @param {Array} processShapes the process root shapes to render
 * @param {Function} renderCurrent async () => image of the layer on the canvas
 * @return {Promise<Array<{ name: string, image: * }>>}
 */
export async function renderLayers(modeler, processShapes, renderCurrent) {
  const modeling = modeler.get('modeling');
  const startRoot = modeler.get('canvas').getRootElement();
  const transient = { fpbTransient: true };
  const layers = [];

  await modeler.get('layerUndoBoundary').keepHistory(async () => {
    try {
      for (const processShape of processShapes) {
        modeling.switchProcess(processShape, transient);
        layers.push({ name: layerName(processShape), image: await renderCurrent() });
      }
    } finally {
      // Back to the starting layer, even if one layer failed
      modeling.switchProcess(startRoot, transient);
    }
  });

  return layers;
}

/** Name of a layer for the page title: short name, else name, else id */
export function layerName(processShape) {
  const bo = processShape.businessObject || {};

  return (bo.identification && bo.identification.shortName) || bo.name || processShape.id;
}
