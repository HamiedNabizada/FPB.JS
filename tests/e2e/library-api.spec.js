// tests/e2e/library-api.spec.js
import { test, expect } from './support/test';
import {
  openLibraryPage, createModeler, importModel, importXml, currentRootId, libraryBuilt
} from './library/libPage';
import basis from './fixtures/temperieren.json';

/**
 * The public library API (src/index.js, built to dist/fpbjs.js): createFpbModeler
 * and the facade it returns. Host applications such as the AML editor plugin
 * embed FPB.js only through this API; the web app on the dev server does not
 * load it, so it is tested here against the built bundle.
 *
 * Contract: types/fpbjs.d.ts. Build first: `npm run build:lib`.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

const MAIN = basis[0].entryPoint;
const CHILD = basis[2].process.id;

test.beforeAll(() => {
  expect(libraryBuilt(), 'dist/fpbjs.js is missing, run `npm run build:lib` first').toBe(true);
});

/** Page with a modeler (optionally with panels) and the fixture imported */
async function withModel(page, opts) {
  const ctx = await openLibraryPage(page);
  await createModeler(page, opts);
  expect(await importModel(page, clone())).toBe(true);
  return ctx;
}

/** Number of pages in a PDF blob created in the page (jsPDF writes uncompressed objects) */
function pdfInfo(page, expression) {
  return page.evaluate(async (expr) => {
    // eslint-disable-next-line no-new-func
    const blob = await new Function('return ' + expr)();
    const text = await blob.text();
    return {
      isBlob: blob instanceof Blob,
      type: blob.type,
      size: blob.size,
      header: text.slice(0, 5),
      pages: (text.match(/\/Type \/Page[^s]/g) || []).length,
      titles: (text.match(/\/Title \(([^)]*)\)/g) || [])
    };
  }, expression);
}

// ---------------------------------------------------------------------------

