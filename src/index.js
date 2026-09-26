// FpbJS Library Entry Point
// This entry point provides both server-side and browser compatibility

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// Register FontAwesome icons used by PropertiesPanel / LayerOverview into the
// shared `library`. Without this the lib build renders icon="folder" etc. as blank.
if (isBrowser) {
  // Inline side-effect import; webpack tree-shakes nothing since icons.js calls library.add().
  import('../app/icons');
}

// Event mapping: clean external API names → internal diagram-js event names
const EVENT_MAP = {
  'changed':          'commandStack.changed',
  'element.added':    ['shape.added', 'connection.added'],
  'element.removed':  ['shape.removed', 'connection.removed'],
  'element.changed':  'element.changed',
  'selection.changed': 'selection.changed',
  'process.switched':  'layerPanel.processSwitched',
};

// Server-side stub implementations that provide helpful error messages
class FpbModelerStub {
  constructor() {
    throw new Error('FpbModeler requires a browser environment with DOM support. Use createFpbModeler() for proper initialization.');
  }
}

class PropertiesPanelStub {
  constructor() {
    throw new Error('PropertiesPanel requires a browser environment with DOM support. Use createFpbModeler() for proper initialization.');
  }
}

class LayerOverviewStub {
  constructor() {
    throw new Error('LayerOverview requires a browser environment with DOM support. Use createFpbModeler() for proper initialization.');
  }
}

// Export stub classes for server-side compatibility
export const FpbModeler = FpbModelerStub;
export const PropertiesPanel = PropertiesPanelStub;
export const LayerOverview = LayerOverviewStub;

import { collectProcessShapes, findProcessShape } from './processShapes';
import { serializeModel } from '../app/fpb/export/serializeModel';

// Automatic layout works on plain JSON, so it is available without a browser.
export { layoutImportData, needsLayout } from '../app/fpb/layout/AutoLayout';

// Export empty configs for server-side compatibility
export const defaultConfig = {};
export const defaultPropertiesConfig = {};

