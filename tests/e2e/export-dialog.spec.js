// tests/e2e/export-dialog.spec.js
import fs from 'fs';
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { exportiere, nachIds } from './helpers/modelExport';

/**
 * E2E tests for the export dialog (layer-panel/components/DownloadModal.js)
 * and what it calls: export/PngExporter, export/PdfExporter,
 * export/renderLayers, export/serializeModel and XMLMapper.convertToXML.
 *
 * Every download is read back from disk and checked for its content.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const ROOT_ID = '55b4780e-6896-4e92-b184-858cf0cb5b32';
const CHILD_ID = '9ca400c0-a373-48c0-9f13-37ce196cee29';

async function load(page, model = clone()) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(model);
  return importer;
}

const dialog = (page) => page.locator('.modal.show');
const footerButton = (page, text) => dialog(page).locator('.modal-footer button', { hasText: text });
const sendButton = (page) => dialog(page).locator('.modal-footer button:has([data-icon="paper-plane"])');

async function openDialog(page) {
  const options = page.locator('.layerPanel > button').first();
  // the options collapse may already be open from an earlier opening
  if (!(await page.locator('.downloadButton button:has([data-icon="download"])').isVisible())) {
    await options.click();
  }
  await page.locator('.downloadButton button:has([data-icon="download"])').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.modal-title')).toContainText('Export Options');
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
async function expectDownload(page, action, timeout = 30000) {
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

      await expect(dialog(page).locator('#formatJSON')).toBeChecked();
      await expect(dialog(page).locator('#formatXML')).not.toBeChecked();
      await expect(dialog(page).locator('#informationLevel1')).toBeChecked();
      await expect(dialog(page).locator('#informationLevel2')).not.toBeChecked();
      await expect(dialog(page).locator('#export1')).not.toBeChecked();
      await expect(dialog(page).locator('#export2')).not.toBeChecked();
      await expect(dialog(page).locator('#formEvent')).toHaveValue('fpbjs');
      await expect(dialog(page).locator('#formDownloadFileName')).toHaveValue('FPB');
      await expect(footerButton(page, 'SVG')).toBeEnabled();
      await expect(footerButton(page, 'PNG')).toBeEnabled();
      await expect(footerButton(page, 'PDF')).toBeEnabled();
      await expect(sendButton(page)).toBeEnabled();
      // the XML option links the paper it is based on
      await expect(dialog(page).locator('a[href*="researchgate"]')).toHaveAttribute('target', '_blank');
    });

    test('the data scope used by default (All Processes) is shown as selected', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await expect(dialog(page).locator('#information1')).toBeChecked();
    });

    test('closes with the X button', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await dialog(page).locator('.modal-header [data-icon="rectangle-xmark"]').click();
      await expect(dialog(page)).toHaveCount(0);
    });

    test('closes when the X button is clicked outside its icon', async ({ page }) => {
      await load(page);
      await openDialog(page);
      const button = dialog(page).locator('.modal-header button');
      await button.click({ position: { x: 2, y: 2 } });
      await expect(dialog(page)).toHaveCount(0);
    });

    test('closes with Escape and with a click on the backdrop, without exporting', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);
      await openDialog(page);
      await expectNoDownload(page, async () => {
        await page.keyboard.press('Escape');
        await expect(dialog(page)).toHaveCount(0);
        await openDialog(page);
        await page.mouse.click(5, 500);
        await expect(dialog(page)).toHaveCount(0);
      });
      expect(await recorded(page)).toEqual([]);
    });

    test('after closing and reopening, the export does what the dialog shows', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await dialog(page).locator('#formatXML').check();
      await dialog(page).locator('#export2').check();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);

      await openDialog(page);
      // the reopened form shows the choices it keeps, and exports them
      await expect(dialog(page).locator('#formatXML')).toBeChecked();
      await expect(dialog(page).locator('#export2')).toBeChecked();
      await expect(dialog(page).locator('#information1')).toBeChecked();
      const file = await expectDownload(page, () => sendButton(page).click());
      expect(file.name).toBe('FPB.xml');
    });
  });

  test.describe('model check hint', () => {

    test('no hint for a model without findings', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await expect(dialog(page).locator('.download-check-hint')).toHaveCount(0);
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
      const hint = dialog(page).locator('.download-check-hint');
      await expect(hint).toHaveClass(/alert-danger/);
      const errorWord = counts.error === 1 ? 'error' : 'errors';
      const warningWord = counts.warning === 1 ? 'warning' : 'warnings';
      await expect(hint).toContainText(
        `Model check (VDI 3682): ${counts.error} ${errorWord}, ${counts.warning} ${warningWord}. The export runs anyway.`);

      await dialog(page).locator('#export2').check();
      const file = await expectDownload(page, () => sendButton(page).click());
      expect(file.name).toBe('FPB.json');
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
      const hint = dialog(page).locator('.download-check-hint');
      await expect(hint).toHaveClass(/alert-warning/);
      await expect(hint).toContainText(`0 errors, ${counts.warning} ${counts.warning === 1 ? 'warning' : 'warnings'}`);
    });
  });

  test.describe('export method', () => {

    test('neither event nor download: error message, dialog stays open, nothing exported', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);
      await openDialog(page);
      await expectNoDownload(page, () => sendButton(page).click());
      const alert = dialog(page).locator('.modal-footer .alert-danger');
      await expect(alert).toHaveText(/Please select at least one export method \(Event or Download\)/);
      expect(await recorded(page)).toEqual([]);

      // the message can be dismissed
      await alert.locator('.btn-close').click();
      await expect(alert).toHaveCount(0);
      await expect(dialog(page)).toBeVisible();
    });

    test('JSON download of all processes with layout re-imports to the same model', async ({ page }) => {
      const importer = await load(page);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);
      const before = await exportiere(page);

      await openDialog(page);
      await dialog(page).locator('#export2').check();
      const file = await expectDownload(page, () => sendButton(page).click());
      await expect(dialog(page)).toHaveCount(0);

      expect(file.name).toBe('FPB.json');
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

      // full model with layout: model.downloaded, no event export
      expect(await recorded(page)).toEqual([{ name: 'model.downloaded', format: 'json' }]);

      // the file re-imports to the same model
      await importer.import(json);
      expect(nachIds(await exportiere(page))).toEqual(nachIds(before));
      expect(await importer.unresolvedReferences()).toEqual([]);
    });

    test('JSON download without graphic information leaves out the layout and does not count as saved', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['model.downloaded']);
      const before = await exportiere(page);

      await openDialog(page);
      await dialog(page).locator('#informationLevel2').check();
      await dialog(page).locator('#export2').check();
      const file = await expectDownload(page, () => sendButton(page).click());

      const json = JSON.parse(file.content.toString('utf8'));
      expect(keysDeep(json).has('elementVisualInformation')).toBe(false);
      const ids = (m) => m.filter((e) => e.process).flatMap((e) => e.elementDataInformation.map((d) => d.id)).sort();
      expect(ids(json)).toEqual(ids(before));
      expect(await recorded(page)).toEqual([]);
    });

    test('event only, with a custom event name: data on the event bus, no download', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs', 'myExport', 'model.downloaded']);
      const before = await exportiere(page);

      await openDialog(page);
      await dialog(page).locator('#export1').check();
      await dialog(page).locator('#formEvent').fill('myExport');
      await expectNoDownload(page, () => sendButton(page).click());
      await expect(dialog(page)).toHaveCount(0);

      const events = await recorded(page);
      expect(events.map((e) => e.name)).toEqual(['myExport']);
      expect(events[0].format).toBe('json');
      // JSON arrives parsed, not as a string
      expect(Array.isArray(events[0].data)).toBe(true);
      expect(nachIds(events[0].data)).toEqual(nachIds(before));
    });

    test('event and download together deliver the same data', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);

      await openDialog(page);
      await dialog(page).locator('#export1').check();
      await dialog(page).locator('#export2').check();
      const file = await expectDownload(page, () => sendButton(page).click());

      const events = await recorded(page);
      expect(events.map((e) => e.name)).toEqual(['model.downloaded', 'fpbjs']);
      expect(events[1].data).toEqual(JSON.parse(file.content.toString('utf8')));
    });

    test('unchecking download again means no download', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs']);
      await openDialog(page);
      await dialog(page).locator('#export2').check();
      await dialog(page).locator('#export1').check();
      await dialog(page).locator('#export2').uncheck();
      await expectNoDownload(page, () => sendButton(page).click());
      expect((await recorded(page)).map((e) => e.name)).toEqual(['fpbjs']);
    });
  });

  test.describe('data scope', () => {

    async function exportAsEvent(page, scope, { level, format } = {}) {
      await openDialog(page);
      if (format === 'xml') await dialog(page).locator('#formatXML').check();
      if (level === 2) await dialog(page).locator('#informationLevel2').check();
      await dialog(page).locator(`#${scope}`).check();
      await dialog(page).locator('#export1').check();
      await sendButton(page).click();
    }

    test('current process on the child layer exports only that process', async ({ page }) => {
      const importer = await load(page);
      await importer.switchToChildLayer();
      expect(await rootId(page)).toBe(CHILD_ID);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);

      await exportAsEvent(page, 'information2');
      await expect(dialog(page)).toHaveCount(0);

      const events = await recorded(page);
      expect(events).toHaveLength(1);
      const data = events[0].data;
      expect(data.process.id).toBe(CHILD_ID);
      const onCanvas = await page.evaluate(() => window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.type !== 'label' && e.type !== 'fpb:Process' && e.id !== window.fpbjs.get('canvas').getRootElement().id)
        .map((e) => e.id).sort());
      expect(data.elementDataInformation.map((e) => e.id).sort()).toEqual(onCanvas);
      expect(data.elementVisualInformation.length).toBe(data.elementDataInformation.length);
    });

    test('current process downloaded is not the full model (no model.downloaded)', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['model.downloaded']);
      await openDialog(page);
      await dialog(page).locator('#information2').check();
      await dialog(page).locator('#export2').check();
      const file = await expectDownload(page, () => sendButton(page).click());
      const json = JSON.parse(file.content.toString('utf8'));
      expect(json.process.id).toBe(ROOT_ID);
      expect(await recorded(page)).toEqual([]);
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
      await recordEvents(page, ['fpbjs', 'model.downloaded']);

      await exportAsEvent(page, 'information3');

      const events = await recorded(page);
      expect(events).toHaveLength(1);
      expect(events[0].data.elementDataInformation.map((e) => e.id).sort()).toEqual(selected);
      expect(events[0].data.elementVisualInformation.map((e) => e.id).sort()).toEqual(selected);
    });

    test('selected elements without graphic information and with nothing selected', async ({ page }) => {
      await load(page);
      await page.evaluate(() => window.fpbjs.get('selection').select([]));
      await recordEvents(page, ['fpbjs']);
      await exportAsEvent(page, 'information3', { level: 2 });
      const events = await recorded(page);
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ elementDataInformation: [] });
    });

    test('selected elements downloaded does not fire model.downloaded', async ({ page }) => {
      await load(page);
      await page.evaluate(() => {
        const op = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        window.fpbjs.get('selection').select([op]);
      });
      await recordEvents(page, ['model.downloaded']);
      await openDialog(page);
      await dialog(page).locator('#information3').check();
      await dialog(page).locator('#export2').check();
      const file = await expectDownload(page, () => sendButton(page).click());
      const json = JSON.parse(file.content.toString('utf8'));
      expect(json.elementDataInformation).toHaveLength(1);
      expect(await recorded(page)).toEqual([]);
    });

    test('switching the scope back to All Processes exports everything again', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs']);
      await openDialog(page);
      await dialog(page).locator('#information3').check();
      await dialog(page).locator('#information1').check();
      await dialog(page).locator('#export1').check();
      await sendButton(page).click();
      const events = await recorded(page);
      expect(events[0].data.filter((e) => e.process)).toHaveLength(2);
    });
  });

  test.describe('XML', () => {

    test('XML download of all processes: valid VDI 3682 XML, model.downloaded fired', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);
      await openDialog(page);
      await dialog(page).locator('#formatXML').check();
      await dialog(page).locator('#export2').check();
      const file = await expectDownload(page, () => sendButton(page).click());
      await expect(dialog(page)).toHaveCount(0);

      expect(file.name).toBe('FPB.xml');
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

    test('XML as event arrives as a string', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs']);
      await openDialog(page);
      await dialog(page).locator('#formatXML').check();
      await dialog(page).locator('#export1').check();
      await sendButton(page).click();
      await expect(dialog(page)).toHaveCount(0);
      const events = await recorded(page);
      expect(events[0].format).toBe('xml');
      expect(typeof events[0].data).toBe('string');
      expect(events[0].data).toMatch(/^<\?xml/);
    });

    test('XML without graphic information contains no layout', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs', 'model.downloaded']);
      await openDialog(page);
      await dialog(page).locator('#formatXML').check();
      await dialog(page).locator('#informationLevel2').check();
      await dialog(page).locator('#export1').check();
      await sendButton(page).click();
      const events = await recorded(page);
      expect(events).toHaveLength(1);
      expect(events[0].data).not.toMatch(/visual:/);
    });

    test('XML always exports the whole model: the other data scopes are switched off', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['fpbjs']);
      await openDialog(page);
      await dialog(page).locator('#information2').check();
      await dialog(page).locator('#formatXML').check();

      // choosing XML goes back to All Processes and locks the other two
      await expect(dialog(page).locator('#information1')).toBeChecked();
      await expect(dialog(page).locator('#information2')).toBeDisabled();
      await expect(dialog(page).locator('#information3')).toBeDisabled();
      await expect(dialog(page).locator('.xml-scope-hint')).toHaveText('XML always contains the whole model.');

      await dialog(page).locator('#export1').check();
      await sendButton(page).click();
      await expect(dialog(page).locator('.modal-footer .alert-danger')).toHaveCount(0);
      const events = await recorded(page);
      expect(events).toHaveLength(1);
      expect(events[0].data).toContain(ROOT_ID);

      // back to JSON, the scopes are free again
      await openDialog(page);
      await dialog(page).locator('#formatJSON').check();
      await expect(dialog(page).locator('#information2')).toBeEnabled();
      await expect(dialog(page).locator('.xml-scope-hint')).toHaveCount(0);
    });
  });

  test.describe('filename', () => {

    async function downloadWithName(page, name) {
      await openDialog(page);
      await dialog(page).locator('#export2').check();
      await dialog(page).locator('#formDownloadFileName').fill(name);
      return dialog(page).locator('#formDownloadFileName');
    }

    test('a valid name is used as is', async ({ page }) => {
      await load(page);
      const field = await downloadWithName(page, 'Temperieren v2');
      await expect(field).not.toHaveClass(/is-invalid/);
      const file = await expectDownload(page, () => sendButton(page).click());
      expect(file.name).toBe('Temperieren v2.json');
    });

    test('invalid characters are flagged and replaced in the downloaded name', async ({ page }) => {
      await load(page);
      const field = await downloadWithName(page, 'a<b>c:d|e?f*g');
      await expect(field).toHaveClass(/is-invalid/);
      await expect(dialog(page).locator('.invalid-feedback')).toHaveText('Filename contains invalid characters');
      await expect(dialog(page)).toContainText('Avoid special characters: < > : " / \\ | ? *');
      const file = await expectDownload(page, () => sendButton(page).click());
      expect(file.name).toBe('a_b_c_d_e_f_g.json');
    });

    test('an empty name is flagged and falls back to FPB', async ({ page }) => {
      await load(page);
      const field = await downloadWithName(page, '   ');
      await expect(field).toHaveClass(/is-invalid/);
      await expect(dialog(page).locator('.invalid-feedback')).toHaveText('Filename cannot be empty');
      const file = await expectDownload(page, () => sendButton(page).click());
      expect(file.name).toBe('FPB.json');
    });

    test('a reserved name is flagged and falls back to FPB', async ({ page }) => {
      await load(page);
      await downloadWithName(page, 'con');
      await expect(dialog(page).locator('.invalid-feedback')).toHaveText('"con" is a reserved filename');
      const file = await expectDownload(page, () => sendButton(page).click());
      expect(file.name).toBe('FPB.json');
    });

    test('a too long name is flagged and cut to 200 characters', async ({ page }) => {
      await load(page);
      await downloadWithName(page, 'x'.repeat(230));
      await expect(dialog(page).locator('.invalid-feedback')).toHaveText('Filename is too long (max 200 characters)');
      const file = await expectDownload(page, () => sendButton(page).click());
      expect(file.name).toBe('x'.repeat(200) + '.json');
    });

    test('correcting the name clears the message; surrounding spaces are trimmed', async ({ page }) => {
      await load(page);
      const field = await downloadWithName(page, 'a/b');
      await expect(field).toHaveClass(/is-invalid/);
      await field.fill('  modell  ');
      await expect(field).not.toHaveClass(/is-invalid/);
      await expect(dialog(page).locator('.invalid-feedback')).toBeEmpty();
      const file = await expectDownload(page, () => sendButton(page).click());
      expect(file.name).toBe('modell.json');
    });

    test('the name is also used for SVG, PNG and PDF', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await dialog(page).locator('#formDownloadFileName').fill('bild');
      expect((await expectDownload(page, () => footerButton(page, 'SVG').click())).name).toBe('bild.svg');
      expect((await expectDownload(page, () => footerButton(page, 'PNG').click())).name).toBe('bild.png');
      expect((await expectDownload(page, () => footerButton(page, 'PDF').click())).name).toBe('bild.pdf');
    });
  });

  test.describe('SVG, PNG and PDF', () => {

    test('SVG of the current layer', async ({ page }) => {
      await load(page);
      await recordEvents(page, ['model.downloaded']);
      await openDialog(page);
      const file = await expectDownload(page, () => footerButton(page, 'SVG').click());
      expect(file.name).toBe('FPB.svg');
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
      // the dialog stays open, the image export is not a model save
      await expect(dialog(page)).toBeVisible();
      expect(await recorded(page)).toEqual([]);
    });

    test('PNG of the current layer', async ({ page }) => {
      await load(page);
      await openDialog(page);
      const file = await expectDownload(page, () => footerButton(page, 'PNG').click());
      expect(file.name).toBe('FPB.png');
      expect([...file.content.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // IHDR: width and height, scaled by 2
      const width = file.content.readUInt32BE(16);
      const height = file.content.readUInt32BE(20);
      expect(width).toBeGreaterThan(100);
      expect(height).toBeGreaterThan(100);
      expect(width % 2).toBe(0);
      expect(height % 2).toBe(0);
      await expect(dialog(page)).toBeVisible();
    });

    test('PDF of all layers from the child layer: one page per layer, back on the child layer, history kept', async ({ page }) => {
      const importer = await load(page);
      await importer.switchToChildLayer();
      await page.evaluate(() => {
        const op = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        window.fpbjs.get('modeling').moveElements([op], { x: 30, y: 0 });
      });
      expect(await canUndo(page)).toBe(true);
      const names = await page.evaluate(() => window.fpbjs.getProcesses().filter((p) => p.process)
        .map((p) => (p.process.identification && p.process.identification.shortName) || p.process.name || p.process.id));

      await openDialog(page);
      const file = await expectDownload(page, () => footerButton(page, 'PDF').click());
      await expect(sendButton(page)).toBeEnabled();

      expect(file.name).toBe('FPB.pdf');
      expect(file.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(file.content.toString('latin1')).toMatch(/%%EOF\s*$/);
      expect(countPdfPages(file.content)).toBe(2);
      const text = file.content.toString('latin1');
      expect(text).toContain('/Creator (FPB.JS)');
      names.forEach((n) => expect(text).toContain(`(${n})`));

      expect(await rootId(page)).toBe(CHILD_ID);
      expect(await canUndo(page)).toBe(true);
      await expect(dialog(page)).toBeVisible();
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
      const file = await expectDownload(page, () => footerButton(page, 'PDF').click());
      expect(file.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(countPdfPages(file.content)).toBe(1);
      expect(await rootId(page)).toBe(ROOT_ID);
    });
  });

  test.describe('error handling', () => {

    test('a failing SVG export shows a message and leaves the dialog usable', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await page.evaluate(() => { window.fpbjs.saveSVG = (o, done) => done(new Error('boom')); });
      await expectNoDownload(page, () => footerButton(page, 'SVG').click());
      const alert = dialog(page).locator('.modal-footer .alert-danger');
      await expect(alert).toHaveText(/SVG export failed: boom/);
      await expect(footerButton(page, 'SVG')).toBeEnabled();
    });

    test('an empty SVG result is reported for SVG and PNG', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await page.evaluate(() => { window.fpbjs.saveSVG = (o, done) => done(null, ''); });
      const alert = dialog(page).locator('.modal-footer .alert-danger');
      await expectNoDownload(page, () => footerButton(page, 'SVG').click());
      await expect(alert).toHaveText(/SVG export failed: SVG generation returned empty result/);
      await expectNoDownload(page, () => footerButton(page, 'PNG').click());
      await expect(alert).toHaveText(/PNG export failed: SVG generation returned empty result/);
    });

    test('a failing PNG export shows a message', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await page.evaluate(() => { window.fpbjs.saveSVG = (o, done) => done(new Error('kaputt')); });
      await expectNoDownload(page, () => footerButton(page, 'PNG').click());
      await expect(dialog(page).locator('.modal-footer .alert-danger')).toHaveText(/PNG export failed: kaputt/);
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
      await expectNoDownload(page, () => footerButton(page, 'PDF').click());
      await expect(dialog(page).locator('.modal-footer .alert-danger')).toHaveText(/PDF export failed: layer failed/);
      expect(await rootId(page)).toBe(CHILD_ID);
      expect(await canUndo(page)).toBe(true);
    });

    test('a failing data export shows a message and keeps the dialog open', async ({ page }) => {
      await load(page);
      await openDialog(page);
      await page.evaluate(() => { window.fpbjs.getProcess = () => undefined; });
      await dialog(page).locator('#information2').check();
      await dialog(page).locator('#export1').check();
      await sendButton(page).click();
      await expect(dialog(page).locator('.modal-footer .alert-danger')).toHaveText(/Export failed: No data available for export/);
      await expect(dialog(page)).toBeVisible();
      await expect(sendButton(page)).toBeEnabled();
    });
  });
});
