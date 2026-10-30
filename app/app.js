import FpbModeler from './fpb/FpbModeler';

import FpbPropertiesPanel from './fpb/properties-panel';
import LayerOverview from './fpb/layer-panel';

import configFile from './config';
import AmlModule from './fpb/aml';

import './icons';



// Div Id (#container) von index.html abholen
var container = document.querySelector('#modeler-container');
var propertiesContainer = document.querySelector('#properties-container');

var layerContainer = document.querySelector('#layer-container')

// Fpb Modeler starten
var modeler = new FpbModeler({
  container: container,
  configFile,
  // Backup in the browser and a warning before leaving with unsaved changes.
  // Only the web app turns this on; the library leaves it off.
  autosave: true,
  // AutomationML import and export, likewise only here; library hosts add
  // the module themselves (fpbjs/aml). The engine loads on first use.
  additionalModules: [AmlModule],
  // light or dark: the user's choice, else the system (016b V9, fpbTheme);
  // the page is the web app's own, so the attribute goes on the document
  theme: 'system',
  themeScope: 'page'
});


modeler.get('canvas').zoom('fit-viewport');
try {
  // the properties panel (Preact, 016b); the React panel and ?panel=next are gone (B3)
  new FpbPropertiesPanel({ container: propertiesContainer, modeler });
} catch (e) {
  console.error('[FPB.JS] PropertiesPanel init failed:', e);
}

window.fpbjs = modeler;

// the page belongs to FPB.js: Ctrl+O and Ctrl+S work wherever the focus is,
// also before the first click (016e D2)
modeler.get('fpbFiles').bindKeys(document);

try {
  new LayerOverview({
    container: layerContainer,
    modeler
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

