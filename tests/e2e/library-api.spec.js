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
        // 2.0 (016b T8): the properties panel has no config any more
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
      defaultPropertiesConfig: 'undefined'
    });
    // The top level classes are the server stubs; the real ones come from getClasses()
    exports.stubErrors.forEach((message) => expect(message).toMatch(/browser environment/));
    expect(errors).toEqual([]);
  });

  test('getClasses() returns the real classes and the built-in config in the browser', async ({ page }) => {
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
        keys: Object.keys(c).sort()
      };
    });

    expect(classes).toMatchObject({
      FpbModeler: 'function', stub: false, hasNewModel: 'function',
      PropertiesPanel: 'function', LayerOverview: 'function',
      keys: ['FpbModeler', 'LayerOverview', 'PropertiesPanel', 'defaultConfig']
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

  // 016f E1, V5, V6, T6
  test('the bundles contain neither React nor Bootstrap', () => {
    const fs = require('fs');
    const path = require('path');
    const lib = path.join(__dirname, '..', '..', 'dist');
    for (const file of ['fpbjs.js', 'fpbjs.esm.js', 'fpbjs-aml.js', 'fpbjs-aml.esm.js']) {
      const text = fs.readFileSync(path.join(lib, file), 'utf8');
      // booleans: a failing match would print the whole bundle
      expect({
        reactDom: text.includes('react-dom'),
        reactRoot: text.includes('__reactContainer'),
        bootstrapButtons: text.includes('--bs-btn-padding-x'),
        bootstrapBanner: /Bootstrap\s+v5/.test(text)
      }, file).toEqual({ reactDom: false, reactRoot: false, bootstrapButtons: false, bootstrapBanner: false });
    }
    // the package says what it is (016g E5)
    const description = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')).description;
    expect(description).not.toMatch(/React/);
  });

  // 016g E1
  test('a host without the theme module gets a toolbar without the light and dark button', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    const result = await page.evaluate(async () => {
      const { FpbModeler } = await window.FpbJS.getClasses();
      const modules = FpbModeler.prototype._modules.filter((module) => !module.fpbTheme);
      const layers = document.getElementById('layers');
      try {
        window.fpb = await window.FpbJS.createFpbModeler({ container: document.getElementById('modeler'), layerContainer: layers, modules });
      } catch (error) {
        return { error: error.message };
      }
      return {
        error: null,
        toolbar: !!layers.querySelector('.fpb-toolbar #exportButton'),
        themeButton: !!layers.querySelector('[aria-label="Switch to Dark Mode"], [aria-label="Switch to Light Mode"]')
      };
    });
    expect(result).toEqual({ error: null, toolbar: true, themeButton: false });
    expect(errors).toEqual([]);
  });

  test('the library leaves the styles of the host page alone', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    const look = () => page.evaluate(() => {
      const probe = document.createElement('p');
      probe.textContent = 'host text';
      document.body.appendChild(probe);
      const body = getComputedStyle(document.body);
      const p = getComputedStyle(probe);
      const out = [body.fontFamily, body.fontSize, body.lineHeight, body.color, p.marginTop, p.marginBottom, getComputedStyle(probe).boxSizing].join('|');
      probe.remove();
      return out;
    });
    const before = await look();
    await createModeler(page, { panels: true });
    expect(await look()).toBe(before);
    const bootstrapRules = await page.evaluate(() => Array.from(document.querySelectorAll('style')).some((s) => s.textContent.includes('.btn{') || s.textContent.includes('--bs-')));
    expect(bootstrapRules).toBe(false);
    expect(errors).toEqual([]);
  });

  // 016g F1
  test('a host that imports right after creating the modeler never shows the start card', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    const seen = await page.evaluate(async (data) => {
      const container = document.getElementById('modeler');
      const fpb = window.fpb = await window.FpbJS.createFpbModeler({ container });
      const shown = () => !!container.querySelector('.fpb-start');
      const result = [];
      const done = new Promise((resolve) => fpb.on('import.done', resolve));
      fpb.importJSON(data);
      result.push(shown());
      await new Promise((resolve) => requestAnimationFrame(resolve));
      result.push(shown());
      await done;
      result.push(shown());
      return result;
    }, clone());
    expect(seen).toEqual([false, false, false]);
    expect(errors).toEqual([]);
  });

  // 016g F3
  test('an example that finishes loading after destroy adds nothing', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    let release = null;
    await page.route('**/slow-example.json', async (route) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(clone()) });
    });
    await page.evaluate(async () => {
      const container = document.getElementById('modeler');
      const fpb = await window.FpbJS.createFpbModeler({ container, examples: [{ title: 'Slow', url: '/slow-example.json' }] });
      const start = fpb.get('fpbStart');
      window.__loading = start.openExample(start.examples()[0]);
      fpb.destroy();
    });
    await expect.poll(() => release !== null).toBe(true);
    release();
    expect(await page.evaluate(() => window.__loading)).toBe(false);
    expect(await page.locator('.fpb-start').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  // 016g D2
  test('after destroy the dialogs open nothing and add no container', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page);
    const result = await page.evaluate(async () => {
      const dialogs = window.fpb.get('fpbDialogs');
      window.fpb.destroy();
      const handle = dialogs.open(() => null);
      const state = await Promise.race([
        handle.closed.then((value) => (value === undefined ? 'closed' : 'answered')),
        new Promise((resolve) => setTimeout(() => resolve('open'), 1000))
      ]);
      return {
        state,
        containers: document.querySelectorAll('.fpb-dialogs').length,
        dialogs: document.querySelectorAll('dialog.fpb-dialog').length
      };
    });
    expect(result).toEqual({ state: 'closed', containers: 0, dialogs: 0 });
    expect(errors).toEqual([]);
  });

  test('the ESM bundle exposes the same API and creates a working modeler', async ({ page }) => {
    const { errors } = await openLibraryPage(page);

    const result = await page.evaluate(async (data) => {
      // 016f E1, V6: no React to map, no import map; the bundle loads as it is
      const source = await (await fetch('/fpbjs.esm.js')).text();
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const esm = await import(url);

      const host = document.createElement('div');
      host.style.cssText = 'width:800px;height:600px;position:absolute;left:0;top:0';
      document.body.appendChild(host);
      const layers = document.createElement('div');
      document.body.appendChild(layers);
      const fpb = await esm.createFpbModeler({ container: host, layerContainer: layers });
      await new Promise((resolve) => {
        fpb.on('import.done', resolve);
        fpb.importJSON(data);
        setTimeout(resolve, 8000);
      });
      const out = {
        imports: /from\s*"(react|react-dom)"/.test(source),
        toolbar: !!layers.querySelector('.fpb-toolbar #exportButton'),
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
      'defaultConfig', 'getClasses', 'layoutImportData', 'needsLayout'
    ]);
    expect(result.defaultIsFactory).toBe(true);
    expect(result.imports).toBe(false);
    expect(result.toolbar).toBe(true);
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

  // Review Focus 1 (B3): propertiesConfig of 1.x is answered, not broken on
  test('an old propertiesConfig is ignored with a warning', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && message.text().includes('propertiesConfig')) {
        warnings.push(message.text());
      }
    });
    await createModeler(page, { panels: true, options: { propertiesConfig: { propertiesPanel: { showPanel: false } } } });
    await expect(page.locator('#propertiesPanelToggle')).toBeVisible();
    expect(warnings).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('with panels the library shows the new properties panel', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { panels: true });
    await expect(page.locator('#propertiesPanelToggle')).toBeVisible();
    await expect(page.locator('#openPropertiesPanelButton')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // Review Focus 2 (B3): the plugin gives the panel at most 320 px with 5 px padding
  test('the open panel fits a narrow host column', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true });
    await page.locator('#propertiesPanelToggle').click();
    await expect(page.locator('.fpb-properties.open')).toBeVisible();
    const fits = () => page.evaluate(() => {
      const column = document.getElementById('properties');
      return column.scrollWidth <= column.clientWidth;
    });
    expect(await fits()).toBe(true);

    await page.addStyleTag({ content: '#properties { width: auto !important; max-width: 320px; padding: 5px; box-sizing: border-box; }' });
    expect(await fits()).toBe(true);

    // with a characteristic open nothing is cut off: the body hides what
    // runs over at the side (016g, gap of B3)
    expect(await importModel(page, clone())).toBe(true);
    await page.evaluate(() => {
      const state = window.fpb.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Rohstoff' && e.type !== 'label')[0];
      window.fpb.get('selection').select(state);
    });
    await page.locator('.fpb-characteristic-row').first().click();
    await expect(page.locator('.fpb-characteristic-tabs')).toBeVisible();
    const clipped = await page.evaluate(() => {
      const body = document.querySelector('.fpb-properties-body');
      const right = body.getBoundingClientRect().right;
      const controls = Array.from(body.querySelectorAll('input, button, select, textarea')).filter((e) => e.offsetParent);
      return {
        fits: body.scrollWidth <= body.clientWidth,
        outside: controls.filter((e) => e.getBoundingClientRect().right > right + 1).map((e) => e.id || e.className)
      };
    });
    expect(clipped).toEqual({ fits: true, outside: [] });
  });

  // Review Focus 4 (B3)
  test('a panel built through getClasses() with the arguments of 1.x appears', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    const shown = await page.evaluate(async () => {
      const c = await window.FpbJS.getClasses();
      const place = (left, width) => {
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;top:0;height:400px;left:' + left + 'px;width:' + width + 'px';
        document.body.appendChild(div);
        return div;
      };
      const canvas = place(0, 600);
      const panel = place(600, 320);
      const modeler = new c.FpbModeler({ container: canvas, configFile: c.defaultConfig });
      new c.PropertiesPanel({ container: panel, modeler, configPP: {} });
      return !!panel.querySelector('.fpb-properties');
    });
    expect(shown).toBe(true);
    expect(errors).toEqual([]);
  });

  // final review 016f E1, I3: a toolbar the host builds itself follows the theme too
  test('a toolbar built through getClasses() follows the theme of its modeler', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    const state = await page.evaluate(async () => {
      const c = await window.FpbJS.getClasses();
      const layers = document.getElementById('layers');
      const modeler = new c.FpbModeler({ container: document.getElementById('modeler'), configFile: c.defaultConfig, theme: 'dark' });
      const toolbar = new c.LayerOverview({ container: layers, modeler });
      const out = {
        ui: layers.classList.contains('fpb-ui'),
        theme: layers.getAttribute('data-theme'),
        lineHeight: getComputedStyle(layers.querySelector('.fpb-toolbar')).lineHeight
      };
      toolbar.destroy();
      modeler.destroy();
      return out;
    });
    expect(state).toEqual({ ui: true, theme: 'dark', lineHeight: '24px' });
    expect(errors).toEqual([]);
  });

  // final review of B3: a panel the host builds itself follows the theme like the facade's
  test('a panel built through getClasses() follows a dark host page', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const ratio = await page.evaluate(async (data) => {
      const c = await window.FpbJS.getClasses();
      const place = (left, width) => {
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;top:0;height:600px;left:' + left + 'px;width:' + width + 'px';
        document.body.appendChild(div);
        return div;
      };
      const canvas = place(0, 600);
      const panel = place(600, 360);
      const modeler = new c.FpbModeler({ container: canvas, configFile: c.defaultConfig });
      new c.PropertiesPanel({ container: panel, modeler });
      const eventBus = modeler.get('eventBus');
      await new Promise((resolve) => {
        eventBus.once('import.done', resolve);
        eventBus.fire('FPBJS.import', { data });
        setTimeout(resolve, 8000);
      });
      const operator = modeler.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      modeler.get('selection').select(operator);
      panel.querySelector('#propertiesPanelToggle').click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const field = panel.querySelector('.bio-properties-panel-input');
      const rgb = (value) => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const luminance = ([r, g, b]) => {
        const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const style = getComputedStyle(field);
      const a = luminance(rgb(style.color));
      const b = luminance(rgb(style.backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }, clone());
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(errors).toEqual([]);
  });

  // 016d V1: the breadcrumbs live in the canvas, so a host gets them too
  test('the breadcrumbs appear in the host container', async ({ page }) => {
    const { errors } = await withModel(page, { panels: true });
    await page.evaluate((id) => window.fpb.switchProcess(id), CHILD);
    await expect(page.locator('#modeler nav.fpb-breadcrumbs .fpb-breadcrumb-current')).toHaveText('Erhitzen');
    expect(errors).toEqual([]);
  });

  // 016e V2: messages belong to the modeler, not to the layer panel
  test('messages appear in the host container without a layer panel', async ({ page }) => {
    const { errors } = await withModel(page);
    await page.evaluate(() => window.fpb.get('fpbNotifications').show({ key: 'host', type: 'info', title: 'Hello host' }));
    await expect(page.locator('#modeler .fpb-notification[data-id="host"]')).toContainText('Hello host');
    expect(errors).toEqual([]);
  });

  // R10: the importer's messages do not depend on the layer panel
  test('a host without layer panel sees an import error and the import report', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);
    await page.evaluate(() => window.fpb.get('eventBus').fire('FPBJS.import', { data: [{ notAProject: true }] }));
    await expect(page.locator('#modeler .fpb-notification--error')).toContainText('Import Error');

    const withoutLayout = clone();
    withoutLayout.forEach((entry) => {
      if (entry.process) {
        delete entry.elementVisualInformation;
      }
    });
    expect(await importModel(page, withoutLayout)).toBe(true);
    await expect(page.locator('#modeler [data-id="import.report"]')).toContainText('Import completed with');
  });

  test('the offer of a backup also appears without layer panel', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { options: { autosave: true } });
    await page.evaluate(() => window.fpb.get('autosave').ready());
    expect(await importModel(page, clone())).toBe(true);
    await page.evaluate(() => {
      const element = window.fpb.get('elementRegistry')
        .filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpb.get('modeling').updateLabel(element, 'Erwärmen');
      return window.fpb.get('autosave').flush();
    });

    await page.reload();
    await page.waitForFunction(() => window.FpbJS && typeof window.FpbJS.createFpbModeler === 'function');
    await createModeler(page, { options: { autosave: true } });
    await page.evaluate(() => window.fpb.get('autosave').ready());
    await expect(page.locator('#modeler [data-id="autosave.pending"]')).toContainText('Unsaved model found');
  });

  // 016e V2: questions belong to the modeler, not to the layer panel
  test('a host without layer panel gets the question when removing a decomposition', async ({ page }) => {
    const { errors } = await withModel(page);
    await page.evaluate((id) => window.fpb.switchProcess(id), CHILD);
    await page.evaluate(() => {
      const systemLimit = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      window.fpb.get('fpbDelete').remove([systemLimit]);
    });
    const dialog = page.locator('body > .fpb-dialogs > dialog.fpb-dialog[open]');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-answer="confirm"]').click();
    await expect.poll(() => currentRootId(page)).toBe(MAIN);
    expect(errors).toEqual([]);
  });

  // final review 016e D1: hosts that answered questions themselves before
  test('a host that answers a question itself through on() gets one answer and no second dialog', async ({ page }) => {
    await withModel(page);
    const seen = await page.evaluate(async () => {
      const seen = [];
      window.fpb.on('confirmation.confirmed', () => seen.push('confirmed'));
      window.fpb.on('confirmation.required', (e) => window.fpb.fire('confirmation.confirmed', { action: e.action }));
      window.fpb.fire('confirmation.required', { title: 'Mine', message: 'm', action: { type: 'host' } });
      await new Promise((r) => setTimeout(r, 300));
      seen.push('dialogs ' + document.querySelectorAll('dialog.fpb-dialog').length);
      return seen;
    });
    expect(seen).toEqual(['confirmed', 'dialogs 0']);
  });

  test('a host that answers a question later closes the open dialog without a second answer', async ({ page }) => {
    await withModel(page);
    await page.evaluate(() => {
      window.__seen = [];
      window.fpb.on('confirmation.confirmed', () => window.__seen.push('confirmed'));
      window.fpb.on('confirmation.cancelled', () => window.__seen.push('cancelled'));
      window.fpb.on('confirmation.required', (e) => {
        window.__answer = () => window.fpb.fire('confirmation.confirmed', { action: e.action });
      });
      window.fpb.fire('confirmation.required', { title: 'Later', message: 'm', action: { type: 'host' } });
    });
    await expect(page.locator('dialog.fpb-dialog[open]')).toBeVisible();
    await page.evaluate(() => window.__answer());
    await expect(page.locator('dialog.fpb-dialog')).toHaveCount(0);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__seen)).toEqual(['confirmed']);
  });

  test('with confirmations: false the modeler leaves questions to the host', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { options: { confirmations: false } });
    await page.evaluate(() => window.fpb.fire('confirmation.required', { title: 'Mine', message: 'm', action: { type: 'host' } }));
    await page.waitForTimeout(300);
    await expect(page.locator('dialog.fpb-dialog')).toHaveCount(0);
  });

  // Review Focus 2 (016e D1)
  test('destroy closes an open question as cancelled and leaves nothing behind', async ({ page }) => {
    await withModel(page);
    await page.evaluate(() => {
      window.fpb.get('fpbNotifications').show({ key: 'left', type: 'warning', title: 'Still here' });
      window.__answer = window.fpb.get('fpbDialogs').confirm({ title: 'Open question', message: 'm' });
    });
    await expect(page.locator('dialog.fpb-dialog[open]')).toBeVisible();
    const result = await page.evaluate(async () => {
      window.fpb.destroy();
      const answer = await window.__answer;
      return {
        answer,
        left: document.querySelectorAll('.fpb-dialogs, dialog.fpb-dialog, .fpb-notifications').length
      };
    });
    expect(result).toEqual({ answer: false, left: 0 });
  });

  test('showNewModel shows the New model button without the browser backup', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true });
    await expect(page.locator('#newModelButton')).toHaveCount(0);
    await page.evaluate(() => window.fpb.destroy());

    await createModeler(page, { panels: true, options: { showNewModel: true } });
    await expect(page.locator('#newModelButton')).toBeVisible();
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

