import FpbModeler from './fpb/FpbModeler';

import PropertiesPanel from './fpb/properties-panel';
import LayerOverview from './fpb/layer-panel';

import configPP from './configPP';
import configFile from './config';

import './icons';

// Initialize theme on app startup
(() => {
  // Check if theme is already set (to prevent override)
  const currentTheme = document.documentElement.getAttribute('data-theme');
  if (!currentTheme) {
    // Check localStorage for saved theme preference
    const savedTheme = localStorage.getItem('fpb-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      // Default to light mode
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('fpb-theme', 'light');
    }
  }
})();


// Div Id (#container) von index.html abholen
var container = document.querySelector('#modeler-container');
var propertiesContainer = document.querySelector('#properties-container');

var layerContainer = document.querySelector('#layer-container')

// Fpb Modeler starten
var modeler = new FpbModeler({
  container: container,
  configFile
});


modeler.get('canvas').zoom('fit-viewport');
if (configPP.propertiesPanel.showPanel) {
  try {
    const propertiesPanel = new PropertiesPanel({
      container: propertiesContainer,
      modeler,
      configPP
    });
  } catch (e) {
    console.error('[FPB.JS] PropertiesPanel init failed:', e);
  }
} else {
  document.getElementsByClassName('modeler-parent')[0].removeChild(propertiesContainer);
}

window.fpbjs = modeler;

try {
  new LayerOverview({
    container: layerContainer,
    modeler,
    configPP
  });
} catch (e) {
  console.error('[FPB.JS] LayerOverview init failed:', e);
}

// Debug: Watch for panel containers disappearing (remove after bug is found)
if (process.env.NODE_ENV !== 'production') {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node.id === 'properties-container' || node.id === 'layer-container') {
          console.error('[FPB.JS] Panel container removed from DOM:', node.id, new Error().stack);
        }
      }
    }
  });
  observer.observe(document.querySelector('.modeler-parent'), { childList: true });
}

