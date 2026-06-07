import { createFpbModeler } from 'fpbjs';

const logOutput = document.getElementById('log-output');

function log(message, data) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const timestamp = new Date().toLocaleTimeString();
  let text = `[${timestamp}] ${message}`;
  if (data) {
    text += '\n' + JSON.stringify(data, null, 2).substring(0, 500);
  }
  entry.textContent = text;

  logOutput.prepend(entry);
}

async function init() {
  const fpb = await createFpbModeler({
    container: document.getElementById('modeler-container')
  });

  // --- Event-based export ---
  // Register a listener for a custom event name.
  // This is the same pattern used by the built-in DownloadModal
  // ("Export as Event" option). External systems can listen for
  // this event to receive diagram data.

  const EVENT_NAME = 'fpbjs';

  fpb.on(EVENT_NAME, (event) => {
    log(`Received "${EVENT_NAME}" event (format: ${event.format})`, event.data);

    // In a real application, you would send this to your backend:
    // fetch('/api/save-diagram', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ data: event.data, format: event.format })
    // });
  });

  // --- Trigger export via buttons ---

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const data = fpb.toJSON();
    fpb.fire(EVENT_NAME, { data, format: 'json' });
  });

  document.getElementById('btn-export-xml').addEventListener('click', () => {
    const data = fpb.toXML();
    fpb.fire(EVENT_NAME, { data, format: 'xml' });
  });

  document.getElementById('btn-clear-log').addEventListener('click', () => {
    logOutput.innerHTML = '';
  });

  // --- Also log diagram changes ---

  fpb.on('changed', () => {
    log('Diagram changed (commandStack)');
  });

  fpb.on('element.added', (event) => {
    const el = event.element || event;
    log(`Element added: ${el.type || 'unknown'}`);
  });

  fpb.zoom('fit-viewport');
  log('Modeler initialized. Use toolbar buttons to trigger event-based export.');

  window.fpb = fpb;
}

init().catch(console.error);