// Main factory function that dynamically loads modules only in browser
export async function createFpbModeler(options = {}) {
  if (!isBrowser) {
    throw new Error('createFpbModeler requires a browser environment with DOM support');
  }

  // Dynamic imports that only execute in browser
  const [
    { default: FpbModeler },
    { default: PropertiesPanel },
    { default: LayerOverview },
    { default: XMLMapper },
    configModule,
    propertiesConfigModule
  ] = await Promise.all([
    import('../app/fpb/FpbModeler'),
    import('../app/fpb/properties-panel'),
    import('../app/fpb/layer-panel'),
    import('../app/fpb/xml/XMLMapper'),
    import('../app/config.json'),
    import('../app/configPP.json')
  ]);
  
  const {
    container,
    propertiesContainer,
    layerContainer,
    config = configModule.default || configModule,
    propertiesConfig = propertiesConfigModule.default || propertiesConfigModule,
    readOnly = false,
    ...modelingOptions
  } = options;

  if (!container) {
    throw new Error('Container element is required');
  }

  // Create the main modeler
  const modeler = new FpbModeler({
    container,
    configFile: config,
    ...modelingOptions
  });

  // before the panels are built, so no field is editable for a moment
  const readOnlyMode = modeler.get('readOnly');
  readOnlyMode.set(readOnly);

  // Set up properties panel if container provided
  let propertiesPanel = null;
  if (propertiesContainer && propertiesConfig.propertiesPanel?.showPanel) {
    propertiesPanel = new PropertiesPanel({
      container: propertiesContainer,
      modeler,
      configPP: propertiesConfig
    });
  }

  // Set up layer overview if container provided
  let layerOverview = null;
  if (layerContainer) {
    layerOverview = new LayerOverview({
      container: layerContainer,
      modeler,
      configPP: propertiesConfig
    });
  }

  // Get DI services for facade methods
  const eventBus = modeler.get('eventBus');
  const canvas = modeler.get('canvas');
  const selection = modeler.get('selection');
  const elementRegistry = modeler.get('elementRegistry');
  const modeling = modeler.get('modeling');
  const xmlMapper = new XMLMapper();
  const listeners = createListenerRegistry();

  // Fit viewport by default
  canvas.zoom('fit-viewport');

  return {
    // Backward-compatible properties
    modeler,
    propertiesPanel,
    layerOverview,

    // --- Event API ---

    on(event, callback) {
      // The event bus stops an event at the first listener that returns a
      // value; a host callback such as `() => dirty = true` would silently
      // cut off the modeler's own listeners. Hosts only observe.
      const listener = listeners.wrap(event, callback);
      const mapped = EVENT_MAP[event];
      if (Array.isArray(mapped)) {
        mapped.forEach(e => eventBus.on(e, listener));
      } else {
        eventBus.on(mapped || event, listener);
      }
    },

    off(event, callback) {
      const listener = listeners.unwrap(event, callback);
      if (!listener) {
        return;
      }
      const mapped = EVENT_MAP[event];
      if (Array.isArray(mapped)) {
        mapped.forEach(e => eventBus.off(e, listener));
      } else {
        eventBus.off(mapped || event, listener);
      }
    },

    fire(event, data) {
      return eventBus.fire(event, data);
    },

    // --- Import/Export API ---

    importJSON(json) {
      eventBus.fire('FPBJS.import', { data: json });
    },

    /** Start over with an empty model (also clears the browser backup, if on) */
    newModel() {
      modeler.newModel();
    },

    async importXML(xmlString) {
      const json = await xmlMapper.convertFromXML(xmlString);
      eventBus.fire('FPBJS.import', { data: json });
    },

    /**
     * The model as plain data, the same as the JSON download: references
     * are ids, so the result can go to JSON.stringify, postMessage or
     * importJSON. (It used to be the live object graph, which has cycles.)
     */
    toJSON() {
      eventBus.fire('dataStore.updateAll', {});
      return JSON.parse(serializeModel(modeler.getProcesses(), { indent: 0 }));
    },

    async toXML() {
      eventBus.fire('dataStore.updateAll', {});
      return xmlMapper.convertToXML(modeler.getProcesses());
    },

    // --- AutomationML (feature 028) ---

    /**
     * The FPD process views (InstanceHierarchies) of an AML text, as
     * [{ id, name }]; empty when the file has no FPD content.
     */
    getAMLHierarchies(text) {
      return requireAml(modeler).then((aml) => aml.inspect(text));
    },

    /**
     * Import an AML text. Everything in the file beyond the process view is
     * kept and written back by toAML(). `instanceHierarchy` picks the process
     * view by id (default: the first); a file without FPD content opens an
     * empty model and toAML() adds the process to that file.
     */
    importAML(text, options = {}) {
      return requireAml(modeler).then((aml) => aml.importAml(text, {
        fileName: options.fileName,
        hierarchyId: options.instanceHierarchy
      }));
    },

    /**
     * The model as AML text. After importAML the model is written into the
     * imported file and everything else in it stays; otherwise a new file is
     * written. The result is kept for the next toAML().
     */
    async toAML() {
      const result = await (await requireAml(modeler)).exportAml();
      return result.text;
    },

    toSVG() {
      return new Promise((resolve, reject) => {
        modeler.saveSVG({}, (err, svg) => {
          if (err) {
            reject(err);
          } else {
            resolve(svg);
          }
        });
      });
    },

    async toPNG(options = {}) {
      const { exportPNG } = await import('../app/fpb/export/PngExporter');
      const svg = await this.toSVG();
      return exportPNG(svg, options);
    },

    async toPDF(options = {}) {
      const { exportPDF, exportMultiLayerPDF } = await import('../app/fpb/export/PdfExporter');
      const { exportPNG } = await import('../app/fpb/export/PngExporter');
      const { allLayers = false, ...pdfOptions } = options;

      if (allLayers) {
        const { renderLayers } = await import('../app/fpb/export/renderLayers');
        const processShapes = collectProcessShapes(modeler.getProjectDefinition());

        // Same walk as the download dialog: keeps the undo history and always
        // returns to the layer the user is on.
        const rendered = await renderLayers(modeler, processShapes, async () => exportPNG(await this.toSVG(), options));
        const layers = rendered.map((layer) => ({ name: layer.name, pngDataUrl: layer.image }));
        return exportMultiLayerPDF(layers, pdfOptions);
      } else {
        const svg = await this.toSVG();
        const png = await exportPNG(svg, options);
        return exportPDF(png, pdfOptions);
      }
    },

    // --- Convenience Methods ---

    zoom(level) {
      canvas.zoom(level);
    },

    getZoom() {
      // diagram-js reads the level through zoom() without arguments
      return canvas.zoom();
    },

    /**
     * Select an element by id. When `options.scroll` is true and the
     * element exists, scroll the viewport so the element is in view —
     * useful when a finding panel jumps to an element that's currently
     * off-screen.
     * Returns true if the element was found and selected.
     */
    select(elementId, options = {}) {
      const element = elementRegistry.get(elementId);
      if (!element) return false;
      selection.select(element);
      if (options.scroll && typeof canvas.scrollToElement === 'function') {
        try { canvas.scrollToElement(element); } catch (_) { /* ignore */ }
      }
      return true;
    },

    getSelected() {
      return selection.get();
    },

    getProcesses() {
      return modeler.getProcesses();
    },

    switchProcess(id) {
      // getProcess() returns the business object, switching needs the shape.
      const shape = findProcessShape(modeler.getProjectDefinition(), id);
      if (shape) {
        modeling.switchProcess(shape);
      }
    },

    // --- Read-only mode ---

    /**
     * Look, don't touch: the user can zoom, pan, switch layers, search, check
     * and export, but not change the model. The API itself stays writable
     * (importJSON, switchProcess, modeling). Fires 'readOnly.changed'.
     */
    setReadOnly(flag) {
      readOnlyMode.set(!!flag);
    },

    isReadOnly() {
      return readOnlyMode.isEnabled();
    },

    // --- DI Access ---

    /** A service; with `strict` false, null instead of an error when it is not there */
    get(serviceName, strict) {
      return modeler.get(serviceName, strict);
    },

    // --- Lifecycle ---

    destroy() {
      if (propertiesPanel && typeof propertiesPanel.destroy === 'function') {
        propertiesPanel.destroy();
      }
      if (layerOverview && typeof layerOverview.destroy === 'function') {
        layerOverview.destroy();
      }
      if (modeler && typeof modeler.destroy === 'function') {
        modeler.destroy();
      }
    }
  };
}

