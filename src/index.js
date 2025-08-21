// FpbJS Library Entry Point
// This entry point provides both server-side and browser compatibility

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

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
    configModule,
    propertiesConfigModule
  ] = await Promise.all([
    import('../app/fpb/FpbModeler'),
    import('../app/fpb/properties-panel'),
    import('../app/fpb/layer-panel'),
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

  // Fit viewport by default
  modeler.get('canvas').zoom('fit-viewport');

  return {
    modeler,
    propertiesPanel,
    layerOverview,
    // Convenience methods
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