/**
 * Sending the export to the host (016e D2, V10): only with the option
 * exportEvent; the name of the event comes from the option (true: fpbjs).
 */
test.describe('Export dialog and exportEvent', () => {

  const EXPORT = 'dialog.fpb-export-dialog[open]';

  async function sendToHost(page, format) {
    await page.locator('#exportButton').click();
    await page.locator(`${EXPORT} #exportFormat-${format}`).check();
    await page.locator(`${EXPORT} #exportTo-event`).check();
    await expect(page.locator(`${EXPORT} #exportFileName`)).toHaveCount(0);
    await page.locator(`${EXPORT} [data-answer="export"]`).click();
    await expect(page.locator(EXPORT)).toHaveCount(0);
  }

  test('with exportEvent the export goes to the host as JSON and as XML text', async ({ page }) => {
    await withModel(page, { panels: true, options: { exportEvent: 'myExport' } });
    await page.evaluate(() => {
      window.__events = [];
      ['myExport', 'fpbjs', 'model.downloaded'].forEach((name) => window.fpb.get('eventBus').on(name, (e) => {
        window.__events.push({ name, format: e.format, data: e.data });
      }));
    });
    let downloads = 0;
    page.on('download', () => downloads++);

    await sendToHost(page, 'json');
    await sendToHost(page, 'xml');
    await page.waitForTimeout(500);

    const events = await page.evaluate(() => window.__events);
    expect(events.map((e) => [e.name, e.format])).toEqual([['myExport', 'json'], ['myExport', 'xml']]);
    // JSON arrives parsed, XML as text
    expect(Array.isArray(events[0].data)).toBe(true);
    expect(events[0].data.filter((e) => e.process).length).toBe(2);
    expect(typeof events[1].data).toBe('string');
    expect(events[1].data).toMatch(/^<\?xml/);
    expect(downloads).toBe(0);
  });

  // 016e D3, Review Focus 1
  test('a host that imports right after creating the modeler never shows the start card over its model', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { panels: true });
    expect(await importModel(page, clone())).toBe(true);
    await expect(page.locator('#modeler .fpb-start')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // 016e D3, V13: the examples are files of the host, named by the option
  test('examples come from the option examples, AML ones only with the AML module', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await page.route('**/beispiel.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clone()) }));
    const examples = [
      { title: 'Beispiel', description: 'Aus dem Host', url: 'beispiel.json' },
      { title: 'Anlage', url: 'anlage.aml' }
    ];
    await createModeler(page, { options: { examples } });
    const buttons = page.locator('#modeler .fpb-start-example');
    await expect(buttons).toHaveCount(1);
    await expect(buttons).toContainText('Aus dem Host');
    const done = page.evaluate(() => new Promise((resolve) => {
      window.fpb.on('import.done', () => resolve(true));
      setTimeout(() => resolve(false), 8000);
    }));
    await buttons.click();
    expect(await done).toBe(true);
    expect(await currentRootId(page)).toBe(MAIN);

    await page.evaluate(() => window.fpb.destroy());
    await createModeler(page, { options: { examples }, aml: true });
    await expect(page.locator('#modeler .fpb-start-example')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('the bundle does not contain the example models', () => {
    const fs = require('fs');
    const path = require('path');
    const lib = path.join(__dirname, '..', '..', 'dist');
    for (const file of ['fpbjs.js', 'fpbjs.esm.js']) {
      const text = fs.readFileSync(path.join(lib, file), 'utf8');
      expect(text, file).not.toContain('WaermetauscherMitRegelung');
      expect(text, file).not.toContain('PharmaChargeUndReinigung');
      expect(text, file).not.toContain('Aufheizen mit');
    }
  });

  test('with startCard: false there is no start card', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { options: { startCard: false } });
    await page.waitForTimeout(300);
    await expect(page.locator('#modeler .fpb-start')).toHaveCount(0);
  });

  // 016f E1, V7: the files belong to the host
  test('with files: false the toolbar has no Open and Save', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { files: false } });
    const toolbar = page.locator('#layers .fpb-toolbar');
    await expect(toolbar.locator('#exportButton')).toBeVisible();
    await expect(toolbar.locator('#openFileButton')).toHaveCount(0);
    await expect(toolbar.locator('#saveFileButton')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('with files: false the start card offers no file to open', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { options: { files: false } });
    const card = page.locator('#modeler .fpb-start');
    await expect(card).toBeVisible();
    await expect(card.locator('.fpb-start-draw')).toBeVisible();
    await expect(card.locator('.fpb-start-open')).toHaveCount(0);
    await expect(card.locator('.fpb-start-drop')).toHaveCount(0);
  });

  // final review 016e D2, I5: without the browser backup FPB.js compares the
  // model with the one opened or saved last
  test('a file dropped on a changed model asks first, also without the browser backup', async ({ page }) => {
    const { errors } = await withModel(page, { panels: true });
    const drop = () => page.evaluate((text) => {
      const target = document.querySelector('#modeler .djs-container.djs-parent > svg');
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], 'anderes.json', { type: 'application/json' }));
      const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
      target.dispatchEvent(new DragEvent('dragover', options));
      target.dispatchEvent(new DragEvent('drop', options));
    }, JSON.stringify(clone()));
    const question = page.getByRole('alertdialog');

    // a layer switch is no change
    await page.evaluate((id) => window.fpb.switchProcess(id), CHILD);
    await page.evaluate((id) => window.fpb.switchProcess(id), MAIN);
    const imported = page.evaluate(() => new Promise((resolve) => {
      window.fpb.get('eventBus').once('import.done', () => resolve(true));
      setTimeout(() => resolve(false), 8000);
    }));
    await drop();
    expect(await imported).toBe(true);
    await expect(question).toHaveCount(0);

    await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.get('modeling').moveElements([operator], { x: 30, y: 0 });
    });
    await drop();
    await expect(question).toContainText('Open another model?');
    await question.getByRole('button', { name: 'Cancel' }).click();
    expect(errors).toEqual([]);
  });

  // 016e D2: a host with its own storage turns the keys and the drop off
  test('with files: false Ctrl+S, Ctrl+O and a dropped file do nothing', async ({ page }) => {
    const { errors } = await withModel(page, { panels: true, options: { files: false } });
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.evaluate(() => window.fpb.get('canvas').focus());
    await page.keyboard.press('Control+s');
    await page.keyboard.press('Control+o');
    await page.locator('#bio-properties-panel-name, #propertiesPanelToggle').first().focus();
    await page.keyboard.press('Control+s');

    const taken = await page.evaluate(() => {
      const target = document.querySelector('#modeler .djs-container.djs-parent > svg');
      const transfer = new DataTransfer();
      transfer.items.add(new File(['[]'], 'leer.json', { type: 'application/json' }));
      const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
      target.dispatchEvent(new DragEvent('dragover', options));
      const drop = new DragEvent('drop', options);
      target.dispatchEvent(drop);
      return drop.defaultPrevented;
    });
    // refused as everywhere outside a dialog, so the browser keeps the page
    expect(taken).toBe(true);
    await page.waitForTimeout(500);
    await expect(page.locator('dialog.fpb-dialog[open]')).toHaveCount(0);
    await expect(page.locator('.fpb-notification')).toHaveCount(0);
    await expect(page.locator('#modeler .djs-container.djs-parent')).not.toHaveClass(/fpb-drop-active/);
    expect(downloads).toBe(0);
    expect(await currentRootId(page)).toBe(MAIN);
    expect(errors).toEqual([]);
  });

  test('without exportEvent there is no destination choice', async ({ page }) => {
    await withModel(page, { panels: true });
    await page.locator('#exportButton').click();
    await expect(page.locator(`${EXPORT} #exportFormat-json`)).toBeChecked();
    await expect(page.locator(`${EXPORT} #exportTo-event`)).toHaveCount(0);
    await expect(page.locator(`${EXPORT} #exportFileName`)).toBeVisible();
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

  test('toPNG leaves room around the drawing', async ({ page }) => {
    // Testrunde 2026-11-07: the drawing touched the edge of the picture
    await withModel(page);

    const band = await page.evaluate(async () => {
      const img = new Image();
      const url = await window.fpb.toPNG({ scale: 1 });
      await new Promise((resolve) => { img.onload = resolve; img.src = url; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const white = (x, y) => { const i = (y * c.width + x) * 4; return data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255; };
      const edge = 20;
      let colored = 0;
      let inside = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const onEdge = x < edge || y < edge || x >= c.width - edge || y >= c.height - edge;
          if (!white(x, y)) { if (onEdge) colored++; else inside++; }
        }
      }
      return { colored, inside };
    });

    expect(band.inside).toBeGreaterThan(0);
    expect(band.colored).toBe(0);
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

test.describe('AutomationML (importAML, toAML)', () => {
  const fs = require('fs');
  const path = require('path');
  const inputs = path.join(__dirname, '..', 'unit', 'aml', 'oracle', 'inputs');
  const mixed = fs.readFileSync(path.join(inputs, 'generated', 'mixed.aml'), 'utf8');

  /** importAML, which resolves once the model is on the canvas (032a V1) */
  const importAml = (page, text, options) => page.evaluate(({ text, options }) => window.fpb.importAML(text, options), { text, options });

  test('getAMLHierarchies names the process views of a file', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { aml: true });
    const views = await page.evaluate((text) => window.fpb.getAMLHierarchies(text), mixed);
    expect(views.map((v) => v.name)).toEqual(['FPD_Heating', 'FPBJS_Project']);
  });

  test('importAML opens the chosen view; toAML writes it back with the rest of the file', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { aml: true });
    const views = await page.evaluate((text) => window.fpb.getAMLHierarchies(text), mixed);

    const result = await importAml(page, mixed, { instanceHierarchy: views[1].id, fileName: 'Anlage.aml' });
    expect(result.hierarchy).toEqual(views[1]);
    const names = await page.evaluate(() => window.fpb.get('elementRegistry').filter((e) => e.businessObject && e.type === 'fpb:ProcessOperator').map((e) => e.businessObject.name));
    expect(names).toContain('Erhitzen');

    const aml = await page.evaluate(() => window.fpb.toAML());
    expect(aml).toContain('Name="Behaelter_B1"');
    expect(aml).toContain('Name="FPD_Heating"');
    expect(aml).toContain('Name="FPBJS_Project"');
  });

  test('without an AML import toAML writes a new file with the FPD libraries', async ({ page }) => {
    await withModel(page, { aml: true });
    const aml = await page.evaluate(() => window.fpb.toAML());
    expect(aml).toContain('<CAEXFile');
    expect(aml).toContain('Name="VDI_FPD_SystemUnitClassLib"');
    expect(aml).not.toContain('Behaelter_B1');
  });

  // final review 016e D1: the add-on bundle has its own Preact; its dialog
  // must not be drawn with the core's
  test('the AML file overview opens in a host with the AML add-on', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { aml: true, panels: true });
    await importAml(page, mixed, { fileName: 'Anlage.aml' });
    await page.evaluate(() => window.fpb.get('amlOverview').open());
    const dialog = page.locator('dialog.aml-overview-modal[open]');
    await expect(dialog).toContainText('AML file: Anlage.aml');
    await expect(dialog.locator('.aml-overview-hierarchies')).toContainText('FPD_Heating');
    await dialog.getByRole('button', { name: 'Close AML file overview' }).click();
    await expect(page.locator('dialog.fpb-dialog')).toHaveCount(0);

    await page.locator('#amlOverviewButton').click();
    await expect(page.locator('dialog.aml-overview-modal[open]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('importJSON after importAML drops the kept file', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { aml: true });
    await importAml(page, mixed, {});
    expect(await importModel(page, clone())).toBe(true);
    const aml = await page.evaluate(() => window.fpb.toAML());
    expect(aml).not.toContain('Behaelter_B1');
  });

  test('importAML rejects a text that is no AutomationML', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { aml: true });
    const message = await page.evaluate(() => window.fpb.importAML('<root/>').then(() => 'imported', (e) => e.message));
    expect(message).toContain('no AutomationML');
  });

  test('without the AML module nothing of AML is there: API, import dialog, export dialog', async ({ page }) => {
    await withModel(page, { panels: true });

    const messages = await page.evaluate(async (text) => {
      const out = [];
      for (const call of [() => window.fpb.importAML(text), () => window.fpb.toAML(), () => window.fpb.getAMLHierarchies(text)]) {
        out.push(await call().then(() => 'ok', (e) => e.message));
      }
      return out;
    }, mixed);
    messages.forEach((m) => expect(m).toContain('AutomationML is not enabled'));
    expect(await page.evaluate(() => !!window.fpb.get('amlSupport', false))).toBe(false);

    await page.locator('#layers #openFileButton').click();
    const open = page.locator('dialog.fpb-open-dialog[open]');
    await expect(open.locator('input#fpb-open-input')).toHaveAttribute('accept', '.json,.xml');
    await expect(open.locator('.fpb-drop-zone-text')).toHaveText('Drop an FPB.js JSON or XML file here');
    await open.getByRole('button', { name: 'Close' }).click();

    await page.locator('#layers #exportButton').click();
    await expect(page.locator('#exportFormat-xml')).toBeVisible();
    await expect(page.locator('#exportFormat-aml')).toHaveCount(0);
  });

  test('the bundle does not contain the old properties panel', () => {
    const lib = path.join(__dirname, '..', '..', 'dist');
    for (const file of ['fpbjs.js', 'fpbjs.esm.js']) {
      expect(fs.readFileSync(path.join(lib, file), 'utf8'), file).not.toContain('Copy UniqueId to Clipboard');
    }
  });

  test('the core bundle does not contain the AutomationML engine', () => {
    const lib = path.join(__dirname, '..', '..', 'dist');
    expect(fs.readFileSync(path.join(lib, 'fpbjs.js'), 'utf8')).not.toContain('CAEXFileType');
    expect(fs.readFileSync(path.join(lib, 'fpbjs-aml.js'), 'utf8')).toContain('CAEXFileType');
  });
});

