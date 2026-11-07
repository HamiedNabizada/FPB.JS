// tests/e2e/export-dialog.spec.js
import fs from 'fs';
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { exportiere, nachIds } from './helpers/modelExport';

/**
 * E2E tests for the dialog "Export" (files/ExportDialog.js, 016e D2, V10)
 * and what it calls: files/exports.js, export/PngExporter,
 * export/PdfExporter, export/renderLayers, export/serializeModel and
 * XMLMapper.convertToXML.
 *
 * Every download is read back from disk and checked for its content. Sending
 * the export to the host as an event needs the option exportEvent of the
 * library: library-api.spec.js.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const ROOT_ID = '55b4780e-6896-4e92-b184-858cf0cb5b32';
const CHILD_ID = '9ca400c0-a373-48c0-9f13-37ce196cee29';
// the file name starts as the name of the project
const NAME = 'FPBJS_Project';

async function load(page, model = clone()) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(model);
  return importer;
}

const dialog = (page) => page.locator('dialog.fpb-export-dialog[open]');
const exportButton = (page) => dialog(page).locator('[data-answer="export"]');
const errorBox = (page) => dialog(page).locator('.fpb-export-error');
const format = (page, name) => dialog(page).locator(`#exportFormat-${name}`);

async function openDialog(page) {
  await page.locator('#exportButton').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.fpb-dialog-title')).toHaveText('Export');
}

/** Records events on the event bus in window.__events */
async function recordEvents(page, names) {
  await page.evaluate((names) => {
    window.__events = [];
    names.forEach((name) => window.fpbjs.get('eventBus').on(name, (e) => {
      window.__events.push({ name, format: e.format, data: e.data });
    }));
  }, names);
}
const recorded = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__events)));

async function readDownload(download) {
  const file = await download.path();
  return fs.readFileSync(file);
}

/** Waits for a download started by action; fails if none comes */
// generous: a PDF takes WebKit about 17 s, under load more
async function expectDownload(page, action, timeout = 90000) {
  const waiting = page.waitForEvent('download', { timeout });
  await action();
  const download = await waiting;
  return { name: download.suggestedFilename(), content: await readDownload(download) };
}

/** Asserts that action starts no download */
async function expectNoDownload(page, action) {
  let downloaded = null;
  const listener = (d) => { downloaded = d.suggestedFilename(); };
  page.on('download', listener);
  await action();
  await page.waitForTimeout(800);
  page.off('download', listener);
  expect(downloaded).toBeNull();
}

/** Exports JSON of a scope through the dialog and returns the parsed file */
async function exportJson(page, scope, { layout = true } = {}) {
  await openDialog(page);
  await format(page, 'json').check();
  await dialog(page).locator(`#exportScope-${scope}`).check();
  await dialog(page).locator('#exportLayout').setChecked(layout);
  const file = await expectDownload(page, () => exportButton(page).click());
  return JSON.parse(file.content.toString('utf8'));
}

const rootId = (page) => page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);
const canUndo = (page) => page.evaluate(() => window.fpbjs.get('commandStack').canUndo());

function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    Object.keys(value).forEach((k) => { out.add(k); keysDeep(value[k], out); });
  }
  return out;
}