test.describe('Library bundle', () => {

  test('the UMD bundle exposes the documented exports', async ({ page }) => {
    const { errors } = await openLibraryPage(page);

    const exports = await page.evaluate(() => {
      const lib = window.FpbJS;
      const throws = (Cls) => {
        try { new Cls(); return null; } catch (e) { return e.message; }
      };
      return {
        createFpbModeler: typeof lib.createFpbModeler,
        defaultIsFactory: lib.default === lib.createFpbModeler,
        getClasses: typeof lib.getClasses,
        layoutImportData: typeof lib.layoutImportData,
        needsLayout: typeof lib.needsLayout,
        defaultConfig: typeof lib.defaultConfig,
        defaultPropertiesConfig: typeof lib.defaultPropertiesConfig,
        stubErrors: [throws(lib.FpbModeler), throws(lib.PropertiesPanel), throws(lib.LayerOverview)]
      };
    });

    expect(exports).toMatchObject({
      createFpbModeler: 'function',
      defaultIsFactory: true,
      getClasses: 'function',
      layoutImportData: 'function',
      needsLayout: 'function',
      defaultConfig: 'object',
      defaultPropertiesConfig: 'object'
    });
    // The top level classes are the server stubs; the real ones come from getClasses()
    exports.stubErrors.forEach((message) => expect(message).toMatch(/browser environment/));
    expect(errors).toEqual([]);
  });

  test('getClasses() returns the real classes and the built-in configs in the browser', async ({ page }) => {
    await openLibraryPage(page);

    const classes = await page.evaluate(async () => {
      const c = await window.FpbJS.getClasses();
      return {
        FpbModeler: typeof c.FpbModeler,
        stub: c.FpbModeler === window.FpbJS.FpbModeler,
        hasNewModel: typeof c.FpbModeler.prototype.newModel,
        PropertiesPanel: typeof c.PropertiesPanel,
        LayerOverview: typeof c.LayerOverview,
        configKeys: Object.keys(c.defaultConfig || {}).length,
        showPanel: c.defaultPropertiesConfig.propertiesPanel && c.defaultPropertiesConfig.propertiesPanel.showPanel
      };
    });

    expect(classes).toMatchObject({
      FpbModeler: 'function', stub: false, hasNewModel: 'function',
      PropertiesPanel: 'function', LayerOverview: 'function', showPanel: true
    });
    expect(classes.configKeys).toBeGreaterThan(0);
  });

  test('needsLayout / layoutImportData work on plain JSON without a modeler', async ({ page }) => {
    await openLibraryPage(page);

    const result = await page.evaluate((data) => {
      const lib = window.FpbJS;
      const complete = lib.needsLayout(data);
      const stripped = JSON.parse(JSON.stringify(data));
      stripped.slice(1).forEach((p) => { p.elementVisualInformation = []; });
      const before = JSON.stringify(stripped);
      const layout = lib.layoutImportData(stripped, { mode: 'all' });
      return {
        complete,
        stripped: lib.needsLayout(stripped),
        inputUntouched: JSON.stringify(stripped) === before,
        changed: layout.changed,
        reportLength: layout.report.length,
        laidOut: lib.needsLayout(layout.data)
      };
    }, clone());

    expect(result).toEqual({
      complete: false, stripped: true, inputUntouched: true, changed: true, reportLength: 2, laidOut: false
    });
  });

  test('the ESM bundle exposes the same API and creates a working modeler', async ({ page }) => {
    const { errors } = await openLibraryPage(page);

    const result = await page.evaluate(async (data) => {
      // The ESM bundle imports "react" and "react-dom" by bare specifier; map them
      // onto the UMD globals the page already loaded, as a host would.
      const shim = (name, obj) => {
        const lines = ['const m = window.' + name + ';', 'export default m;'];
        Object.keys(obj).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default')
          .forEach((k) => lines.push('export const ' + k + ' = m.' + k + ';'));
        return URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/javascript' }));
      };
      const reactUrl = shim('React', window.React);
      const reactDomUrl = shim('ReactDOM', window.ReactDOM);
      // Rewrite the two bare imports instead of relying on an import map added after load
      const source = await (await fetch('/fpbjs.esm.js')).text();
      const rewritten = source
        .replace('from"react-dom"', 'from"' + reactDomUrl + '"')
        .replace('from"react"', 'from"' + reactUrl + '"');
      const url = URL.createObjectURL(new Blob([rewritten], { type: 'text/javascript' }));
      const esm = await import(url);

      const host = document.createElement('div');
      host.style.cssText = 'width:800px;height:600px;position:absolute;left:0;top:0';
      document.body.appendChild(host);
      const fpb = await esm.createFpbModeler({ container: host });
      await new Promise((resolve) => {
        fpb.on('import.done', resolve);
        fpb.importJSON(data);
        setTimeout(resolve, 8000);
      });
      const out = {
        exports: Object.keys(esm).sort(),
        defaultIsFactory: esm.default === esm.createFpbModeler,
        processes: fpb.getProcesses().length,
        root: fpb.get('canvas').getRootElement().id
      };
      fpb.destroy();
      return out;
    }, clone());

    expect(result.exports).toEqual([
      'FpbModeler', 'LayerOverview', 'PropertiesPanel', 'createFpbModeler', 'default',
      'defaultConfig', 'defaultPropertiesConfig', 'getClasses', 'layoutImportData', 'needsLayout'
    ]);
    expect(result.defaultIsFactory).toBe(true);
    expect(result.processes).toBe(3);
    expect(result.root).toBe(MAIN);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

test.describe('createFpbModeler', () => {

  test('rejects without a container', async ({ page }) => {
    await openLibraryPage(page);

    const messages = await page.evaluate(async () => {
      const attempt = async (arg) => {
        try {
          await window.FpbJS.createFpbModeler(arg);
          return 'resolved';
        } catch (e) {
          return e.message;
        }
      };
      return [await attempt(), await attempt({}), await attempt({ container: null })];
    });

    expect(messages).toEqual(['Container element is required', 'Container element is required', 'Container element is required']);
  });

  test('creates a canvas only modeler without panels', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page);

    const state = await page.evaluate(() => {
      const fpb = window.fpb;
      return {
        hasModeler: !!fpb.modeler,
        sameService: fpb.get('canvas') === fpb.modeler.get('canvas'),
        propertiesPanel: fpb.propertiesPanel,
        layerOverview: fpb.layerOverview,
        svgInContainer: !!document.querySelector('#modeler svg'),
        processes: fpb.getProcesses().length
      };
    });

    expect(state).toEqual({
      hasModeler: true, sameService: true, propertiesPanel: null, layerOverview: null,
      svgInContainer: true, processes: 0
    });
    expect(errors).toEqual([]);
  });

  test('mounts the properties panel and the layer overview into their containers', async ({ page }) => {
    const { errors } = await withModel(page, { panels: true });

    const state = await page.evaluate(() => ({
      propertiesPanel: !!window.fpb.propertiesPanel,
      layerOverview: !!window.fpb.layerOverview,
      propertiesHtml: document.getElementById('properties').children.length,
      layersHtml: document.getElementById('layers').children.length
    }));

    expect(state.propertiesPanel).toBe(true);
    expect(state.layerOverview).toBe(true);
    expect(state.propertiesHtml).toBeGreaterThan(0);
    expect(state.layersHtml).toBeGreaterThan(0);
    // With panels the import waits for them and still reaches the entry layer
    expect(await currentRootId(page)).toBe(MAIN);
    expect(errors).toEqual([]);
  });

  test('a properties config with showPanel false skips the properties panel', async ({ page }) => {
    await openLibraryPage(page);

    const state = await page.evaluate(async () => {
      const fpb = await window.FpbJS.createFpbModeler({
        container: document.getElementById('modeler'),
        propertiesContainer: document.getElementById('properties'),
        propertiesConfig: { propertiesPanel: { showPanel: false } }
      });
      return { propertiesPanel: fpb.propertiesPanel, children: document.getElementById('properties').children.length };
    });

    expect(state).toEqual({ propertiesPanel: null, children: 0 });
  });

  test('passes further options on to the modeler (additionalModules)', async ({ page }) => {
    await openLibraryPage(page);

    const value = await page.evaluate(async () => {
      const fpb = await window.FpbJS.createFpbModeler({
        container: document.getElementById('modeler'),
        additionalModules: [{ hostService: ['value', { answer: 42 }] }]
      });
      return fpb.get('hostService').answer;
    });

    expect(value).toBe(42);
  });

  test('two instances on one page are independent', async ({ page }) => {
    await openLibraryPage(page);

    const state = await page.evaluate(async (data) => {
      const make = () => {
        const host = document.createElement('div');
        host.style.cssText = 'width:600px;height:400px;position:absolute;left:0;top:0';
        document.body.appendChild(host);
        return window.FpbJS.createFpbModeler({ container: host });
      };
      const a = await make();
      const b = await make();
      await new Promise((resolve) => {
        a.on('import.done', resolve);
        a.importJSON(data);
        setTimeout(resolve, 8000);
      });
      return {
        a: a.getProcesses().length,
        b: b.getProcesses().length,
        bElements: b.get('elementRegistry').getAll().length,
        distinctBus: a.get('eventBus') !== b.get('eventBus')
      };
    }, clone());

    expect(state.a).toBe(3);
    expect(state.b).toBe(0);
    expect(state.bElements).toBeLessThanOrEqual(1); // only the empty root
    expect(state.distinctBus).toBe(true);
  });
});

// ---------------------------------------------------------------------------

test.describe('Import and export', () => {

  test('importJSON loads all layers and shows the entry point', async ({ page }) => {
    const { errors } = await withModel(page);

    const state = await page.evaluate(() => {
      const processes = window.fpb.getProcesses();
      return {
        first: processes[0].$type,
        processIds: processes.filter((p) => p.process).map((p) => p.process.id),
        elements: window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator').length
      };
    });

    expect(state.first).toBe('fpb:Project');
    expect(state.processIds).toEqual([MAIN, CHILD]);
    expect(state.elements).toBe(2);
    expect(await currentRootId(page)).toBe(MAIN);
    expect(errors).toEqual([]);
  });

  test('importJSON replaces the model instead of appending', async ({ page }) => {
    await withModel(page);
    expect(await importModel(page, clone())).toBe(true);

    const state = await page.evaluate(() => ({
      processes: window.fpb.getProcesses().length,
      projects: window.fpb.getProcesses().filter((p) => p.$type === 'fpb:Project').length
    }));

    expect(state).toEqual({ processes: 3, projects: 1 });
  });

  test('importJSON does not modify the passed object', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);

    const same = await page.evaluate((data) => new Promise((resolve) => {
      const before = JSON.stringify(data);
      window.fpb.on('import.done', () => resolve(JSON.stringify(data) === before));
      window.fpb.importJSON(data);
      setTimeout(() => resolve('timeout'), 8000);
    }), clone());

    expect(same).toBe(true);
  });

  test('invalid JSON data reports an import error and keeps the current model', async ({ page }) => {
    await withModel(page);

    const result = await page.evaluate(() => new Promise((resolve) => {
      window.fpb.on('import.error', (e) => resolve({
        error: !!e,
        processes: window.fpb.getProcesses().length,
        root: window.fpb.get('canvas').getRootElement().id
      }));
      window.fpb.importJSON({ not: 'a model' });
      setTimeout(() => resolve('no import.error'), 4000);
    }));

    expect(result).toEqual({ error: true, processes: 3, root: MAIN });
  });

  test('toJSON returns a fresh array with the project and one entry per process', async ({ page }) => {
    await withModel(page);

    const state = await page.evaluate(() => {
      const json = window.fpb.toJSON();
      const again = window.fpb.toJSON();
      const processes = json.filter((p) => p.process);
      return {
        isArray: Array.isArray(json),
        notTheStore: json !== window.fpb.getProcesses() && json !== again,
        length: json.length,
        project: json[0].$type,
        processIds: processes.map((p) => p.process.id),
        dataCounts: processes.map((p) => p.elementDataInformation.length),
        visualCounts: processes.map((p) => p.elementVisualInformation.length)
      };
    });

    expect(state.isArray).toBe(true);
    expect(state.notTheStore).toBe(true);
    expect(state.length).toBe(3);
    expect(state.project).toBe('fpb:Project');
    expect(state.processIds).toEqual([MAIN, CHILD]);
    // Same element sets as the imported file
    expect(state.dataCounts).toEqual([basis[1].elementDataInformation.length, basis[2].elementDataInformation.length]);
    expect(state.visualCounts).toEqual(state.dataCounts);
  });

  test('toJSON reflects edits made after the import', async ({ page }) => {
    await withModel(page);

    const names = await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.get('modeling').updateLabel(operator, 'Renamed via API');
      const entry = window.fpb.toJSON().find((p) => p.process && p.process.id === window.fpb.get('canvas').getRootElement().id);
      return entry.elementDataInformation.filter((e) => e.id === operator.id).map((e) => e.name);
    });

    expect(names).toEqual(['Renamed via API']);
  });

  test('toJSON output can be imported again (importJSON(toJSON()))', async ({ page }) => {
    await withModel(page);

    const before = await page.evaluate(() => window.fpb.get('elementRegistry').getAll().map((e) => e.id).sort());
    const ok = await page.evaluate(() => new Promise((resolve) => {
      const json = window.fpb.toJSON();
      window.fpb.on('import.done', () => resolve(true));
      window.fpb.importJSON(json);
      setTimeout(() => resolve(false), 8000);
    }));
    expect(ok).toBe(true);

    // The entry layer again, with the same elements
    expect(await currentRootId(page)).toBe(MAIN);
    const after = await page.evaluate(() => window.fpb.get('elementRegistry').getAll().map((e) => e.id).sort());
    expect(after).toEqual(before);
    expect(await page.evaluate(() => window.fpb.getProcesses().length)).toBe(3);
  });

  test('toJSON output can be serialized with JSON.stringify', async ({ page }) => {
    // d.ts: "Export the current diagram as a JSON object"; a host sends it to a
    // backend or stores it (see the fire() example in the typings).
    await withModel(page);

    const result = await page.evaluate(() => {
      try {
        return JSON.parse(JSON.stringify(window.fpb.toJSON())).length;
      } catch (e) {
        return e.message;
      }
    });

    expect(result).toBe(3);
  });

  test('toXML exports all layers as VDI 3682 XML', async ({ page }) => {
    await withModel(page);

    const xml = await page.evaluate(() => window.fpb.toXML());
    expect(typeof xml).toBe('string');
    expect(xml.startsWith('<?xml')).toBe(true);

    const parsed = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const info = doc.getElementsByTagName('projectInformation')[0];
      return {
        parseError: doc.getElementsByTagName('parsererror').length,
        root: doc.documentElement.localName,
        entryPoint: info && info.getAttribute('entryPoint'),
        processes: doc.getElementsByTagName('process').length,
        operators: doc.getElementsByTagName('processOperator').length
      };
    }, xml);

    expect(parsed.parseError).toBe(0);
    expect(parsed.root).toBe('project');
    expect(parsed.entryPoint).toBe(MAIN);
    expect(parsed.processes).toBe(2);
    expect(parsed.operators).toBeGreaterThanOrEqual(4);
  });

  test('importXML(toXML()) restores the model', async ({ page }) => {
    await withModel(page);

    const before = await page.evaluate(() => window.fpb.toJSON()
      .filter((p) => p.process)
      .map((p) => p.process.id + ':' + p.elementDataInformation.map((e) => e.id).sort().join(',')));
    const xml = await page.evaluate(() => window.fpb.toXML());

    await page.evaluate(() => window.fpb.newModel());
    expect(await page.evaluate(() => window.fpb.getProcesses().length)).toBe(0);

    expect(await importXml(page, xml)).toBe(true);
    const after = await page.evaluate(() => window.fpb.toJSON()
      .filter((p) => p.process)
      .map((p) => p.process.id + ':' + p.elementDataInformation.map((e) => e.id).sort().join(',')));

    expect(after).toEqual(before);
    expect(await currentRootId(page)).toBe(MAIN);
  });

  test('importXML parses a foreign XML document (not the last export)', async ({ page }) => {
    await withModel(page);
    const xml = await page.evaluate(() => window.fpb.toXML());

    // A second, independent modeler never exported: its mapper must parse the file
    const state = await page.evaluate(async (text) => {
      const host = document.createElement('div');
      host.style.cssText = 'width:600px;height:400px;position:absolute;left:0;top:0';
      document.body.appendChild(host);
      const other = await window.FpbJS.createFpbModeler({ container: host });
      await new Promise((resolve, reject) => {
        other.on('import.done', resolve);
        other.importXML(text).catch(reject);
        setTimeout(resolve, 8000);
      });
      return {
        processIds: other.getProcesses().filter((p) => p.process).map((p) => p.process.id),
        root: other.get('canvas').getRootElement().id,
        operators: other.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator').length
      };
    }, xml);

    expect(state.processIds.sort()).toEqual([MAIN, CHILD].sort());
    expect(state.root).toBe(MAIN);
    expect(state.operators).toBe(2);
  });

  test('importXML rejects invalid XML and keeps the current model', async ({ page }) => {
    await withModel(page);

    const result = await page.evaluate(async () => {
      const outcomes = [];
      for (const input of ['<project><unclosed>', 'not xml at all', '']) {
        try {
          await window.fpb.importXML(input);
          outcomes.push('resolved');
        } catch (e) {
          outcomes.push('rejected');
        }
      }
      return {
        outcomes,
        processes: window.fpb.getProcesses().length,
        root: window.fpb.get('canvas').getRootElement().id
      };
    });

    expect(result).toEqual({ outcomes: ['rejected', 'rejected', 'rejected'], processes: 3, root: MAIN });
  });

  test('newModel empties canvas, data store and undo history', async ({ page }) => {
    await withModel(page);
    await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.get('modeling').moveElements([operator], { x: 20, y: 0 });
    });
    expect(await page.evaluate(() => window.fpb.get('commandStack').canUndo())).toBe(true);

    const state = await page.evaluate(() => {
      window.fpb.newModel();
      return {
        processes: window.fpb.getProcesses().length,
        json: window.fpb.toJSON().length,
        fpbElements: window.fpb.get('elementRegistry').filter((e) => e.type && e.type.startsWith('fpb:') && e.type !== 'fpb:Process').length,
        canUndo: window.fpb.get('commandStack').canUndo()
      };
    });

    expect(state).toEqual({ processes: 0, json: 0, fpbElements: 0, canUndo: false });

    // A model can be imported afterwards as usual
    expect(await importModel(page, clone())).toBe(true);
    expect(await currentRootId(page)).toBe(MAIN);
  });
});

