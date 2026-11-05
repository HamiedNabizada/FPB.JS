import { fill } from '../i18n/language';
import XMLMapper from '../xml/XMLMapper.js';
import { serializeModel } from '../export/serializeModel.js';
import { exportPNG } from '../export/PngExporter.js';
import { exportPDF, exportMultiLayerPDF } from '../export/PdfExporter.js';
import { renderLayers } from '../export/renderLayers.js';
import { collectProcessShapes } from '../help/processShapes.js';

/**
 * The content of an export (016e V10), apart from where it goes.
 *
 * Model data: JSON of the whole model, the current layer or the selected
 * elements, with or without layout; VDI 3682 XML and AutomationML always of
 * the whole model. Pictures: SVG and PNG of the current layer, PDF of all
 * layers. The pictures go through fpbjs.saveSVG at the time of the call.
 *
 * @param {Object} fpbjs the modeler
 * @param {{ format: string, scope?: 'model'|'layer'|'selection', layout?: boolean }} choices
 * @return {Promise<{ data: string|Blob|Uint8Array, extension: string, mime: string, eventData?: *, wholeModel: boolean, removedLinks?: string[] }>}
 *   `wholeModel`: the file holds the whole model with its layout
 */
export async function exportContent(fpbjs, { format, scope = 'model', layout = true }) {
  fpbjs.get('eventBus').fire('dataStore.updateAll', {});

  if (format === 'json') {
    const text = serializeModel(modelData(fpbjs, scope), { withLayout: layout });
    return { data: text, extension: 'json', mime: 'application/json', eventData: JSON.parse(text), wholeModel: scope === 'model' && layout };
  }
  if (format === 'xml') {
    const text = await new XMLMapper().convertToXML(fpbjs.getProcesses(), { withLayout: layout });
    return { data: text, extension: 'xml', mime: 'application/xml', eventData: text, wholeModel: layout };
  }
  if (format === 'aml') {
    const result = await fpbjs.get('amlSupport').exportAml();
    return { data: result.bytes, extension: 'aml', mime: 'application/xml', eventData: result.text, wholeModel: true, removedLinks: result.removedLinks };
  }
  if (format === 'svg') {
    return { data: await currentSvg(fpbjs), extension: 'svg', mime: 'image/svg+xml', wholeModel: false };
  }
  if (format === 'png') {
    const png = await exportPNG(await currentSvg(fpbjs), { scale: 2 });
    return { data: dataUrlToBlob(png), extension: 'png', mime: 'image/png', wholeModel: false };
  }
  if (format === 'pdf') {
    const shapes = collectProcessShapes(fpbjs.getProjectDefinition());
    const rendered = await renderLayers(fpbjs, shapes, async () => exportPNG(await currentSvg(fpbjs), { scale: 2 }));
    const layers = rendered.map((layer) => ({ name: layer.name, pngDataUrl: layer.image }));
    const translate = fpbjs.get('translate', false) || fill;
    const subject = translate('VDI 3682 Formalized Process Description');
    const blob = layers.length === 1
      ? exportPDF(layers[0].pngDataUrl, { title: layers[0].name || translate('FPB Diagram'), subject })
      : exportMultiLayerPDF(layers, { title: translate('FPB Diagram'), subject });
    return { data: blob, extension: 'pdf', mime: 'application/pdf', wholeModel: false };
  }
  throw new Error(`Unsupported export format: ${format}`);
}

/** The data of a scope: the whole model, the layer on the canvas or the selection */
function modelData(fpbjs, scope) {
  let data;
  if (scope === 'model') {
    data = fpbjs.getProcesses();
  } else {
    const rootId = fpbjs.get('canvas').getRootElement().id;
    data = scope === 'layer' ? fpbjs.getProcess(rootId) : fpbjs.getSelectedElements(rootId);
  }
  if (data === undefined) {
    throw new Error('No data available for export');
  }
  return data;
}

function currentSvg(fpbjs) {
  return new Promise((resolve, reject) => {
    fpbjs.saveSVG({}, (error, svg) => {
      if (error) {
        reject(error);
      } else if (!svg) {
        reject(new Error('SVG generation returned empty result'));
      } else {
        resolve(svg);
      }
    });
  });
}

function dataUrlToBlob(url) {
  const [head, body] = url.split(',');
  const mime = /^data:([^;,]+)/.exec(head)[1];
  const bytes = atob(body);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    array[i] = bytes.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}