test.describe('Read-only mode', () => {

  test('the readOnly option starts in read-only mode; setReadOnly switches and on() reports it', async ({ page }) => {
    await withModel(page, { options: { readOnly: true } });

    const state = await page.evaluate(() => {
      const events = [];
      window.fpb.on('readOnly.changed', (e) => events.push(e.readOnly));
      const start = window.fpb.isReadOnly();
      window.fpb.setReadOnly(false);
      const off = window.fpb.isReadOnly();
      window.fpb.setReadOnly(1);
      return { start, off, on: window.fpb.isReadOnly(), events };
    });

    expect(state).toEqual({ start: true, off: false, on: true, events: [false, true] });
  });

  test('is off without the option', async ({ page }) => {
    await withModel(page);
    expect(await page.evaluate(() => window.fpb.isReadOnly())).toBe(false);
  });

  test('the host still imports, switches layers and changes the model', async ({ page }) => {
    await withModel(page, { options: { readOnly: true } });

    await page.evaluate((id) => window.fpb.switchProcess(id), CHILD);
    expect(await currentRootId(page)).toBe(CHILD);

    expect(await importModel(page, clone())).toBe(true);
    expect(await currentRootId(page)).toBe(MAIN);

    const moved = await page.evaluate(() => {
      const shape = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      const before = shape.x;
      window.fpb.get('modeling').moveElements([shape], { x: 25, y: 0 });
      return shape.x - before;
    });
    expect(moved).toBe(25);
    expect(await page.evaluate(() => window.fpb.isReadOnly())).toBe(true);
  });

  test('with panels, the properties fields take no input from the start', async ({ page }) => {
    await withModel(page, { panels: true, options: { readOnly: true } });

    await page.evaluate(() => {
      const operator = window.fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.get('selection').select(operator);
    });
    await page.locator('#propertiesPanelToggle').click();
    const longName = page.locator('#bio-properties-panel-longName');
    const add = page.getByRole('button', { name: 'Add characteristic' });
    await expect(longName).toHaveAttribute('readonly', '');
    await expect(add).toHaveCount(0);

    await page.evaluate(() => window.fpb.setReadOnly(false));
    await expect(longName).not.toHaveAttribute('readonly', '');
    await expect(add.first()).toBeVisible();
  });
});

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
    await withModel(page);

    const children = await page.evaluate(() => {
      window.fpb.destroy();
      return document.getElementById('modeler').children.length;
    });

    expect(children).toBe(0);
  });

  test('destroy unmounts the properties panel and the layer overview', async ({ page }) => {
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

  // 016f E1, review focus 2: the plugin puts the toolbar in a narrow column with overflow
  test('the name of a toolbar button is not cut off in a narrow container with overflow', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await page.evaluate(() => {
      document.getElementById('layers').style.cssText = 'position:absolute;left:1336px;top:0;width:64px;height:800px;overflow:auto';
    });
    await createModeler(page, { panels: true });
    const button = page.locator('#layers #openValidationButton');
    await button.hover();
    const tip = page.locator('.fpb-toolbar-tip:visible');
    await expect(tip).toContainText('Model check (VDI 3682)');
    const box = await tip.boundingBox();
    const buttonBox = await button.boundingBox();
    expect(box.width).toBeGreaterThan(64);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(buttonBox.x);
    // drawn outside the column, so its overflow cannot cut it off
    expect(await tip.evaluate((e) => !!e.closest('#layers'))).toBe(false);
    expect(errors).toEqual([]);
  });

  // 016f E1, review focus 1: the plugin builds and destroys a modeler per tab
  test('the toolbar of a destroyed modeler leaves nothing behind', async ({ page }) => {
    const { errors } = await withModel(page, { panels: true });
    await expect(page.locator('#layers #openLayerButton')).toBeVisible();
    await expect(page.locator('#layers #openValidationButton')).toBeVisible();

    await page.evaluate(() => window.fpb.destroy());
    expect(await page.evaluate(() => document.getElementById('layers').children.length)).toBe(0);
    await expect(page.locator('body > .fpb-toolbar-tips')).toHaveCount(0);

    await createModeler(page, { panels: true });
    expect(await importModel(page, clone())).toBe(true);
    await expect(page.locator('#layers #openLayerButton')).toHaveCount(1);
    await expect(page.locator('#layers .fpb-toolbar')).toHaveCount(1);
    expect(errors).toEqual([]);
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

// 016c T5 (030 R14): a host sets light or dark for its own containers
test.describe('theme set by the host', () => {

  const attr = (page, id) => page.evaluate((id) => document.getElementById(id).getAttribute('data-theme'), id);
  const darkModeButtons = (page) => page.getByRole('button', { name: /Switch to (Dark|Light) Mode/ }).count();

  test('a host theme applies to its containers only and hides the toggle', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { theme: 'dark' } });
    for (const id of ['modeler', 'properties', 'layers']) {
      expect(await attr(page, id)).toBe('dark');
    }
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBeNull();
    expect(await darkModeButtons(page)).toBe(0);

    const changes = await page.evaluate(() => {
      const seen = [];
      window.fpb.on('theme.changed', (event) => seen.push(event.theme));
      window.fpb.setTheme('light');
      return seen;
    });
    expect(changes).toEqual(['light']);
    for (const id of ['modeler', 'properties', 'layers']) {
      expect(await attr(page, id)).toBe('light');
    }
    expect(errors).toEqual([]);
  });

  test('dialogs of a modeler with a host theme carry the theme, outside the containers too', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { theme: 'dark' } });
    // the native dialogs of the modeler (016e) live under <body>
    await page.locator('#openFileButton').click();
    await expect(page.locator('dialog.fpb-open-dialog[open]')).toHaveCSS('background-color', 'rgb(26, 32, 39)');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.fpb-open-dialog[open]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show information and help', exact: true }).click();
    await expect(page.locator('dialog.fpb-dialog[open]')).toHaveCSS('background-color', 'rgb(26, 32, 39)');
    expect(errors).toEqual([]);
  });

  // since 016f E1 FPB.js brings no Bootstrap: the host's own styles stand in for it
  test('the host page keeps its own colours, font and bpmn-io look', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      const style = document.createElement('style');
      style.textContent = 'body { background-color: rgb(33, 37, 41); font-family: Georgia, serif; line-height: 1.25; }';
      document.head.appendChild(style);
      const other = document.createElement('div');
      other.id = 'other-bpmn-io';
      other.className = 'bio-theme-parent';
      document.body.appendChild(other);
    });
    await createModeler(page, { panels: true });
    const host = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
      lineHeight: getComputedStyle(document.body).lineHeight,
      bio: getComputedStyle(document.getElementById('other-bpmn-io')).getPropertyValue('--bio-text').trim()
    }));
    // the host's body, its own font stack, the bpmn-io default
    expect(host.background).toBe('rgb(33, 37, 41)');
    expect(host.font).toBe('Georgia, serif');
    expect(host.lineHeight).toBe('20px');
    expect(host.bio).toBe('hsl(225, 10%, 15%)');
    expect(errors).toEqual([]);
  });

  test('without a theme option the page attribute stays untouched and a second modeler keeps its toggle', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { panels: true });
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBeNull();
    expect(await darkModeButtons(page)).toBe(1);

    await page.evaluate(() => window.fpb.destroy());
    await createModeler(page, { panels: true });
    expect(await page.evaluate(() => window.fpb.get('fpbTheme').mode())).toBe('default');
    expect(await darkModeButtons(page)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('setTheme("system") follows the system from then on, also under a host page attribute', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { theme: 'dark' } });
    await page.evaluate(() => window.fpb.setTheme('system'));
    expect(await attr(page, 'layers')).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => attr(page, 'layers')).toBe('dark');
    await page.evaluate(() => window.fpb.destroy());

    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await createModeler(page, { panels: true });
    await page.evaluate(() => window.fpb.setTheme('system'));
    const surface = () => page.evaluate(() => getComputedStyle(document.getElementById('layers')).getPropertyValue('--fpb-surface').trim());
    await expect.poll(surface).toBe('#ffffff');
    expect(errors).toEqual([]);
  });

  test('a light host theme under a dark page is light', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await createModeler(page, { panels: true, options: { theme: 'light' } });
    const surface = await page.evaluate(() => getComputedStyle(document.getElementById('layers')).getPropertyValue('--fpb-surface').trim());
    expect(surface).toBe('#ffffff');
    expect(errors).toEqual([]);
  });

  test('a data-theme the host sets on the page is followed and hides the toggle', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await createModeler(page, { panels: true });
    expect(await darkModeButtons(page)).toBe(0);

    const surface = () => page.evaluate(() => getComputedStyle(document.getElementById('layers')).getPropertyValue('--fpb-surface').trim());
    expect(await surface()).toBe('#1a2027');
    // the AML editor switches its theme while the plugin runs
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await expect.poll(surface).toBe('#ffffff');
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 016f E3: the plugin shows the findings in its own list (T13)

/** A model with one error: an operator outside the system limit (B2) */
function withViolation() {
  const model = clone();
  const process = model.find((entry) => entry.process);
  const operator = process.elementVisualInformation.find((v) => v.type === 'fpb:ProcessOperator');
  operator.x += 900;
  return model;
}

test.describe('Model check for hosts', () => {

  test('with validation list false there is no model check button and no list, the markers stay', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { validation: { list: false } } });
    expect(await importModel(page, withViolation())).toBe(true);

    await expect(page.locator('.fpb-validation-marker')).toHaveCount(1);
    await expect(page.locator('#openValidationButton')).toHaveCount(0);
    await page.evaluate(() => window.fpb.get('fpbValidation').openPanel());
    await expect(page.locator('.fpb-validation-panel.open')).toHaveCount(0);
    expect(await page.evaluate(() => window.fpb.get('fpbValidation').isPanelOpen())).toBe(false);
    expect(errors).toEqual([]);
  });

  test('getFindings returns plain findings with the layer id', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);
    expect(await importModel(page, withViolation())).toBe(true);

    const result = await page.evaluate(() => {
      window.fpb.get('fpbValidation').run();
      const findings = window.fpb.getFindings();
      return { text: JSON.stringify(findings), findings };
    });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(JSON.parse(result.text)).toEqual(result.findings);
    const b2 = result.findings.find((f) => f.rule === 'B2');
    expect(b2).toBeTruthy();
    expect(b2.severity).toBe('error');
    expect(typeof b2.message).toBe('string');
    expect(typeof b2.elementId).toBe('string');
    expect(b2.processId).toBe(MAIN);
    result.findings.forEach((f) => expect([MAIN, CHILD, basis[1].process.id, null]).toContain(f.processId));
  });

  test('getCheckedRules lists the rules FPB.js checks', async ({ page }) => {
    await withModel(page);
    expect(await page.evaluate(() => window.fpb.getCheckedRules())).toEqual(
      ['A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B6', 'C1', 'C2', 'C3', 'C4', 'C5', 'C9', 'D1', 'D7', 'D8', 'E5', 'F5', 'F8', 'F9', 'G1', 'G3', 'G4']
    );
  });

  // 031 N2: a flow the guideline does not know can only come from a file; the check reports it
  test('a file with a flow between two operators shows C3', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);
    const model = clone();
    const process = model.find((entry) => entry.process && entry.process.id === MAIN);
    // from the state before "Prüfen" to "Prüfen" becomes from "Erhitzen" to "Prüfen"
    process.elementDataInformation.find((d) => d.id === 'd5dc692d-61ac-4b4b-aea5-3d3044345aa7').sourceRef = '9ca400c0-a373-48c0-9f13-37ce196cee29';
    expect(await importModel(page, model)).toBe(true);
    const c3 = (await page.evaluate(() => window.fpb.getFindings())).filter((f) => f.rule === 'C3');
    expect(c3.map((f) => [f.severity, f.elementId])).toEqual([['error', 'd5dc692d-61ac-4b4b-aea5-3d3044345aa7']]);
  });

  // 031 anti-goal: a fresh model does not open with findings nobody wants to fix
  test('a new model has no finding before its first element', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);
    expect(await page.evaluate(() => window.fpb.getFindings())).toEqual([]);
  });

  test('setValidationMarkers hides and shows the markers', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { options: { validation: { list: false } } });
    expect(await importModel(page, withViolation())).toBe(true);
    await expect(page.locator('.fpb-validation-marker')).toHaveCount(1);

    await page.evaluate(() => window.fpb.setValidationMarkers(false));
    await expect(page.locator('.fpb-validation-marker')).toHaveCount(0);
    await page.evaluate(() => window.fpb.setValidationMarkers(true));
    await expect(page.locator('.fpb-validation-marker')).toHaveCount(1);
  });

  test('without the list the import message offers no Show findings', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { validation: { list: false } } });
    expect(await importModel(page, withViolation())).toBe(true);

    const report = page.locator('[data-id="import.report"]');
    await expect(report).toBeVisible();
    await expect(report.locator('.fpb-notification-message')).toContainText('1 error');
    await expect(report.getByRole('button', { name: 'Show findings' })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 016f E3: the plugin follows the selection of the AML tree across layers (T13)

// Rohstoff: a boundary state on both layers; Vorwärmen and a flow only below
const BOUNDARY = 'c50336d6-9a7f-46e3-a7f5-e6187618dd69';
const ONLY_BELOW = 'c9dc0159-5e01-4139-a98a-141a10e4e4c4';
const FLOW_BELOW = '1fa7453d-0d6d-4b18-813f-8e805f1af006';

test.describe('Selection across layers', () => {

  test('select with process switches to that layer and selects the element', async ({ page }) => {
    await withModel(page);
    const found = await page.evaluate((args) => window.fpb.select(args.id, { process: args.child }), { id: BOUNDARY, child: CHILD });
    expect(found).toBe(true);
    expect(await currentRootId(page)).toBe(CHILD);
    expect(await page.evaluate(() => window.fpb.getSelected().map((e) => e.id))).toEqual([BOUNDARY]);
  });

  test('select without process finds an element on another layer', async ({ page }) => {
    await withModel(page);
    expect(await currentRootId(page)).toBe(MAIN);
    expect(await page.evaluate((id) => window.fpb.select(id), ONLY_BELOW)).toBe(true);
    expect(await currentRootId(page)).toBe(CHILD);
    expect(await page.evaluate(() => window.fpb.getSelected().map((e) => e.id))).toEqual([ONLY_BELOW]);
  });

  test('select keeps the shown layer when the element is on it', async ({ page }) => {
    await withModel(page);
    expect(await page.evaluate((id) => window.fpb.select(id), BOUNDARY)).toBe(true);
    expect(await currentRootId(page)).toBe(MAIN);
    expect(await page.evaluate(() => window.fpb.getSelected().map((e) => e.id))).toEqual([BOUNDARY]);
  });

  test('select with an unknown process returns false and changes nothing', async ({ page }) => {
    await withModel(page);
    const state = await page.evaluate((id) => {
      const before = window.fpb.getSelected().map((e) => e.id);
      const found = window.fpb.select(id, { process: 'no-such-process' });
      return { found, before, after: window.fpb.getSelected().map((e) => e.id) };
    }, BOUNDARY);
    expect(state.found).toBe(false);
    expect(state.after).toEqual(state.before);
    expect(await currentRootId(page)).toBe(MAIN);
  });

  test('select can pick a flow on another layer', async ({ page }) => {
    await withModel(page);
    expect(await page.evaluate((id) => window.fpb.select(id), FLOW_BELOW)).toBe(true);
    expect(await currentRootId(page)).toBe(CHILD);
    expect(await page.evaluate(() => window.fpb.getSelected().map((e) => e.id))).toEqual([FLOW_BELOW]);
  });

  test('select does not take the keyboard focus', async ({ page }) => {
    await withModel(page);
    const state = await page.evaluate((id) => {
      const input = document.createElement('input');
      input.id = 'host-field';
      document.body.appendChild(input);
      input.focus();
      const found = window.fpb.select(id, { scroll: true });
      return { found, active: document.activeElement && document.activeElement.id };
    }, ONLY_BELOW);
    expect(state).toEqual({ found: true, active: 'host-field' });
  });

  test('getCurrentProcess names the shown layer, null before an import', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);
    expect(await page.evaluate(() => window.fpb.getCurrentProcess())).toBe(null);
    expect(await importModel(page, clone())).toBe(true);
    expect(await page.evaluate(() => window.fpb.getCurrentProcess())).toBe(MAIN);
    await page.evaluate((child) => window.fpb.switchProcess(child), CHILD);
    expect(await page.evaluate(() => window.fpb.getCurrentProcess())).toBe(CHILD);
  });
});

