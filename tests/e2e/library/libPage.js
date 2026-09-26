// tests/e2e/library/libPage.js
import fs from 'fs';
import path from 'path';

/**
 * Test page for the LIBRARY build (dist/fpbjs.js, UMD, global `FpbJS`).
 *
 * The dev server serves the web app (app/app.js), which never loads
 * src/index.js. The library is therefore served through page.route on an
 * origin of its own: nothing touches the dev server, its configuration or the
 * browser storage of the web app tests.
 *
 * React and ReactDOM are peer dependencies of the library (externals, root
 * `React` / `ReactDOM`) and come from node_modules as UMD files, the way a host
 * page would load them.
 *
 * The bundle must be built first: `npm run build:lib`. FPBJS_LIB_DIR points to
 * another build output if needed.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = process.env.FPBJS_LIB_DIR || path.join(ROOT, 'dist');

export const ORIGIN = 'http://fpbjs-libtest.invalid';
export const PAGE_URL = ORIGIN + '/index.html';

const FILES = {
  '/react.js': path.join(ROOT, 'node_modules', 'react', 'umd', 'react.production.min.js'),
  '/react-dom.js': path.join(ROOT, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'),
  '/fpbjs.js': path.join(LIB_DIR, 'fpbjs.js'),
  '/fpbjs.esm.js': path.join(LIB_DIR, 'fpbjs.esm.js'),
  // the AutomationML add-on: loaded, but only used where a test passes it
  '/fpbjs-aml.js': path.join(LIB_DIR, 'fpbjs-aml.js')
};

const HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FPB.JS library test</title>
  <style>
    html, body { margin: 0; height: 100%; }
    #modeler { position: absolute; left: 0; top: 0; width: 1100px; height: 800px; }
    #properties { position: absolute; left: 1100px; top: 0; width: 300px; height: 800px; overflow: auto; }
    #layers { position: absolute; left: 0; top: 800px; width: 1400px; height: 200px; overflow: auto; }
  </style>
  <script src="/react.js"></script>
  <script src="/react-dom.js"></script>
  <script src="/fpbjs.js"></script>
  <script src="/fpbjs-aml.js"></script>
</head>
<body>
  <div id="modeler"></div>
  <div id="properties"></div>
  <div id="layers"></div>
</body>
</html>`;

export function libraryBuilt() {
  return fs.existsSync(FILES['/fpbjs.js']);
}

const cache = {};
function read(file) {
  if (!cache[file]) {
    cache[file] = fs.readFileSync(file);
  }
  return cache[file];
}

/**
 * Route the test origin and open the page. Collects page errors so tests can
 * assert that nothing blew up silently.
 */
export async function openLibraryPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error && error.message || error)));

  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.route(ORIGIN + '/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    }
    const file = FILES[url.pathname];
    if (file) {
      return route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: read(file) });
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });

  await page.goto(PAGE_URL);
  await page.waitForFunction(() => window.FpbJS && typeof window.FpbJS.createFpbModeler === 'function');
  return { errors };
}

/**
 * Create a modeler in the page and keep it as window.fpb.
 * `panels`: also mount the properties panel and the layer overview.
 * `aml`: add the AutomationML module (fpbjs-aml.js).
 */
export async function createModeler(page, { panels = false, options = {}, aml = false } = {}) {
  await page.evaluate(async ({ panels, options, aml }) => {
    const opts = Object.assign({ container: document.getElementById('modeler') }, options);
    if (panels) {
      opts.propertiesContainer = document.getElementById('properties');
      opts.layerContainer = document.getElementById('layers');
    }
    if (aml) {
      opts.additionalModules = [window.FpbJSAml.AmlModule];
    }
    window.fpb = await window.FpbJS.createFpbModeler(opts);
  }, { panels, options, aml });
}

/**
 * Import through the facade (importJSON) and wait for the importer to report
 * completion ('import.done', an internal event reachable through on()).
 */
export async function importModel(page, data) {
  return page.evaluate((d) => new Promise((resolve) => {
    const done = () => {
      window.fpb.off('import.done', done);
      resolve(true);
    };
    window.fpb.on('import.done', done);
    window.fpb.importJSON(d);
    // A never finishing import must fail the test, not hang it
    setTimeout(() => resolve(false), 8000);
  }), data);
}

/** Like importModel, for importXML */
export async function importXml(page, xml) {
  return page.evaluate((x) => new Promise((resolve, reject) => {
    const done = () => {
      window.fpb.off('import.done', done);
      resolve(true);
    };
    window.fpb.on('import.done', done);
    window.fpb.importXML(x).catch((e) => {
      window.fpb.off('import.done', done);
      reject(e);
    });
    setTimeout(() => resolve(false), 8000);
  }), xml);
}

/** Id of the process shown on the canvas */
export const currentRootId = (page) => page.evaluate(() => window.fpb.get('canvas').getRootElement().id);