function countPdfPages(buffer) {
  const text = buffer.toString('latin1');
  return (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

test.describe('Export dialog', () => {

  test.describe('opening, defaults and closing', () => {

    test('opens with its default settings', async ({ page }) => {
      await load(page);
      await openDialog(page);

      await expect(format(page, 'json')).toBeChecked();
      await expect(format(page, 'xml')).not.toBeChecked();
      await expect(dialog(page).locator('#exportScope-model')).toBeChecked();
      await expect(dialog(page).locator('#exportLayout')).toBeChecked();
      // sending to the host only with the option exportEvent
      await expect(dialog(page).locator('#exportTo-event')).toHaveCount(0);
      await expect(dialog(page).locator('#exportFileName')).toHaveValue(NAME);
      await expect(exportButton(page)).toBeEnabled();
      // the XML option links the paper it is based on
      await expect(dialog(page).locator('a[href*="researchgate"]')).toHaveAttribute('target', '_blank');
    });

    test('the export dialog is native and returns the focus to the button', async ({ page }) => {
      await load(page);
      await page.locator('#exportButton').focus();
      await page.keyboard.press('Enter');
      await expect(dialog(page)).toBeVisible();
      expect(await dialog(page).evaluate((d) => d.tagName === 'DIALOG' && d.matches(':modal'))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
      await expect(page.locator('#exportButton')).toBeFocused();
    });

    test('closes with the X button', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await dialog(page).getByRole('button', { name: 'Close' }).click();
      await expect(dialog(page)).toHaveCount(0);
    });

    test('closes when the X button is clicked outside its icon', async ({ page }) => {
      await load(page);
      await openDialog(page);
      // in the padding beside the icon; Firefox hits nothing in the rounded corner
      await dialog(page).locator('.fpb-dialog-close').click({ position: { x: 3, y: 13 } });
      await expect(dialog(page)).toHaveCount(0);
    });

    test('closes with Escape, without exporting', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);
      await openDialog(page);
      await expectNoDownload(page, async () => {
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toHaveCount(0);
      });
      expect(await recorded(page)).toEqual([]);
    });

    test('after closing and reopening, the export does what the dialog shows', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await format(page, 'xml').check();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);

      await openDialog(page);
      // the reopened form shows the choices it keeps, and exports them
      await expect(format(page, 'xml')).toBeChecked();
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe(`${NAME}.xml`);
    });

    test('only the options of the chosen format are shown', async ({ page }) => {
      await load(page);
      await openDialog(page);
      const visible = async () => ({
        scope: await dialog(page).locator('#exportScope-model').count(),
        layout: await dialog(page).locator('#exportLayout').count(),
        name: await dialog(page).locator('#exportFileName').count(),
        hint: (await dialog(page).locator('.fpb-export-scope').allTextContents()).join()
      });

      expect(await visible()).toEqual({ scope: 1, layout: 1, name: 1, hint: '' });
      await format(page, 'xml').check();
      expect(await visible()).toEqual({ scope: 0, layout: 1, name: 1, hint: 'XML always contains the whole model.' });
      await format(page, 'svg').check();
      expect(await visible()).toEqual({ scope: 0, layout: 0, name: 1, hint: 'The current layer.' });
      await format(page, 'png').check();
      expect(await visible()).toEqual({ scope: 0, layout: 0, name: 1, hint: 'The current layer.' });
      await format(page, 'pdf').check();
      expect(await visible()).toEqual({ scope: 0, layout: 0, name: 1, hint: 'All layers, one page each.' });
    });
  });

  test.describe('model check hint', () => {

    test('no hint for a model without findings', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await expect(dialog(page).locator('.fpb-export-check')).toHaveCount(0);
    });

    test('an error is shown as a red hint, and the export still runs', async ({ page }) => {
      await load(page);
      await page.evaluate(() => {
        const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Prüfen')[0];
        window.fpbjs.get('modeling').moveElements([operator], { x: 900, y: 0 });
      });
      const counts = await page.evaluate(() => {
        const v = window.fpbjs.get('fpbValidation');
        v.run();
        return v.getCounts();
      });
      expect(counts.error).toBeGreaterThan(0);

      await openDialog(page);
      const hint = dialog(page).locator('.fpb-export-check');
      await expect(hint).toHaveClass(/is-error/);
      const errorWord = counts.error === 1 ? 'error' : 'errors';
      const warningWord = counts.warning === 1 ? 'warning' : 'warnings';
      await expect(hint).toContainText(
        `Model check (VDI 3682): ${counts.error} ${errorWord}, ${counts.warning} ${warningWord}. The export runs anyway.`);

      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe(`${NAME}.json`);
    });

    test('only warnings are shown as a yellow hint', async ({ page }) => {
      await load(page);
      // removing a flow leaves elements without input/output (warnings only)
      await page.evaluate(() => {
        const flow = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:Flow')[0];
        window.fpbjs.get('modeling').removeElements([flow]);
      });
      const counts = await page.evaluate(() => {
        const v = window.fpbjs.get('fpbValidation');
        v.run();
        return v.getCounts();
      });
      expect(counts.error).toBe(0);
      expect(counts.warning).toBeGreaterThan(0);

      await openDialog(page);
      const hint = dialog(page).locator('.fpb-export-check');
      await expect(hint).toHaveClass(/is-warning/);
      await expect(hint).toContainText(`0 errors, ${counts.warning} ${counts.warning === 1 ? 'warning' : 'warnings'}`);
    });
  });

  test.describe('JSON', () => {

    test('JSON download of the whole model with layout re-imports to the same model', async ({ page }) => {
      const importer = await load(page);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);
      const before = await exportiere(page);

      await openDialog(page);
      const file = await expectDownload(page, () => exportButton(page).click());
      await expect(dialog(page)).toHaveCount(0);

      expect(file.name).toBe(`${NAME}.json`);
      const json = JSON.parse(file.content.toString('utf8'));
      expect(Array.isArray(json)).toBe(true);
      expect(json.filter((e) => e.$type === 'fpb:Project')).toHaveLength(1);
      expect(json.filter((e) => e.process).map((e) => e.process.id).sort()).toEqual([ROOT_ID, CHILD_ID].sort());
      json.filter((e) => e.process).forEach((e) => {
        expect(e.elementVisualInformation.length).toBe(e.elementDataInformation.length);
      });
      const keys = keysDeep(json);
      ['di', 'children', 'labels', 'markers'].forEach((k) => expect(keys.has(k)).toBe(false));
      expect(nachIds(json)).toEqual(nachIds(before));

      // full model with layout: model.downloaded, no event to a host
      expect(await recorded(page)).toEqual([{ name: 'model.downloaded', format: 'json' }]);

      // the file re-imports to the same model
      await importer.import(json);
      expect(nachIds(await exportiere(page))).toEqual(nachIds(before));
      expect(await importer.unresolvedReferences()).toEqual([]);
    });

    test('JSON download without layout leaves out the layout and does not count as saved', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['model.downloaded']);
      const before = await exportiere(page);

      const json = await exportJson(page, 'model', { layout: false });

      expect(keysDeep(json).has('elementVisualInformation')).toBe(false);
      const ids = (m) => m.filter((e) => e.process).flatMap((e) => e.elementDataInformation.map((d) => d.id)).sort();
      expect(ids(json)).toEqual(ids(before));
      expect(await recorded(page)).toEqual([]);
    });
  });

  test.describe('data scope', () => {

    test('the current layer on the child layer exports only that layer', async ({ page }) => {
      const importer = await load(page);
      await importer.switchToChildLayer();
      expect(await rootId(page)).toBe(CHILD_ID);

      const model = await exportJson(page, 'layer');
      await expect(dialog(page)).toHaveCount(0);

      // a model of its own (Testrunde 2026-11-07, the user: "Öffnebares Modell"):
      // the project, then the layer as its top layer
      expect(model).toHaveLength(2);
      expect(model[0].$type).toBe('fpb:Project');
      expect(model[0].entryPoint).toBe(CHILD_ID);
      const data = model[1];
      expect(data.process.id).toBe(CHILD_ID);
      expect(data.process.isDecomposedProcessOperator).toBeNull();
      expect(data.process.parent).toEqual(model[0]);
      const onCanvas = await page.evaluate(() => window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.type !== 'label' && e.type !== 'fpb:Process' && e.id !== window.fpbjs.get('canvas').getRootElement().id)
        .map((e) => e.id).sort());
      expect(data.elementDataInformation.map((e) => e.id).sort()).toEqual(onCanvas);
      expect(data.elementVisualInformation.length).toBe(data.elementDataInformation.length);
    });

    test('the current layer downloaded is not the full model (no model.downloaded)', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['model.downloaded']);
      const json = await exportJson(page, 'layer');
      expect(json[1].process.id).toBe(ROOT_ID);
      expect(await recorded(page)).toEqual([]);
    });

    test('the current layer opens as a model; its operators lose the layers below', async ({ page }) => {
      await load(page);
      const model = await exportJson(page, 'layer');
      expect(model[1].process.consistsOfProcesses).toEqual([]);
      expect(model[1].elementDataInformation.filter((d) => d.decomposedView)).toEqual([]);

      await load(page, model);
      const opened = await page.evaluate(() => ({
        root: window.fpbjs.get('canvas').getRootElement().id,
        layers: window.fpbjs.getProcesses().filter((p) => p.process).length,
        operators: window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator').length,
        decomposed: window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.decomposedView).length,
      }));
      expect(opened).toEqual({ root: ROOT_ID, layers: 1, operators: 2, decomposed: 0 });
    });

    test('the current layer of a child opens as a model of that layer', async ({ page }) => {
      const importer = await load(page);
      await importer.switchToChildLayer();
      const model = await exportJson(page, 'layer');

      await load(page, model);
      expect(await rootId(page)).toBe(CHILD_ID);
      expect(await page.evaluate(() => window.fpbjs.getProcesses().filter((p) => p.process).length)).toBe(1);
    });

    test('choosing the current layer says that the layers below stay out, where there are any', async ({ page }) => {
      const importer = await load(page);
      const note = dialog(page).locator('.fpb-export-layer-note');
      await openDialog(page);
      await format(page, 'json').check();
      await dialog(page).locator('#exportScope-layer').check();
      await expect(note).toHaveText('Opens as a model of its own, without the layers below.');
      await dialog(page).locator('#exportScope-model').check();
      await expect(note).toHaveCount(0);
      await page.keyboard.press('Escape');

      await importer.switchToChildLayer();
      await openDialog(page);
      await format(page, 'json').check();
      await dialog(page).locator('#exportScope-layer').check();
      await expect(note).toHaveCount(0);
    });

    test('selected elements exports exactly the selection', async ({ page }) => {
      await load(page);
      const selected = await page.evaluate(() => {
        const registry = window.fpbjs.get('elementRegistry');
        const picks = [
          registry.filter((e) => e.type === 'fpb:ProcessOperator')[0],
          registry.filter((e) => e.type === 'fpb:Product')[0],
        ];
        window.fpbjs.get('selection').select(picks);
        return picks.map((e) => e.id).sort();
      });

      const data = await exportJson(page, 'selection');

      expect(data.elementDataInformation.map((e) => e.id).sort()).toEqual(selected);
      expect(data.elementVisualInformation.map((e) => e.id).sort()).toEqual(selected);
    });

    test('selected elements without layout, and no such choice while nothing is selected', async ({ page }) => {
      await load(page);
      await page.evaluate(() => window.fpbjs.get('selection').select([]));
      await openDialog(page);
      await expect(dialog(page).locator('#exportScope-selection')).toBeDisabled();
      await page.keyboard.press('Escape');

      await page.evaluate(() => {
        const op = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        window.fpbjs.get('selection').select([op]);
      });
      const data = await exportJson(page, 'selection', { layout: false });
      expect(Object.keys(data)).toEqual(['elementDataInformation']);
      expect(data.elementDataInformation).toHaveLength(1);
    });

    test('selected elements downloaded does not fire model.downloaded', async ({ page }) => {
      await load(page);
      await page.evaluate(() => {
        const op = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        window.fpbjs.get('selection').select([op]);
      });
      await recordEvents(page, ['model.downloaded']);
      const json = await exportJson(page, 'selection');
      expect(json.elementDataInformation).toHaveLength(1);
      expect(await recorded(page)).toEqual([]);
    });

    test('switching the scope back to the whole model exports everything again', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await dialog(page).locator('#exportScope-layer').check();
      await page.keyboard.press('Escape');
      const data = await exportJson(page, 'model');
      expect(data.filter((e) => e.process)).toHaveLength(2);
    });
  });

  test.describe('XML', () => {

    test('XML download of all processes: valid VDI 3682 XML, model.downloaded fired', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);
      await openDialog(page);
      await format(page, 'xml').check();
      const file = await expectDownload(page, () => exportButton(page).click());
      await expect(dialog(page)).toHaveCount(0);

      expect(file.name).toBe(`${NAME}.xml`);
      const xml = file.content.toString('utf8');
      const parsed = await page.evaluate((text) => {
        const doc = new DOMParser().parseFromString(text, 'text/xml');
        const root = doc.documentElement;
        return {
          error: doc.getElementsByTagName('parsererror').length,
          root: root.localName,
          ns: root.namespaceURI,
          processes: [...root.children].filter((c) => c.localName === 'process').map((p) => p.getAttribute('id')),
          entryPoint: root.querySelector('projectInformation') && root.querySelector('projectInformation').getAttribute('entryPoint'),
        };
      }, xml);
      expect(parsed.error).toBe(0);
      expect(parsed.root).toBe('project');
      expect(parsed.ns).toBe('http://www.vdivde.de/3682');
      expect(parsed.processes.sort()).toEqual([ROOT_ID, CHILD_ID].sort());
      expect(parsed.entryPoint).toBe(ROOT_ID);
      expect(xml).toContain('visual:');
      expect(await recorded(page)).toEqual([{ name: 'model.downloaded', format: 'xml' }]);
    });

    test('XML without layout contains no layout', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await format(page, 'xml').check();
      await dialog(page).locator('#exportLayout').uncheck();
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.content.toString('utf8')).not.toMatch(/visual:/);
    });

    test('XML always exports the whole model: the scope is not offered', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await dialog(page).locator('#exportScope-layer').check();
      await format(page, 'xml').check();

      await expect(dialog(page).locator('#exportScope-layer')).toHaveCount(0);
      await expect(dialog(page).locator('.fpb-export-scope')).toHaveText('XML always contains the whole model.');

      const file = await expectDownload(page, () => exportButton(page).click());
      await expect(errorBox(page)).toHaveCount(0);
      const xml = file.content.toString('utf8');
      expect(xml).toContain(ROOT_ID);
      expect(xml).toContain(CHILD_ID);

      // back to JSON, the scope is offered again
      await openDialog(page);
      await format(page, 'json').check();
      await expect(dialog(page).locator('#exportScope-layer')).toBeEnabled();
      await expect(dialog(page).locator('.fpb-export-scope')).toHaveCount(0);
    });
  });

  test.describe('filename', () => {
    test.slow(({ browserName }) => browserName === 'webkit', 'PDF in WebKit takes about 17 s for two layers (jsPDF decodes the PNG in JavaScript; Chromium 1.5 s, packing is not the cause)');

    async function downloadWithName(page, name) {
      await openDialog(page);
      await dialog(page).locator('#exportFileName').fill(name);
      return dialog(page).locator('#exportFileName');
    }

    test('a valid name is used as is', async ({ page }) => {
      await load(page);
      const field = await downloadWithName(page, 'Temperieren v2');
      await expect(field).not.toHaveAttribute('aria-invalid', 'true');
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe('Temperieren v2.json');
    });

    test('invalid characters are flagged and replaced in the downloaded name', async ({ page }) => {
      await load(page);
      const field = await downloadWithName(page, 'a<b>c:d|e?f*g');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(dialog(page).locator('.fpb-field-error')).toHaveText('Filename contains invalid characters');
      await expect(dialog(page)).toContainText('Avoid special characters: < > : " / \\ | ? *');
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe('a_b_c_d_e_f_g.json');
    });

    test('an empty name is flagged and falls back to FPB', async ({ page }) => {
      await load(page);
      const field = await downloadWithName(page, '   ');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(dialog(page).locator('.fpb-field-error')).toHaveText('Filename cannot be empty');
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe('FPB.json');
    });

    test('a reserved name is flagged and falls back to FPB', async ({ page }) => {
      await load(page);
      await downloadWithName(page, 'con');
      await expect(dialog(page).locator('.fpb-field-error')).toHaveText('"con" is a reserved filename');
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe('FPB.json');
    });

    test('a too long name is flagged and cut to 200 characters', async ({ page }) => {
      await load(page);
      await downloadWithName(page, 'x'.repeat(230));
      await expect(dialog(page).locator('.fpb-field-error')).toHaveText('Filename is too long (max 200 characters)');
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe('x'.repeat(200) + '.json');
    });

    test('correcting the name clears the message; surrounding spaces are trimmed', async ({ page }) => {
      await load(page);
      const field = await downloadWithName(page, 'a/b');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await field.fill('  modell  ');
      await expect(field).not.toHaveAttribute('aria-invalid', 'true');
      await expect(dialog(page).locator('.fpb-field-error')).toHaveCount(0);
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe('modell.json');
    });

    test('the name is also used for SVG, PNG and PDF', async ({ page }) => {
      await load(page);
      for (const kind of ['svg', 'png', 'pdf']) {
        await openDialog(page);
        await format(page, kind).check();
        await dialog(page).locator('#exportFileName').fill('bild');
        expect((await expectDownload(page, () => exportButton(page).click())).name).toBe(`bild.${kind}`);
      }
    });
  });

  test.describe('SVG, PNG and PDF', () => {
    test.slow(({ browserName }) => browserName === 'webkit', 'PDF in WebKit takes about 17 s for two layers (jsPDF decodes the PNG in JavaScript; Chromium 1.5 s, packing is not the cause)');

    test('SVG of the current layer', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['model.downloaded']);
      await openDialog(page);
      await format(page, 'svg').check();
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe(`${NAME}.svg`);
      const svg = file.content.toString('utf8');
      // XML prolog, an optional comment and doctype, then the svg root
      expect(svg).toMatch(/^<\?xml[^>]*>\s*(<!--[^>]*-->\s*)?(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/);
      expect(svg.trim()).toMatch(/<\/svg>$/);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      const parsed = await page.evaluate((text) => {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        return { error: doc.getElementsByTagName('parsererror').length, ids: [...doc.querySelectorAll('[data-element-id]')].map((e) => e.getAttribute('data-element-id')) };
      }, svg);
      expect(parsed.error).toBe(0);
      const operators = await page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator').map((e) => e.id));
      operators.forEach((id) => expect(parsed.ids).toContain(id));
      // the dialog closes after every export; an image is not a model save
      await expect(dialog(page)).toHaveCount(0);
      expect(await recorded(page)).toEqual([]);
    });

    test('PNG of the current layer', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await format(page, 'png').check();
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.name).toBe(`${NAME}.png`);
      expect([...file.content.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // IHDR: width and height, scaled by 2
      const width = file.content.readUInt32BE(16);
      const height = file.content.readUInt32BE(20);
      expect(width).toBeGreaterThan(100);
      expect(height).toBeGreaterThan(100);
      expect(width % 2).toBe(0);
      expect(height % 2).toBe(0);
      await expect(dialog(page)).toHaveCount(0);
    });

    test('PDF of all layers from the child layer: one page per layer, back on the child layer, history kept', async ({ page }) => {
      const importer = await load(page);
      await importer.switchToChildLayer();
      await page.evaluate(() => {
        const op = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        window.fpbjs.get('modeling').moveElements([op], { x: 30, y: 0 });
      });
      expect(await canUndo(page)).toBe(true);
      // pages named as Layers names the layers: the project on top, the decomposed operator below
      const names = [basis[0].name, basis.flatMap((e) => e.elementDataInformation || []).find((d) => d.decomposedView === CHILD_ID).name];

      await openDialog(page);
      await format(page, 'pdf').check();
      const file = await expectDownload(page, () => exportButton(page).click());
      await expect(dialog(page)).toHaveCount(0);

      expect(file.name).toBe(`${NAME}.pdf`);
      expect(file.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(file.content.toString('latin1')).toMatch(/%%EOF\s*$/);
      expect(countPdfPages(file.content)).toBe(2);
      const text = file.content.toString('latin1');
      expect(text).toContain('/Creator (FPB.JS)');
      names.forEach((n) => expect(text).toContain(`(${n})`));
      expect(text).not.toContain(`(${ROOT_ID})`);

      expect(await rootId(page)).toBe(CHILD_ID);
      expect(await canUndo(page)).toBe(true);
    });

    test('PDF of a model with a single layer has one page', async ({ page }) => {
      const model = clone();
      const child = model.find((e) => e.process && e.process.id === CHILD_ID);
      model.splice(model.indexOf(child), 1);
      // the parent operator loses its decomposition
      model.filter((e) => e.process).forEach((e) => e.elementDataInformation.forEach((d) => {
        if (d.decomposedView === CHILD_ID) delete d.decomposedView;
      }));
      const root = model.find((e) => e.process && e.process.id === ROOT_ID).process;
      root.consistsOfProcesses = root.consistsOfProcesses.filter((id) => id !== CHILD_ID);
      await load(page, model);
      expect(await page.evaluate(() => window.fpbjs.getProcesses().filter((p) => p.process).length)).toBe(1);

      await openDialog(page);
      await format(page, 'pdf').check();
      const file = await expectDownload(page, () => exportButton(page).click());
      expect(file.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(countPdfPages(file.content)).toBe(1);
      expect(await rootId(page)).toBe(ROOT_ID);
    });
  });

  test.describe('error handling', () => {

    test('an empty model says so for XML, AML and PDF, without an error in the console', async ({ page }) => {
      // monkey test 2026-11-07: XML said "No project data found in JSON", PDF
      // "Cannot read properties of undefined (reading 'elementsContainer')"
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await load(page);
      await page.evaluate(() => window.fpbjs.newModel());
      for (const kind of ['xml', 'aml', 'pdf']) {
        await openDialog(page);
        await expectNoDownload(page, () => exportFormat(page, kind));
        await expect(errorBox(page)).toContainText('The model is empty: there is no process to export.');
        await page.keyboard.press('Escape');
      }
      expect(errors).toEqual([]);
    });

    async function exportFormat(page, kind) {
      await format(page, kind).check();
      await exportButton(page).click();
    }

    test('a failing SVG export shows a message and leaves the dialog usable', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await page.evaluate(() => { window.fpbjs.saveSVG = (o, done) => done(new Error('boom')); });
      await expectNoDownload(page, () => exportFormat(page, 'svg'));
      await expect(errorBox(page)).toHaveText(/SVG export failed: boom/);
      await expect(errorBox(page)).toHaveAttribute('role', 'alert');
      await expect(exportButton(page)).toBeEnabled();
    });

    test('an empty SVG result is reported for SVG and PNG', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await page.evaluate(() => { window.fpbjs.saveSVG = (o, done) => done(null, ''); });
      await expectNoDownload(page, () => exportFormat(page, 'svg'));
      await expect(errorBox(page)).toHaveText(/SVG export failed: SVG generation returned empty result/);
      await expectNoDownload(page, () => exportFormat(page, 'png'));
      await expect(errorBox(page)).toHaveText(/PNG export failed: SVG generation returned empty result/);
    });

    test('a failing PNG export shows a message', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await page.evaluate(() => { window.fpbjs.saveSVG = (o, done) => done(new Error('kaputt')); });
      await expectNoDownload(page, () => exportFormat(page, 'png'));
      await expect(errorBox(page)).toHaveText(/PNG export failed: kaputt/);
    });

    test('a failing PDF export shows a message and returns to the start layer with history kept', async ({ page }) => {
      const importer = await load(page);
      await importer.switchToChildLayer();
      await page.evaluate(() => {
        const op = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        window.fpbjs.get('modeling').moveElements([op], { x: 30, y: 0 });
      });
      await openDialog(page);
      await page.evaluate(() => {
        let calls = 0;
        const original = window.fpbjs.saveSVG.bind(window.fpbjs);
        // the second layer fails
        window.fpbjs.saveSVG = (o, done) => (++calls === 2 ? done(new Error('layer failed')) : original(o, done));
      });
      await expectNoDownload(page, () => exportFormat(page, 'pdf'));
      await expect(errorBox(page)).toHaveText(/PDF export failed: layer failed/);
      expect(await rootId(page)).toBe(CHILD_ID);
      expect(await canUndo(page)).toBe(true);
    });

    test('a failing data export shows a message and keeps the dialog open', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await page.evaluate(() => { window.fpbjs.getProcess = () => undefined; });
      await dialog(page).locator('#exportScope-layer').check();
      await expectNoDownload(page, () => exportButton(page).click());
      await expect(errorBox(page)).toHaveText(/Export failed: No data available for export/);
      await expect(dialog(page)).toBeVisible();
      await expect(exportButton(page)).toBeEnabled();
    });
  });
});