// 016f E4: a host (the plugin AMLFPB.js) hands over the links of its AML file
// per layer and element; the delete question names those the deletion removes.
const PRUEFEN = '9833d9a9-1b88-4bfb-91b3-7ab5e2617045';
// the product with a characteristic, top layer
const ROHSTOFF = 'c50336d6-9a7f-46e3-a7f5-e6187618dd69';
const GUTPRODUKT = '1a9fc4c7-3c89-4277-8965-3b186eaa2672';
const ROHSTOFF_TO_ERHITZEN = 'c0293fb1-f400-446b-8eb5-f0a071135619';
const CHILD_LIMIT = 'deba3596-38ca-4bca-a85e-3d0b5dfba666';

const link = (processId, elementId, name, linkName) => ({ processId, elementId, name, link: linkName, owner: 'Plant' });

/** Sets the links, deletes the element through the delete of the context pad and the Delete key, returns the question or null */
function deleteWithLinks(page, links, id) {
  return page.evaluate((args) => {
    if (args.links !== undefined) {
      window.fpb.setAmlLinks(args.links);
    }
    let asked = null;
    const eventBus = window.fpb.get('eventBus');
    const listener = (event) => { asked = { title: event.title, message: event.message, details: event.details }; };
    eventBus.on('confirmation.required', listener);
    try {
      window.fpb.get('fpbDelete').remove([window.fpb.get('elementRegistry').get(args.id)]);
    } finally {
      eventBus.off('confirmation.required', listener);
    }
    return { asked, still: !!window.fpb.get('elementRegistry').get(args.id) };
  }, { links, id });
}