// ---------------------------------------------------------------------------

test.describe('Image and PDF export', () => {

  test('toSVG returns a standalone SVG document of the current layer', async ({ page }) => {
    await withModel(page);

    const svg = await page.evaluate(() => window.fpb.toSVG());
    expect(svg.startsWith('<?xml')).toBe(true);

    const parsed = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const root = doc.documentElement;
      return {
        parseError: doc.getElementsByTagName('parsererror').length,
        root: root.localName,
        width: Number(root.getAttribute('width')),
        height: Number(root.getAttribute('height')),
        viewBox: (root.getAttribute('viewBox') || '').split(' ').length,
        grid: text.includes('djs-grid-pattern')
      };
    }, svg);

    expect(parsed.parseError).toBe(0);
    expect(parsed.root).toBe('svg');
    expect(parsed.width).toBeGreaterThan(0);
    expect(parsed.height).toBeGreaterThan(0);
    expect(parsed.viewBox).toBe(4);
    expect(parsed.grid).toBe(false);
  });

  test('toPNG returns a PNG data URL; scale sets the pixel size', async ({ page }) => {
    await withModel(page);

    const result = await page.evaluate(async () => {
      const size = (url) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = url;
      });
      const standard = await window.fpb.toPNG();
      const single = await window.fpb.toPNG({ scale: 1, backgroundColor: '#ff0000' });
      // Background colour: the top left pixel of the scale 1 image
      const img = new Image();
      await new Promise((resolve) => { img.onload = resolve; img.src = single; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const pixel = Array.from(ctx.getImageData(0, 0, 1, 1).data);
      return {
        prefix: standard.slice(0, 22),
        standard: await size(standard),
        single: await size(single),
        pixel
      };
    });

    expect(result.prefix).toBe('data:image/png;base64,');
    expect(result.single.w).toBeGreaterThan(0);
    // Default scale is 2
    expect(Math.abs(result.standard.w - 2 * result.single.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.standard.h - 2 * result.single.h)).toBeLessThanOrEqual(1);
    expect(result.pixel).toEqual([255, 0, 0, 255]);
  });

  test('toPDF returns a one page PDF blob of the current layer', async ({ page }) => {
    await withModel(page);

    const info = await pdfInfo(page, 'window.fpb.toPDF({ title: "Library Test" })');

    expect(info.isBlob).toBe(true);
    expect(info.type).toBe('application/pdf');
    expect(info.header).toBe('%PDF-');
    expect(info.pages).toBe(1);
    expect(info.titles.join()).toContain('Library Test');
    expect(await currentRootId(page)).toBe(MAIN);
  });

  test('toPDF allLayers writes one page per layer and returns to the start layer', async ({ page }) => {
    await withModel(page);

    const info = await pdfInfo(page, 'window.fpb.toPDF({ allLayers: true, scale: 1 })');

    expect(info.type).toBe('application/pdf');
    expect(info.pages).toBe(2);
    expect(await currentRootId(page)).toBe(MAIN);
  });

  test('toPDF allLayers keeps the undo history', async ({ page }) => {
    await withModel(page);

    const moved = await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      const x = operator.x;
      window.fpb.get('modeling').moveElements([operator], { x: 40, y: 0 });
      return { id: operator.id, x };
    });

    const switched = [];
    await page.exposeFunction('__switched', (id) => switched.push(id));
    await page.evaluate(() => window.fpb.on('process.switched', (e) => { window.__switched(e.selectedProcess && e.selectedProcess.id); }));

    await pdfInfo(page, 'window.fpb.toPDF({ allLayers: true, scale: 1 })');

    expect(await currentRootId(page)).toBe(MAIN);
    expect(await page.evaluate(() => window.fpb.get('commandStack').canUndo())).toBe(true);
    await page.evaluate(() => window.fpb.get('commandStack').undo());
    expect(await page.evaluate((id) => window.fpb.get('elementRegistry').get(id).x, moved.id)).toBe(moved.x);
    // The walk passed through the child layer and ended on the start layer
    expect(switched).toContain(CHILD);
    expect(switched[switched.length - 1]).toBe(MAIN);
  });

  test('toPDF allLayers started on a child layer returns to that layer', async ({ page }) => {
    await withModel(page);
    await page.evaluate((id) => window.fpb.switchProcess(id), CHILD);
    expect(await currentRootId(page)).toBe(CHILD);

    const info = await pdfInfo(page, 'window.fpb.toPDF({ allLayers: true, scale: 1, orientation: "portrait", format: "a3" })');

    expect(info.pages).toBe(2);
    expect(await currentRootId(page)).toBe(CHILD);
  });
});