/**
 * The AML service, or a rejection that says how to get it: AML is an add-on
 * like the browser backup, off unless the host passes the module.
 */
function requireAml(modeler) {
  const aml = modeler.get('amlSupport', false);
  return aml
    ? Promise.resolve(aml)
    : Promise.reject(new Error('AutomationML is not enabled: create the modeler with the AML module in additionalModules (fpbjs/aml).'));
}

/**
 * Host callbacks wrapped so they never return a value to the event bus, with
 * the wrapper kept per event name and callback so off() finds it again.
 */
function createListenerRegistry() {
  const byEvent = new Map();

  return {
    wrap(event, callback) {
      if (!byEvent.has(event)) {
        byEvent.set(event, new Map());
      }
      const wrappers = byEvent.get(event);
      if (!wrappers.has(callback)) {
        wrappers.set(callback, function (e) {
          callback(e);
        });
      }
      return wrappers.get(callback);
    },

    unwrap(event, callback) {
      const wrappers = byEvent.get(event);
      const wrapper = wrappers && wrappers.get(callback);
      if (wrapper) {
        wrappers.delete(callback);
      }
      return wrapper;
    }
  };
}

// Convenience function for getting real classes in browser environment
export async function getClasses() {
  if (!isBrowser) {
    return { FpbModeler, PropertiesPanel, LayerOverview, defaultConfig, defaultPropertiesConfig };
  }
  
  const [
    { default: FpbModeler },
    { default: PropertiesPanel },
    { default: LayerOverview },
    configModule,
    propertiesConfigModule
  ] = await Promise.all([
    import('../app/fpb/FpbModeler'),
    import('../app/fpb/properties-panel'),
    import('../app/fpb/layer-panel'),
    import('../app/config.json'),
    import('../app/configPP.json')
  ]);
  
  return {
    FpbModeler,
    PropertiesPanel,
    LayerOverview,
    defaultConfig: configModule.default || configModule,
    defaultPropertiesConfig: propertiesConfigModule.default || propertiesConfigModule
  };
}

// Default export
export default createFpbModeler;