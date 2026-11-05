import FpbModeler from './fpb/FpbModeler';

import FpbPropertiesPanel from './fpb/properties-panel';
import Toolbar from './fpb/toolbar';

import configFile from './config';
import { markText } from './fpb/i18n/markText';
import AmlModule from './fpb/aml';



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
  // on phones and tablets upright, properties, layers and the model check
  // open as a sheet in the row below the canvas (016f E2)
  sheets: { container: document.querySelector('#sheet-container') },
  // light or dark: the user's choice, else the system (016b V9, fpbTheme);
  // the page is the web app's own, so the attribute goes on the document
  theme: 'system',
  themeScope: 'page',
  // English or German, as the user chooses with the button in the toolbar;
  // the choice is kept in the browser (016h V2, V4)
  language: 'user',
  // the example models of the start card (016e D3), files of the web app
  examples: [
    // titles and descriptions are keys of the catalog: the start card shows them translated
    { title: markText('Temperieren'), description: markText('Heating with inspection, one decomposition'), url: 'examples/temperieren.json' },
    { title: markText('Showcase A: heat exchanger'), description: markText('Temperature control over four layers, with a plant hierarchy'), url: 'examples/Showcase-A-WaermetauscherMitRegelung.aml' },
    { title: markText('Showcase B: pharma batch'), description: markText('Batch production and cleaning, two process views'), url: 'examples/Showcase-B-PharmaChargeUndReinigung.aml' },
    { title: markText('Showcase C: assembly'), description: markText('CNC machining and robot assembly, two process views'), url: 'examples/Showcase-C-CncRobotikMontage.aml' }
  ]
});


modeler.get('canvas').zoom('fit-viewport');

// the page is FPB.js's own: its language is the one of the modeler (016h T8)
document.documentElement.lang = modeler.get('fpbI18n').get();
modeler.get('eventBus').on('i18n.changed', function (event) {
  document.documentElement.lang = event.language;
});
try {
  // the properties panel (Preact, 016b); the React panel and ?panel=next are gone (B3)
  new FpbPropertiesPanel({ container: propertiesContainer, modeler });
} catch (e) {
  console.error('[FPB.JS] PropertiesPanel init failed:', e);
}

window.fpbjs = modeler;

// On touch tablets and phones the side panels float over the right of the
// canvas (index.html): the start card keeps clear of them (016e D3)
const sidePanels = document.querySelector('.side-panels');
const floatingPanels = window.matchMedia('(max-width: 900px) and (pointer: coarse)');
const keepStartCardClear = () => {
  container.style.setProperty('--fpb-start-inset-right', floatingPanels.matches && sidePanels ? sidePanels.offsetWidth + 'px' : '0px');
};
if (sidePanels && typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(keepStartCardClear).observe(sidePanels);
}
floatingPanels.addEventListener('change', keepStartCardClear);
keepStartCardClear();

// the page belongs to FPB.js: Ctrl+O and Ctrl+S work wherever the focus is,
// also before the first click (016e D2)
modeler.get('fpbFiles').bindKeys(document);

try {
  new Toolbar({
    container: layerContainer,
    modeler
  });
} catch (e) {
  console.error('[FPB.JS] Toolbar init failed:', e);
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

