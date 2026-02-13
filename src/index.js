// FpbJS Library Entry Point
// This entry point provides both server-side and browser compatibility

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

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

  // Fit viewport by default
  canvas.zoom('fit-viewport');

  return {
    // Backward-compatible properties
    modeler,
    propertiesPanel,
    layerOverview,

    // --- Event API ---

    on(event, callback) {
      const mapped = EVENT_MAP[event];
      if (Array.isArray(mapped)) {
        mapped.forEach(e => eventBus.on(e, callback));
      } else {
        eventBus.on(mapped || event, callback);
      }
    },

    off(event, callback) {
      const mapped = EVENT_MAP[event];
      if (Array.isArray(mapped)) {
        mapped.forEach(e => eventBus.off(e, callback));
      } else {
        eventBus.off(mapped || event, callback);
      }
    },

    fire(event, data) {
      return eventBus.fire(event, data);
    },

    // --- Import/Export API ---

    importJSON(json) {
      eventBus.fire('FPBJS.import', { data: json });
    },

    importXML(xmlString) {
      const json = xmlMapper.convertFromXML(xmlString);
      eventBus.fire('FPBJS.import', { data: json });
    },

    toJSON() {
      return modeler.exportProject();
    },

    toXML() {
      return xmlMapper.convertToXML(modeler.exportProject());
    },

    toSVG() {
      return modeler.saveSVG();
    },

    // --- Convenience Methods ---

    zoom(level) {
      canvas.zoom(level);
    },

    getZoom() {
      return canvas.getZoom();
    },

    select(elementId) {
      const element = elementRegistry.get(elementId);
      if (element) {
        selection.select(element);
      }
    },

    getSelected() {
      return selection.get();
    },

    getProcesses() {
      return modeler.getProcesses();
    },

    switchProcess(id) {
      const process = modeler.getProcess(id);
      if (process) {
        modeling.switchProcess(process);
      }
    },

    // --- DI Access ---

    get(serviceName) {
      return modeler.get(serviceName);
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