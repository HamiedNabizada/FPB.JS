import FpbModeler from './fpb/FpbModeler';

import PropertiesPanel from './fpb/properties-panel';
import LayerOverview from './fpb/layer-panel';

import configPP from './configPP';
import configFile from './config';

import './icons';


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
  const propertiesPanel = new PropertiesPanel({
    container: propertiesContainer,
    modeler,
    configPP
  });
} else {
  document.getElementsByClassName('modeler-parent')[0].removeChild(propertiesContainer);
}

window.fpbjs = modeler;

new LayerOverview({
  container: layerContainer,
  modeler,
  configPP
})