// ---------------------------------------------------------------------------

test.describe('Viewport, selection and layers', () => {

  test('zoom sets the zoom level', async ({ page }) => {
    await withModel(page);

    const zooms = await page.evaluate(() => {
      const canvas = window.fpb.get('canvas');
      window.fpb.zoom(0.5);
      const half = canvas.zoom();
      window.fpb.zoom(1.5);
      const more = canvas.zoom();
      window.fpb.zoom('fit-viewport');
      return { half, more, fit: canvas.zoom() };
    });

    expect(zooms.half).toBeCloseTo(0.5, 5);
    expect(zooms.more).toBeCloseTo(1.5, 5);
    expect(zooms.fit).toBeGreaterThan(0);
  });

  test('getZoom returns the current zoom level', async ({ page }) => {
    await withModel(page);

    const zooms = await page.evaluate(() => {
      window.fpb.zoom(0.5);
      const half = window.fpb.getZoom();
      window.fpb.zoom(1.25);
      return { half, more: window.fpb.getZoom(), same: window.fpb.getZoom() === window.fpb.get('canvas').zoom() };
    });

    expect(zooms.half).toBeCloseTo(0.5, 5);
    expect(zooms.more).toBeCloseTo(1.25, 5);
    expect(zooms.same).toBe(true);
  });

  test('select selects an element by id; getSelected returns it', async ({ page }) => {
    await withModel(page);

    const state = await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      const found = window.fpb.select(operator.id);
      return { found, selected: window.fpb.getSelected().map((e) => e.id), id: operator.id };
    });

    expect(state.found).toBe(true);
    expect(state.selected).toEqual([state.id]);
  });

  test('select with an unknown id returns false and keeps the selection', async ({ page }) => {
    await withModel(page);

    const state = await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.select(operator.id);
      const found = window.fpb.select('does-not-exist');
      return { found, selected: window.fpb.getSelected().map((e) => e.id), id: operator.id };
    });

    expect(state.found).toBe(false);
    expect(state.selected).toEqual([state.id]);
  });

  test('select with scroll brings an off-screen element into view', async ({ page }) => {
    await withModel(page);

    const state = await page.evaluate(() => {
      const canvas = window.fpb.get('canvas');
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      canvas.zoom(1);
      // Move the view far away from the element
      canvas.scroll({ dx: -5000, dy: -5000 });
      const inView = () => {
        const box = canvas.viewbox();
        return operator.x + operator.width > box.x && operator.x < box.x + box.width
          && operator.y + operator.height > box.y && operator.y < box.y + box.height;
      };
      const before = inView();
      const found = window.fpb.select(operator.id, { scroll: true });
      return { before, found, after: inView() };
    });

    expect(state).toEqual({ before: false, found: true, after: true });
  });

  test('getProcesses returns the live data store', async ({ page }) => {
    await withModel(page);

    const state = await page.evaluate(() => ({
      same: window.fpb.getProcesses() === window.fpb.getProcesses(),
      store: window.fpb.getProcesses() === window.fpb.modeler.getProcesses(),
      entryPoint: window.fpb.getProcesses()[0].entryPoint && window.fpb.getProcesses()[0].entryPoint.id
    }));

    expect(state).toEqual({ same: true, store: true, entryPoint: MAIN });
  });

  test('switchProcess(id) switches the layer and fires process.switched', async ({ page }) => {
    await withModel(page);

    const state = await page.evaluate((child) => {
      const events = [];
      window.fpb.on('process.switched', (e) => { events.push(e.selectedProcess && e.selectedProcess.id); });
      window.fpb.switchProcess(child);
      const root = window.fpb.get('canvas').getRootElement().id;
      const operators = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator' && e.parent)
        .filter((e) => {
          let p = e.parent;
          while (p.parent) { p = p.parent; }
          return p.id === child;
        }).length;
      return { root, events, operators };
    }, CHILD);

    expect(state.root).toBe(CHILD);
    expect(state.events).toEqual([CHILD]);
    expect(state.operators).toBe(2);

    await page.evaluate((main) => window.fpb.switchProcess(main), MAIN);
    expect(await currentRootId(page)).toBe(MAIN);
  });

  test('switchProcess with an unknown id does nothing', async ({ page }) => {
    await withModel(page);

    const state = await page.evaluate(() => {
      const events = [];
      window.fpb.on('process.switched', () => { events.push(1); });
      let error = null;
      try {
        window.fpb.switchProcess('no-such-process');
        window.fpb.switchProcess(undefined);
      } catch (e) {
        error = e.message;
      }
      return { error, events: events.length, root: window.fpb.get('canvas').getRootElement().id };
    });

    expect(state).toEqual({ error: null, events: 0, root: MAIN });
  });

  test('switchProcess before any import does not throw', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);

    const error = await page.evaluate(() => {
      try {
        window.fpb.switchProcess('anything');
        return null;
      } catch (e) {
        return e.message;
      }
    });

    expect(error).toBeNull();
  });

  test('get(serviceName) returns the documented services, unknown names throw', async ({ page }) => {
    await withModel(page);

    const state = await page.evaluate(() => {
      const names = ['eventBus', 'canvas', 'modeling', 'selection', 'elementRegistry', 'commandStack',
        'elementFactory', 'fpbValidation', 'fpbSearch', 'fpbAppend', 'fpbCopyPaste', 'layerUndoBoundary',
        'uiReadiness', 'colorSchemeService'];
      const missing = names.filter((n) => {
        try { return !window.fpb.get(n); } catch (e) { return true; }
      });
      let unknown = null;
      try { window.fpb.get('noSuchService'); } catch (e) { unknown = e.message; }
      return {
        missing,
        sameInstance: window.fpb.get('canvas') === window.fpb.get('canvas'),
        unknown,
        issues: Array.isArray(window.fpb.get('fpbValidation').run())
      };
    });

    expect(state.missing).toEqual([]);
    expect(state.sameInstance).toBe(true);
    expect(state.unknown).toMatch(/noSuchService/);
    expect(state.issues).toBe(true);
  });
});

