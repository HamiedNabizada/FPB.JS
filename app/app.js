import FpbModeler from './fpb/FpbModeler';

import PropertiesPanel from './fpb/properties-panel';
import FpbPropertiesPanel from './fpb/properties-panel-next';
import LayerOverview from './fpb/layer-panel';

import configPP from './configPP';
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
if (configPP.propertiesPanel.showPanel) {
  try {
    // Old React panel until the new one covers everything; ?panel=next shows
    // the new Preact panel (FPB.JS_Docs Geplante-Features/016, 029 phase B)
    const nextPanel = new URLSearchParams(window.location.search).get('panel') === 'next';
    const propertiesPanel = nextPanel
      ? new FpbPropertiesPanel({ container: propertiesContainer, modeler })
      : new PropertiesPanel({ container: propertiesContainer, modeler, configPP });
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