test.describe('Links from outside for hosts', () => {

  test('setAmlLinks makes the delete question name the links', async ({ page }) => {
    await withModel(page);
    const result = await deleteWithLinks(page, [link(MAIN, PRUEFEN, 'Prüfen', 'L1')], PRUEFEN);
    expect(result.asked.title).toBe('Delete "Prüfen"?');
    expect(result.asked.details).toContain('L1 (Plant) to Prüfen');
    expect(result.asked.details).toContain('Applying the diagram to the AML file removes them.');
    expect(result.still).toBe(true);
  });

  test('an element without links is deleted without the question', async ({ page }) => {
    await withModel(page);
    const result = await deleteWithLinks(page, [link(MAIN, PRUEFEN, 'Prüfen', 'L1')], GUTPRODUKT);
    expect(result.asked).toBeNull();
    expect(result.still).toBe(false);
  });

  test('a boundary state deleted on the lower layer names only the links of its copy', async ({ page }) => {
    await withModel(page);
    await page.evaluate((id) => window.fpb.switchProcess(id), CHILD);
    const result = await deleteWithLinks(page,
      [link(MAIN, BOUNDARY, 'Rohstoff', 'Lmain'), link(CHILD, BOUNDARY, 'Rohstoff', 'Lchild')], BOUNDARY);
    expect(result.asked.details).toContain('Lchild (Plant) to Rohstoff');
    expect(result.asked.details).not.toContain('Lmain');
  });

  test('a state deleted on the upper layer names the links of its copies below', async ({ page }) => {
    await withModel(page);
    const result = await deleteWithLinks(page,
      [link(MAIN, BOUNDARY, 'Rohstoff', 'Lmain'), link(CHILD, BOUNDARY, 'Rohstoff', 'Lchild')], BOUNDARY);
    expect(result.asked.details).toContain('Lmain (Plant) to Rohstoff');
    expect(result.asked.details).toContain('Lchild (Plant) to Rohstoff');
  });

  test('removing a decomposition names the links of the layer and of its process', async ({ page }) => {
    await withModel(page);
    await page.evaluate((id) => window.fpb.switchProcess(id), CHILD);
    const result = await deleteWithLinks(page,
      [link(CHILD, ONLY_BELOW, 'Vorwärmen', 'Lop'), link(CHILD, CHILD, 'Erhitzen', 'Lproc'), link(MAIN, CHILD, 'Erhitzen', 'Lpo')],
      CHILD_LIMIT);
    expect(result.asked.details).toContain('Lop (Plant) to Vorwärmen');
    expect(result.asked.details).toContain('Lproc (Plant) to Erhitzen');
    expect(result.asked.details).not.toContain('Lpo');
  });

  test('removing a decomposition names the links of a technical resource on that layer', async ({ page }) => {
    await withModel(page);
    await page.evaluate((id) => window.fpb.switchProcess(id), CHILD);
    const resource = await page.evaluate(() => {
      const shape = window.fpb.get('elementFactory').createShape({ type: 'fpb:TechnicalResource' });
      window.fpb.get('modeling').createShape(shape, { x: 60, y: 60 }, window.fpb.get('canvas').getRootElement());
      return shape.id;
    });
    const result = await deleteWithLinks(page, [link(CHILD, resource, 'Heizung', 'Ltr')], CHILD_LIMIT);
    expect(result.asked.details).toContain('Ltr (Plant) to Heizung');
  });

  test('deleting a flow to a decomposed operator names the links of the state below', async ({ page }) => {
    await withModel(page);
    const result = await deleteWithLinks(page,
      [link(MAIN, BOUNDARY, 'Rohstoff', 'Lmain'), link(CHILD, BOUNDARY, 'Rohstoff', 'Lchild')], ROHSTOFF_TO_ERHITZEN);
    expect(result.asked.details).toContain('Lchild (Plant) to Rohstoff');
    expect(result.asked.details).not.toContain('Lmain');
  });

  test('setAmlLinks null clears the list, an import keeps it', async ({ page }) => {
    await withModel(page);
    await page.evaluate((links) => window.fpb.setAmlLinks(links), [link(MAIN, PRUEFEN, 'Prüfen', 'L1')]);
    expect(await importModel(page, clone())).toBe(true);
    const kept = await deleteWithLinks(page, undefined, PRUEFEN);
    expect(kept.asked.details).toContain('L1 (Plant) to Prüfen');
    const cleared = await deleteWithLinks(page, null, PRUEFEN);
    expect(cleared.asked).toBeNull();
    expect(cleared.still).toBe(false);
  });
});