// ---------------------------------------------------------------------------

test.describe('Events (on / off / fire)', () => {

  /** Registers a counting listener for a facade event name in the page */
  const listen = (page, name) => page.evaluate((n) => {
    window.__events = window.__events || {};
    window.__events[n] = [];
    window.__handlers = window.__handlers || {};
    // Block body: a listener that returns a value stops the event for the modeler
    window.__handlers[n] = (e) => {
      window.__events[n].push({
        type: e && e.type,
        id: e && e.element && e.element.id,
        selection: e && e.newSelection && e.newSelection.map((s) => s.id)
      });
    };
    window.fpb.on(n, window.__handlers[n]);
  }, name);

  const received = (page, name) => page.evaluate((n) => window.__events[n], name);
  const stopListening = (page, name) => page.evaluate((n) => window.fpb.off(n, window.__handlers[n]), name);

  /** A connection and a technical resource of the entry layer */
  const pick = (page) => page.evaluate(() => {
    const registry = window.fpb.get('elementRegistry');
    return {
      connection: registry.filter((e) => e.type === 'fpb:Flow' || e.type === 'fpb:ParallelFlow')[0].id,
      resource: registry.filter((e) => e.type === 'fpb:TechnicalResource')[0].id
    };
  });

  test("'changed' fires on every command", async ({ page }) => {
    await withModel(page);
    await listen(page, 'changed');

    await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.get('modeling').moveElements([operator], { x: 10, y: 0 });
      window.fpb.get('commandStack').undo();
    });

    const events = await received(page, 'changed');
    expect(events.length).toBe(2);
    expect(events[0].type).toBe('commandStack.changed');
  });

  test("'element.added' and 'element.removed' cover shapes and connections", async ({ page }) => {
    await withModel(page);
    const { connection, resource } = await pick(page);
    await listen(page, 'element.added');
    await listen(page, 'element.removed');

    await page.evaluate(({ connection, resource }) => {
      const registry = window.fpb.get('elementRegistry');
      const modeling = window.fpb.get('modeling');
      modeling.removeConnection(registry.get(connection));
      modeling.removeShape(registry.get(resource));
      window.fpb.get('commandStack').undo();
      window.fpb.get('commandStack').undo();
    }, { connection, resource });

    const removed = await received(page, 'element.removed');
    const added = await received(page, 'element.added');
    expect(removed.map((e) => e.type)).toEqual(expect.arrayContaining(['connection.removed', 'shape.removed']));
    expect(removed.map((e) => e.id)).toEqual(expect.arrayContaining([connection, resource]));
    expect(added.map((e) => e.type)).toEqual(expect.arrayContaining(['connection.added', 'shape.added']));
    expect(added.map((e) => e.id)).toEqual(expect.arrayContaining([connection, resource]));
  });

  test("off() removes the listener from every mapped event", async ({ page }) => {
    await withModel(page);
    const { connection, resource } = await pick(page);
    await listen(page, 'element.removed');
    await listen(page, 'changed');
    await stopListening(page, 'element.removed');
    await stopListening(page, 'changed');

    await page.evaluate(({ connection, resource }) => {
      const registry = window.fpb.get('elementRegistry');
      window.fpb.get('modeling').removeConnection(registry.get(connection));
      window.fpb.get('modeling').removeShape(registry.get(resource));
    }, { connection, resource });

    expect(await received(page, 'element.removed')).toEqual([]);
    expect(await received(page, 'changed')).toEqual([]);
  });

  test("'element.changed' fires with the changed element", async ({ page }) => {
    await withModel(page);
    await listen(page, 'element.changed');

    const id = await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.get('modeling').moveElements([operator], { x: 10, y: 0 });
      return operator.id;
    });

    const events = await received(page, 'element.changed');
    expect(events.map((e) => e.id)).toContain(id);
  });

  test("'selection.changed' carries the new selection", async ({ page }) => {
    await withModel(page);
    await listen(page, 'selection.changed');

    const id = await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.select(operator.id);
      return operator.id;
    });

    const events = await received(page, 'selection.changed');
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].selection).toEqual([id]);
  });

  test("'import.report' is passed through for an import with warnings", async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);

    const warnings = await page.evaluate((data) => new Promise((resolve) => {
      data.slice(1).forEach((p) => { p.elementVisualInformation = []; });
      window.fpb.on('import.report', (e) => resolve(e.warnings.map((w) => typeof w.message)));
      window.fpb.importJSON(data);
      setTimeout(() => resolve(null), 8000);
    }), clone());

    expect(warnings).not.toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
    warnings.forEach((type) => expect(type).toBe('string'));
  });

  test("a host listener's return value does not disturb the modeler", async ({ page }) => {
    // d.ts types the callbacks as returning void, and a host naturally writes
    // `fpb.on('changed', () => dirty = true)`. on() hands the callback straight
    // to the diagram-js event bus, where a returned value stops the event: the
    // renderer's bridge update (commandStack.changed, priority 100) never runs.
    await withModel(page);

    const calls = await page.evaluate(() => {
      const renderer = window.fpb.get('fpbRenderer');
      let calls = 0;
      const original = renderer._updateCrossingBridges;
      renderer._updateCrossingBridges = function () {
        calls++;
        return original.apply(this, arguments);
      };
      let dirty = false;
      window.fpb.on('changed', () => dirty = true);
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.get('modeling').moveElements([operator], { x: 10, y: 0 });
      return { calls, dirty };
    });

    expect(calls.dirty).toBe(true);
    expect(calls.calls).toBeGreaterThan(0);
  });

  test('unmapped names reach the internal event bus; the return value of a host listener is ignored', async ({ page }) => {
    await withModel(page);

    const state = await page.evaluate(() => {
      const got = [];
      const handler = (e) => { got.push(e.payload); return 'answer'; };
      window.fpb.on('host.custom', handler);
      const result = window.fpb.fire('host.custom', { payload: 1 });
      // Internal events are reachable too
      let internal = 0;
      window.fpb.on('commandStack.changed', () => { internal++; });
      window.fpb.get('eventBus').fire('commandStack.changed', {});
      window.fpb.off('host.custom', handler);
      const afterOff = window.fpb.fire('host.custom', { payload: 2 });
      return { got, result, afterOff: afterOff === undefined, internal };
    });

    // Host listeners only observe: a returned value would stop the event for
    // the modeler's own listeners, so on() drops it (see src/index.js)
    expect(state).toEqual({ got: [1], result: undefined, afterOff: true, internal: 1 });
  });
});

