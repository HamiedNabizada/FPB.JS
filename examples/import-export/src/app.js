import { createFpbModeler } from 'fpbjs';

const outputTitle = document.getElementById('output-title');
const outputContent = document.getElementById('output-content');
const statusBar = document.getElementById('status');
const fileInputJson = document.getElementById('file-input-json');
const fileInputXml = document.getElementById('file-input-xml');

function setStatus(message) {
  statusBar.textContent = message;
}

function showOutput(title, content) {
  outputTitle.textContent = title;
  outputContent.textContent = typeof content === 'string'
    ? content
    : JSON.stringify(content, null, 2);
}

function downloadFile(content, filename, type) {
  const blob = new Blob(
    [typeof content === 'string' ? content : JSON.stringify(content, null, 2)],
    { type }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function init() {
  const fpb = await createFpbModeler({
    container: document.getElementById('modeler-container')
  });

  // --- Import ---

  document.getElementById('btn-import-json').addEventListener('click', () => {
    fileInputJson.click();
  });

  document.getElementById('btn-import-xml').addEventListener('click', () => {
    fileInputXml.click();
  });

  fileInputJson.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const json = JSON.parse(event.target.result);
      fpb.importJSON(json);
      setStatus(`Imported JSON: ${file.name}`);
      showOutput('Imported JSON', json);
    };
    reader.readAsText(file);
    fileInputJson.value = '';
  });

  fileInputXml.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const xml = event.target.result;
      fpb.importXML(xml);
      setStatus(`Imported XML: ${file.name}`);
      showOutput('Imported XML', xml);
    };
    reader.readAsText(file);
    fileInputXml.value = '';
  });

  // --- Export to panel ---

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const json = fpb.toJSON();
    showOutput('Export: JSON', json);
    setStatus('Exported as JSON');
  });

  document.getElementById('btn-export-xml').addEventListener('click', () => {
    const xml = fpb.toXML();
    showOutput('Export: XML', xml);
    setStatus('Exported as XML');
  });

  document.getElementById('btn-export-svg').addEventListener('click', () => {
    const svg = fpb.toSVG();
    showOutput('Export: SVG', svg);
    setStatus('Exported as SVG');
  });

  // --- Download ---

  document.getElementById('btn-download-json').addEventListener('click', () => {
    const json = fpb.toJSON();
    downloadFile(json, 'diagram.json', 'application/json');
    setStatus('Downloaded diagram.json');
  });

  document.getElementById('btn-download-xml').addEventListener('click', () => {
    const xml = fpb.toXML();
    downloadFile(xml, 'diagram.xml', 'application/xml');
    setStatus('Downloaded diagram.xml');
  });

  fpb.zoom('fit-viewport');
  setStatus('Modeler ready');

  window.fpb = fpb;
}

init().catch(console.error);