test.describe('Language', () => {

  /** lang of the three containers of the test page */
  const langs = (page) => page.evaluate(() => ['modeler', 'properties', 'layers']
    .map((id) => document.getElementById(id).getAttribute('lang')));

  test('language: de starts in German and marks the containers', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { language: 'de' } });
    expect(await page.evaluate(() => window.fpb.getLanguage())).toBe('de');
    expect(await langs(page)).toEqual(['de', 'de', 'de']);
    expect(errors).toEqual([]);
  });

  test('setLanguage switches and the containers follow', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { language: 'de' } });
    expect(await page.evaluate(() => window.fpb.setLanguage('en'))).toBe('en');
    expect(await page.evaluate(() => window.fpb.getLanguage())).toBe('en');
    expect(await langs(page)).toEqual(['en', 'en', 'en']);
  });

  test('an unknown language gives English and no error', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') {
        warnings.push(message.text());
      }
    });
    await createModeler(page, { panels: true, options: { language: 'fr' } });
    expect(await page.evaluate(() => window.fpb.getLanguage())).toBe('en');
    expect(warnings).toContain('FPB.js: language "fr" is not available, using English.');
    expect(errors).toEqual([]);
  });

  test('the translate service of the modeler is the one with the language', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { language: 'de' } });
    expect(await page.evaluate(() => window.fpb.get('translate')('Export'))).toBe('Exportieren');
    expect(await page.evaluate(() => window.fpb.get('translate')('{count} errors', { count: 0 }))).toBe('0 Fehler');
    await page.evaluate(() => window.fpb.setLanguage('en'));
    expect(await page.evaluate(() => window.fpb.get('translate')('Export'))).toBe('Export');
  });

  test('a PDF names title and subject in the language in effect', async ({ page }) => {
    await withModel(page, { options: { language: 'de' } });
    const text = await page.evaluate(async () => (await window.fpb.toPDF()).text());
    expect(text).toContain('/Title (FPB-Diagramm)');
    expect(text).toContain('/Subject (Formalisierte Prozessbeschreibung nach VDI 3682)');
    await page.evaluate(() => window.fpb.setLanguage('en'));
    const english = await page.evaluate(async () => (await window.fpb.toPDF({ title: 'Mine' })).text());
    expect(english).toContain('/Title (Mine)');
    expect(english).toContain('/Subject (VDI 3682 Formalized Process Description)');
  });

  test('getFindings gives the messages in the language in effect', async ({ page }) => {
    await withModel(page);
    const english = await page.evaluate(() => window.fpb.getFindings());
    await page.evaluate(() => window.fpb.setLanguage('de'));
    const german = await page.evaluate(() => window.fpb.getFindings());
    expect(english.length).toBeGreaterThan(0);
    expect(german.map((f) => f.rule)).toEqual(english.map((f) => f.rule));
    german.forEach((finding, i) => expect(finding.message).not.toBe(english[i].message));
  });

  test('only language: user shows the language button', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { language: 'de' } });
    await expect(page.locator('#languageButton')).toHaveCount(0);
    await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { language: 'user' } });
    await expect(page.locator('#languageButton')).toHaveAttribute('aria-label', 'Deutsch');
    await page.evaluate(() => window.fpb.setLanguage('de'));
    await expect(page.locator('#languageButton')).toHaveCount(0);
  });

  test('the minimap names its button in the language in effect', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { language: 'de' } });
    const title = () => page.evaluate(() => document.querySelector('.djs-minimap .toggle').getAttribute('title'));
    expect(await title()).toBe('Übersicht öffnen');
    await page.evaluate(() => window.fpb.setLanguage('en'));
    expect(await title()).toBe('Open minimap');
  });

  // final review, Important 1: a translate of the host as diagram-js shows it
  // fills with `replacements[key] || '{key}'`; 0 and '' must not stay placeholders
  test('a host translate in the style of diagram-js leaves no placeholder', async ({ page }) => {
    await openLibraryPage(page);
    await page.evaluate(async () => {
      const translate = (template, replacements) => {
        const values = replacements || {};
        return template.replace(/{([^}]+)}/g, (whole, key) => values[key] || '{' + key + '}');
      };
      window.fpb = await window.FpbJS.createFpbModeler({
        container: document.getElementById('modeler'),
        propertiesContainer: document.getElementById('properties'),
        layerContainer: document.getElementById('layers'),
        additionalModules: [{ translate: ['value', translate] }]
      });
    });
    const json = clone();
    const product = json[1].elementDataInformation.find((e) => e.id === ROHSTOFF);
    product.characteristics[0].descriptiveElement.validityLimits.push({ $type: 'fpbch:ValidityLimits', limitType: 'tolerance', to: 20 });
    expect(await importModel(page, json)).toBe(true);

    const label = await page.locator('#openValidationButton').getAttribute('aria-label');
    expect(label).not.toContain('{');

    const asked = await deleteWithLinks(page, [link(MAIN, PRUEFEN, 'Prüfen', 'L1'), link(MAIN, PRUEFEN, 'Prüfen', 'L2')], PRUEFEN);
    expect(asked.asked.details).not.toContain('{');
    // the question stays open: answer it before the panel
    const open = page.locator('dialog.fpb-dialog[open] [data-answer=cancel]');
    if (await open.count()) {
      await open.click();
    }

    await page.evaluate((id) => {
      window.fpb.fire('propertiesPanel.open');
      window.fpb.select(id);
    }, ROHSTOFF);
    await page.locator('#properties .fpb-characteristic-row-name').first().click();
    await expect(page.locator('#properties .fpb-other-limit')).toBeVisible();
    expect(await page.locator('#properties').innerText()).not.toContain('{');
  });

  // final review, Important 3: the host takes the choice also with the language in effect
  test('setLanguage with the language in effect still hides the language button', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true, options: { language: 'user' } });
    await expect(page.locator('#languageButton')).toHaveCount(1);
    await page.evaluate(() => window.fpb.setLanguage('en'));
    await expect(page.locator('#languageButton')).toHaveCount(0);
  });

  // final review, Important 4: the fixed texts of the message stack follow a switch
  test('the message stack names itself and its buttons in the new language', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true });
    await page.evaluate(() => window.fpb.get('fpbNotifications').show({ key: 'test', type: 'error', title: 'T', message: 'M', details: 'D' }));
    await page.evaluate(() => window.fpb.setLanguage('de'));
    await expect(page.locator('.fpb-notifications')).toHaveAttribute('aria-label', 'Meldungen');
    await expect(page.locator('.fpb-notifications .fpb-notification-details summary')).toHaveText('Technische Einzelheiten');
    await expect(page.locator('.fpb-notifications [aria-label="Schließen"]')).toHaveCount(1);
  });

  test('without an option the modeler speaks English', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page, { panels: true });
    expect(await page.evaluate(() => window.fpb.getLanguage())).toBe('en');
    expect(await langs(page)).toEqual(['en', 'en', 'en']);
  });
});