// ---------------------------------------------------------------------------

test.describe('destroy', () => {

  test('destroy removes the canvas from the host container', async ({ page }) => {
    const { errors } = await withModel(page);

    const state = await page.evaluate(() => {
      let destroyed = 0;
      // Block body: a listener returning a value stops the event
      window.fpb.on('diagram.destroy', () => { destroyed++; });
      window.fpb.destroy();
      return { destroyed, svg: !!document.querySelector('#modeler svg') };
    });

    expect(state).toEqual({ destroyed: 1, svg: false });
    expect(errors).toEqual([]);
  });

  test('destroy leaves the host container empty', async ({ page }) => {
    test.fail(true, 'BUG: destroy() leaves the outer .djs-container wrapper div of FpbModeler in the host container');
    await withModel(page);

    const children = await page.evaluate(() => {
      window.fpb.destroy();
      return document.getElementById('modeler').children.length;
    });

    expect(children).toBe(0);
  });

  test('destroy unmounts the properties panel and the layer overview', async ({ page }) => {
    test.fail(true, 'BUG: destroy() does not unmount the React panels (PropertiesPanel/LayerOverview have no destroy())');
    await withModel(page, { panels: true });

    const state = await page.evaluate(() => {
      window.fpb.destroy();
      return {
        properties: document.getElementById('properties').children.length,
        layers: document.getElementById('layers').children.length
      };
    });

    expect(state).toEqual({ properties: 0, layers: 0 });
  });

  test('a new modeler can be created in the same container after destroy', async ({ page }) => {
    const { errors } = await withModel(page, { panels: true });

    await page.evaluate(() => window.fpb.destroy());
    await createModeler(page);
    expect(await importModel(page, clone())).toBe(true);

    const state = await page.evaluate(() => ({
      svgs: document.querySelectorAll('#modeler svg.djs-container, #modeler .djs-container > svg').length,
      processes: window.fpb.getProcesses().length,
      root: window.fpb.get('canvas').getRootElement().id
    }));

    expect(state.svgs).toBe(1);
    expect(state.processes).toBe(3);
    expect(state.root).toBe(MAIN);
    expect(errors).toEqual([]);
  });
});
