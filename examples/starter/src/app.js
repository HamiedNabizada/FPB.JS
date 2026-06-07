import { createFpbModeler } from 'fpbjs';

async function init() {
  const fpb = await createFpbModeler({
    container: document.getElementById('modeler-container'),
    propertiesContainer: document.getElementById('properties-container'),
    layerContainer: document.getElementById('layer-container')
  });

  // Listen for changes (e.g. for auto-save)
  fpb.on('changed', () => {
    console.log('Diagram changed');
  });

  // Listen for selection changes
  fpb.on('selection.changed', (event) => {
    console.log('Selection:', event.newSelection);
  });

  // Fit viewport
  fpb.zoom('fit-viewport');

  // Expose for debugging in browser console
  window.fpb = fpb;
  console.log('FPB.JS modeler initialized. Access it via window.fpb');
}

init().catch(console.error);