// 032a V1, V3: the imports say when they are done, on() hands back its removal
test.describe('Import promise', () => {
  const fs = require('fs');
  const path = require('path');
  const inputs = path.join(__dirname, '..', 'unit', 'aml', 'oracle', 'inputs');

  /** The fixture without layout: its import carries warnings */
  const bare = () => clone().map((entry) => {
    if (entry.process) {
      delete entry.elementVisualInformation;
    }
    return entry;
  });

  test('importJSON resolves after the model is on the canvas, with warnings and findings', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);
    const result = await page.evaluate(async (data) => {
      const r = await window.fpb.importJSON(data);
      return {
        current: window.fpb.getCurrentProcess(),
        warnings: r.warnings.length,
        hasHint: r.warnings.every((w) => 'message' in w && 'details' in w && 'hint' in w),
        findings: r.findings,
        expected: window.fpb.getFindings()
      };
    }, bare());

    expect(result.current).toBe(MAIN);
    expect(result.warnings).toBeGreaterThan(0);
    expect(result.hasHint).toBe(true);
    expect(result.findings).toEqual(result.expected);
  });

  test('importJSON rejects invalid content with an FpbImportError and keeps the model', async ({ page }) => {
    await withModel(page);
    const answers = await page.evaluate(async () => {
      const answer = (p) => p.then(() => 'resolved', (e) => ({ name: e.name, code: e.code, hasDetails: 'details' in e }));
      return [await answer(window.fpb.importJSON({})), await answer(window.fpb.importJSON([]))];
    });

    expect(answers[0]).toEqual({ name: 'FpbImportError', code: 'INVALID_DATA_STRUCTURE', hasDetails: true });
    expect(answers[1].name).toBe('FpbImportError');
    expect(await currentRootId(page)).toBe(MAIN);
  });

  test('the older of two imports rejects with SUPERSEDED, the newer resolves', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);
    const answers = await page.evaluate((data) => Promise.all([
      window.fpb.importJSON(data).then(() => 'resolved', (e) => e.code),
      window.fpb.importJSON(data).then((r) => Array.isArray(r.findings), (e) => 'rejected ' + e.code)
    ]), clone());

    expect(answers).toEqual(['SUPERSEDED', true]);
  });

  test('importXML resolves after the import', async ({ page }) => {
    await withModel(page);
    const xml = await page.evaluate(() => window.fpb.toXML());
    await page.evaluate(() => window.fpb.newModel());
    const result = await page.evaluate(async (x) => {
      const r = await window.fpb.importXML(x);
      return { current: window.fpb.getCurrentProcess(), findings: Array.isArray(r.findings), warnings: Array.isArray(r.warnings) };
    }, xml);

    expect(result).toEqual({ current: MAIN, findings: true, warnings: true });
  });

  test('importAML resolves with findings and the report', async ({ page }) => {
    const mixed = fs.readFileSync(path.join(inputs, 'generated', 'mixed.aml'), 'utf8');
    await openLibraryPage(page);
    await createModeler(page, { aml: true });
    const result = await page.evaluate(async (text) => {
      const r = await window.fpb.importAML(text);
      return {
        current: window.fpb.getCurrentProcess(),
        hierarchy: r.hierarchy && r.hierarchy.name,
        findings: r.findings,
        expected: window.fpb.getFindings(),
        report: Array.isArray(r.report)
      };
    }, mixed);

    expect(result.current).not.toBeNull();
    expect(result.hierarchy).toBe('FPD_Heating');
    expect(result.findings).toEqual(result.expected);
    expect(result.report).toBe(true);
  });

  test('an AML file without FPD content resolves at once', async ({ page }) => {
    const empty = fs.readFileSync(path.join(inputs, 'generated', 'no-fpd.aml'), 'utf8');
    await openLibraryPage(page);
    await createModeler(page, { aml: true });
    const result = await page.evaluate((text) => window.fpb.importAML(text).then((r) => ({
      hierarchy: r.hierarchy, findings: r.findings, report: r.report
    })), empty);

    expect(result).toEqual({ hierarchy: null, findings: [], report: [] });
  });

  // final review I2: what 2.0 hosts do keeps working
  test('a 2.0 host that ignores the promises and waits for import.done still gets its model, without unhandled rejections', async ({ page }) => {
    const { errors } = await openLibraryPage(page);
    await createModeler(page);
    const result = await page.evaluate((data) => new Promise((resolve) => {
      const fpb = window.fpb;
      const seen = { done: 0, refused: 0 };
      fpb.on('import.done', () => { seen.done++; });
      fpb.on('import.error', () => { seen.refused++; });
      fpb.importJSON({});
      fpb.importJSON(data);
      setTimeout(() => resolve({ ...seen, current: fpb.getCurrentProcess() }), 1500);
    }), clone());

    expect(result).toEqual({ done: 1, refused: 1, current: MAIN });
    expect(errors).toEqual([]);
  });

  test('on returns a function that removes the listener', async ({ page }) => {
    await withModel(page);
    const calls = await page.evaluate(() => {
      let n = 0;
      const off = window.fpb.on('selection.changed', () => { n++; });
      const registry = window.fpb.get('elementRegistry');
      const someone = registry.filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpb.get('selection').select(someone);
      off();
      window.fpb.get('selection').select(null);
      return { n, offIsFunction: typeof off === 'function' };
    });

    expect(calls).toEqual({ n: 1, offIsFunction: true });
  });
});

// 032a V4, V5: edits and unsaved changes for hosts
test.describe('Changes for hosts', () => {

  test('isDirty and markSaved through the facade; model.dirtyChanged reports the change', async ({ page }) => {
    await withModel(page);
    const result = await page.evaluate((id) => new Promise((resolve) => {
      const fpb = window.fpb;
      const seen = { dirty: [], changed: 0 };
      fpb.on('model.dirtyChanged', (e) => { seen.dirty.push(e.dirty); });
      fpb.on('model.changed', () => { seen.changed++; });
      const before = fpb.isDirty();
      fpb.get('modeling').moveElements([fpb.get('elementRegistry').get(id)], { x: 10, y: 0 });
      setTimeout(() => {
        const afterEdit = fpb.isDirty();
        fpb.markSaved();
        resolve({ before, afterEdit, afterSave: fpb.isDirty(), ...seen });
      }, 100);
    }), '9833d9a9-1b88-4bfb-91b3-7ab5e2617045');

    expect(result).toEqual({ before: false, afterEdit: true, afterSave: false, dirty: [true, false], changed: 1 });
  });

  test('markSaved with the data of toJSON: an edit made during the save stays unsaved', async ({ page }) => {
    await withModel(page);
    const result = await page.evaluate((id) => {
      const fpb = window.fpb;
      const move = () => fpb.get('modeling').moveElements([fpb.get('elementRegistry').get(id)], { x: 10, y: 0 });
      move();
      // saved as it is: clean
      fpb.markSaved(fpb.toJSON());
      const cleanAfterSave = !fpb.isDirty();
      // the host takes the data, the user edits while it is written
      const data = fpb.toJSON();
      move();
      fpb.markSaved(data);
      return { cleanAfterSave, dirtyAfterEditDuringSave: fpb.isDirty() };
    }, '9833d9a9-1b88-4bfb-91b3-7ab5e2617045');

    expect(result).toEqual({ cleanAfterSave: true, dirtyAfterEditDuringSave: true });
  });

  test('a layer switch is no change for hosts', async ({ page }) => {
    await withModel(page);
    const changed = await page.evaluate((child) => new Promise((resolve) => {
      let n = 0;
      window.fpb.on('model.changed', () => { n++; });
      window.fpb.switchProcess(child);
      setTimeout(() => resolve({ n, dirty: window.fpb.isDirty() }), 200);
    }), CHILD);

    expect(changed).toEqual({ n: 0, dirty: false });
  });

  test('Open asks nothing after markSaved (without the browser backup)', async ({ page }) => {
    await withModel(page);
    await page.evaluate(() => {
      const fpb = window.fpb;
      const operator = fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      fpb.get('modeling').moveElements([operator], { x: 10, y: 0 });
      fpb.markSaved();
    });
    const other = clone();
    other[0].name = 'Zweites Projekt';
    const opened = await page.evaluate((content) => new Promise((resolve) => {
      window.fpb.on('import.done', () => resolve(true));
      setTimeout(() => resolve(false), 8000);
      const target = document.querySelector('#modeler .djs-container > svg');
      const transfer = new DataTransfer();
      transfer.items.add(new File([content], 'zweites.json', { type: 'application/json' }));
      const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
      target.dispatchEvent(new DragEvent('dragenter', options));
      target.dispatchEvent(new DragEvent('dragover', options));
      target.dispatchEvent(new DragEvent('drop', options));
    }), JSON.stringify(other));

    expect(opened).toBe(true);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });
});

// 032a V8: the types describe the facade, method for method
test.describe('Types of the facade', () => {

  test('every method of the facade is described in FpbInstance and no more', async ({ page }) => {
    const fs = require('fs');
    const path = require('path');
    await withModel(page);
    const runtime = await page.evaluate(() => Object.keys(window.fpb).filter((k) => typeof window.fpb[k] === 'function').sort());

    const dts = fs.readFileSync(path.join(__dirname, '..', '..', 'types', 'fpbjs.d.ts'), 'utf8').replace(/\r\n/g, '\n');
    const start = dts.indexOf('export interface FpbInstance {');
    const body = dts.slice(start, dts.indexOf('\n}', start));
    const described = [...new Set([...body.matchAll(/^ {2}(\w+)\s*(?:<[^>]*>)?\(/gm)].map((m) => m[1]))].sort();

    expect(runtime).toEqual(described);
  });
});

// 032a V10: leftovers of the old API say that they go in 3.0
test.describe('Deprecated API', () => {

  test('addFpbElements warns once that it goes in 3.0', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && message.text().includes('addFpbElements')) {
        warnings.push(message.text());
      }
    });
    await page.evaluate(() => {
      window.fpb.modeler.addFpbElements([]);
      window.fpb.modeler.addFpbElements([]);
    });
    await page.waitForTimeout(200);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('3.0');
    expect(warnings[0]).toContain('importJSON');
  });

  test('the placeholders name createFpbModeler and 3.0', async ({ page }) => {
    await openLibraryPage(page);
    const messages = await page.evaluate(() => {
      const lib = window.FpbJS;
      return [lib.FpbModeler, lib.PropertiesPanel, lib.LayerOverview].map((Cls) => {
        try { new Cls(); return null; } catch (e) { return e.message; }
      });
    });

    messages.forEach((message) => {
      expect(message).toContain('createFpbModeler');
      expect(message).toContain('3.0');
    });
  });
});
