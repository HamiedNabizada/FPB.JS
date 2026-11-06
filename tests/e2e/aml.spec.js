// tests/e2e/aml.spec.js
import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';

import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import {
  openImportDialog, pickFile, pressImport, importButton, exportViaDialog, dismissNotifications, OPEN
} from './helpers/importDialog';
import { DIALOG } from './helpers/ui';

/**
 * AutomationML import and export (feature 028). The files are the inputs of
 * the mapper oracle (tests/unit/aml/oracle/inputs):
 * - mixed.aml: Showcase A (process view FPD_Heating) with a plant hierarchy
 *   whose tank links into the state "Abgekühltes Medium", user attributes on
 *   that state and on an operator, and a second process view FPBJS_Project;
 * - no-fpd.aml: a plant hierarchy only;
 * - Showcase B: two process views.
 */

const inputs = path.join(__dirname, '..', 'unit', 'aml', 'oracle', 'inputs');
const read = (rel) => fs.readFileSync(path.join(inputs, rel), 'utf8');
const MIXED = read('generated/mixed.aml');
const NO_FPD = read('generated/no-fpd.aml');
const LINKED_STATE = '8891b025-4d01-3179-be62-74c48ee6c819';

async function start(page) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  return { importer, fehler };
}

/** Import an AML text through the dialog; `view` chooses the process view by name */
async function importAml(page, text, name = 'Anlage.aml', view = null) {
  await openImportDialog(page);
  await pickFile(page, text, name, 'application/xml');
  await expect(importButton(page)).toBeEnabled({ timeout: 15000 });
  if (view) {
    await page.locator(`${OPEN} .aml-hierarchies`).getByLabel(view).check();
  }
  return pressImport(page);
}

const source = (page) => page.evaluate(() => {
  const s = window.fpbjs.get('amlSupport').getSource();
  return s && { fileName: s.fileName, hierarchyName: s.hierarchyName, hierarchyId: s.hierarchyId, length: s.text.length };
});
const indexReady = (page) => page.waitForFunction(() => !!window.fpbjs.get('amlSupport').getIndex(), null, { timeout: 15000 });
// the AML section of the properties panel (016b V11)
const amlGroup = (page) => page.locator('[data-group-id="group-aml"]');
const openAmlGroup = (page) => amlGroup(page).locator('.bio-properties-panel-group-header').click();
const names = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry')
  .filter((e) => e.businessObject && e.businessObject.name && e.type !== 'label').map((e) => e.businessObject.name));

test.describe('AutomationML import and export', () => {

  // 016c T9a: the AML half of the round trip; AML writes the values as text (xs:string)
  test('setpoint, limits and actual values keep 0, a one-sided and an empty limit through AML', async ({ page }) => {
    const { importer, fehler } = await start(page);
    const model = JSON.parse(JSON.stringify(basis));
    const desc = model[1].elementDataInformation[11].characteristics[0].descriptiveElement;
    desc.setpointValue.value = 0;
    desc.validityLimits = [
      { $type: 'fpbch:ValidityLimits', limitType: 'acceptance region', from: 0, to: 5 },
      { $type: 'fpbch:ValidityLimits', limitType: 'permitted rejection region', from: 345 }
    ];
    desc.actualValues = [
      { $type: 'fpbch:ValueWithUnit', value: 0, unit: '°C' },
      { $type: 'fpbch:ValueWithUnit', value: 'warm' }
    ];
    await importer.import(model);

    const aml = await page.evaluate(() => window.fpbjs.get('amlSupport').exportAml().then((r) => r.text));
    await importAml(page, aml, 'Rundreise.aml');

    const back = await page.evaluate(() => {
      const state = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Rohstoff' &&
        e.type !== 'label' && (e.businessObject.characteristics || []).length)[0];
      const d = state.businessObject.characteristics[0].descriptiveElement;
      const list = (x) => (Array.isArray(x) ? x : [x]).filter(Boolean);
      return {
        setpoint: d.setpointValue && d.setpointValue.value,
        limits: list(d.validityLimits).map((l) => [l.limitType, l.from, l.to]),
        actuals: list(d.actualValues).map((v) => [v.value, v.unit || ''])
      };
    });
    // a number may come back as text, but 0 stays 0 and an empty limit stays empty
    const value = (v) => (v === '' || v === undefined || v === null ? null : (isNaN(Number(v)) ? v : Number(v)));
    expect(value(back.setpoint)).toBe(0);
    expect(back.limits.map(([type, from, to]) => [type, value(from), value(to)])).toEqual([
      ['acceptance region', 0, 5],
      ['permitted rejection region', 345, null]
    ]);
    expect(back.actuals.map(([v, unit]) => [value(v), unit])).toEqual([[0, '°C'], ['warm', '']]);
    expect(fehler).toEqual([]);
  });

  test('asks which process view to open when the file has several', async ({ page }) => {
    const { fehler } = await start(page);
    await openImportDialog(page);
    await pickFile(page, MIXED, 'Anlage.aml', 'application/xml');

    const choice = page.locator(`${OPEN} .aml-hierarchies`);
    await expect(choice).toBeVisible({ timeout: 15000 });
    await expect(choice).toContainText('2 process views');
    await expect(choice.getByLabel('FPD_Heating')).toBeChecked();
    await choice.getByLabel('FPBJS_Project').check();

    const result = await pressImport(page);
    expect(result.errors).toEqual([]);
    expect(await names(page)).toContain('Erhitzen');
    expect(await source(page)).toMatchObject({ fileName: 'Anlage.aml', hierarchyName: 'FPBJS_Project' });
    expect(fehler).toEqual([]);
  });

  // stability round after 031: the second view of Showcase B and C has no ID in
  // the file; the web app opened the first view instead and the export added a third
  test('a process view without an ID opens as chosen and the export updates it', async ({ page }) => {
    await start(page);
    const text = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'examples', 'Showcase-C-CncRobotikMontage.aml'), 'utf8');
    const r = await page.evaluate(async (t) => {
      const aml = window.fpbjs.get('amlSupport');
      const found = await aml.inspect(t);
      const second = found.find((h) => h.name === 'FPD_Fasteners_Stock');
      const done = new Promise((resolve) => { window.fpbjs.get('eventBus').once('import.done', resolve); setTimeout(resolve, 8000); });
      const opened = await aml.importAml(t, { hierarchyId: second.id });
      await done;
      const out = await aml.exportAml();
      const again = await aml.inspect(out.text);
      return { key: second.id, opened: opened.hierarchy.name, kept: aml.getSource().hierarchyName, views: again.map((h) => h.name) };
    }, text);
    expect(r.key).toBeTruthy();
    expect(r.opened).toBe('FPD_Fasteners_Stock');
    expect(r.kept).toBe('FPD_Fasteners_Stock');
    expect(r.views).toEqual(['FPD_Assembly', 'FPD_Fasteners_Stock']);
  });

  test('the AML export writes the edit into the file and keeps everything else', async ({ page }) => {
    const { fehler } = await start(page);
    const result = await importAml(page, MIXED);
    expect(result.errors).toEqual([]);

    await page.evaluate((id) => {
      const shape = window.fpbjs.get('elementRegistry').get(id);
      window.fpbjs.get('modeling').updateLabel(shape, 'Kaltes Wasser');
    }, LINKED_STATE);

    const aml = await exportViaDialog(page, { format: 'aml' });
    expect(aml).toContain('Name="Kaltes Wasser"');
    // the rest of the file
    expect(aml).toContain('Name="Behaelter_B1"');
    expect(aml).toContain('Name="B1_Prozess"');
    expect(aml).toContain('<Value>4711</Value>');
    expect(aml).toContain('Name="FPBJS_Project"');
    expect(fehler).toEqual([]);
  });

  test('deleting a state the plant links to asks first; the export removes the link and says so', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await indexReady(page);

    await page.evaluate((id) => {
      const shape = window.fpbjs.get('elementRegistry').get(id);
      window.fpbjs.get('selection').select(shape);
      window.fpbjs.get('canvas').focus();
    }, LINKED_STATE);
    await page.keyboard.press('Delete');

    const dialog = page.locator(DIALOG);
    await expect(dialog).toContainText('Other parts of the AutomationML file link to an element you are deleting.');
    await expect(dialog).toContainText('B1_Prozess (Behaelter_B1)');
    await dialog.locator('[data-answer="confirm"]').click();
    await expect.poll(() => page.evaluate((id) => !!window.fpbjs.get('elementRegistry').get(id), LINKED_STATE)).toBe(false);

    const aml = await exportViaDialog(page, { format: 'aml' });
    expect(aml).not.toContain('Name="B1_Prozess"');
    expect(aml).toContain('Name="Behaelter_B1"');
    await expect(page.locator('[data-id="export.report"]')).toContainText('AML export: 1 link removed');
    await expect(page.locator('[data-id="export.report"]')).toContainText("Removed link 'B1_Prozess' in 'Behaelter_B1'");
  });

  test('deleting a decomposed operator names the links on its layers below', async ({ page }) => {
    await start(page);
    await importAml(page, read('aml/Showcase-A-WaermetauscherMitRegelung.aml'), 'Showcase-A.aml');
    await indexReady(page);

    // "Wärmeübertragen" is decomposed; "Plattenwärmeübertragung" below links to the plant
    await page.evaluate(() => {
      const po = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('fpbDelete').remove([po]);
    });
    const dialog = page.locator(DIALOG);
    await expect(dialog).toContainText('decomposed layer');
    await expect(dialog).toContainText('Other parts of the AutomationML file link to elements you are deleting.');
    await expect(dialog).toContainText('PlatteToTempSensor (Plattenwärmeübertragung)');
    await expect(dialog).toContainText('VentilToPressureCtl (Stellventil betätigen)');
  });

  test('cancelling that question keeps the state', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await indexReady(page);

    await page.evaluate((id) => {
      window.fpbjs.get('fpbDelete').remove([window.fpbjs.get('elementRegistry').get(id)]);
    }, LINKED_STATE);
    await page.locator(DIALOG).getByRole('button', { name: 'Cancel' }).click();
    expect(await page.evaluate((id) => !!window.fpbjs.get('elementRegistry').get(id), LINKED_STATE)).toBe(true);
  });

  test('the properties panel shows what the file says about the element, read only', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await indexReady(page);

    // the import report sits over the panel button
    await dismissNotifications(page);
    await page.locator('#propertiesPanelToggle').click();
    await page.evaluate((id) => {
      window.fpbjs.get('selection').select(window.fpbjs.get('elementRegistry').get(id));
    }, LINKED_STATE);

    await expect(amlGroup(page)).toBeVisible();
    await openAmlGroup(page);
    const table = amlGroup(page);
    await expect(table).toContainText('Anlage.aml');
    await expect(table).toContainText('FPD_Heating ›');
    await expect(table).toContainText('{8891b025-4d01-3179-be62-74c48ee6c819}');
    await expect(table).toContainText('VDI_FPD_SystemUnitClassLib/FPD_Product');
    await expect(table).toContainText('VDI_FPD_RoleClassLib/FPD_Product');
    await expect(table).toContainText('Austritt Heiß (abgekühlt)');
    await expect(table.locator('.pp-aml-flow').first()).toBeVisible();
    await expect(table.locator('.pp-aml-link')).toContainText('Behaelter_B1 (ZumProzess)');
    await expect(table.locator('.pp-aml-link')).toContainText('B1_Prozess in Anlage');
    await expect(table).toContainText('Materialnummer = 4711');
    await expect(table).toContainText('Anlagenbezug');
    expect(await table.locator('input, textarea, select').count()).toBe(0);
  });

  test('every element from the file has the section; once opened it stays open', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await indexReady(page);
    await dismissNotifications(page);
    await page.locator('#propertiesPanelToggle').click();

    const select = (type) => page.evaluate((type) => {
      const element = window.fpbjs.get('elementRegistry').filter((e) => e.type === type)[0];
      window.fpbjs.get('selection').select(element);
    }, type);

    await select('fpb:ProcessOperator');
    await expect(amlGroup(page)).toBeVisible();
    const entries = amlGroup(page).locator('.bio-properties-panel-group-entries');
    await expect(entries).not.toHaveClass(/open/);
    await openAmlGroup(page);
    await expect(amlGroup(page)).toContainText('VDI_FPD_SystemUnitClassLib/FPD_ProcessOperator');

    // another element: still open
    await select('fpb:SystemLimit');
    await expect(entries).toHaveClass(/open/);
    await expect(amlGroup(page)).toContainText('VDI_FPD_SystemUnitClassLib/FPD_SystemLimit');
  });

  test('a file without FPD content opens empty; the AML export adds the process to that file', async ({ page }) => {
    const { fehler } = await start(page);
    await openImportDialog(page);
    await pickFile(page, NO_FPD, 'Pumpen.aml', 'application/xml');
    await expect(page.locator(`${OPEN} .aml-no-fpd`)).toBeVisible({ timeout: 15000 });
    await importButton(page).click();

    await expect.poll(() => source(page)).toMatchObject({ fileName: 'Pumpen.aml', hierarchyId: null });
    await expect(page.locator('[data-id="import.report"]')).toContainText('contains no FPD process');
    await dismissNotifications(page);

    // an empty model has nothing to export
    const empty = await page.evaluate(() => window.fpbjs.get('amlSupport').exportAml().then(() => 'exported', (e) => e.message));
    expect(empty).toContain('The model is empty');

    // a system limit from the palette
    await page.locator('.djs-palette .entry[data-action="fpb-systemlimit"]').click();
    const canvas = await page.getByRole('application', { name: /Process diagram/ }).boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await expect.poll(() => page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit').length)).toBe(1);

    // the new system limit is not in the file yet
    await page.locator('#propertiesPanelToggle').click();
    await page.evaluate(() => {
      window.fpbjs.get('selection').select(window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0]);
    });
    await openAmlGroup(page);
    await expect(amlGroup(page).locator('.pp-aml-new')).toContainText('Not in the AML file yet. The AML export adds it to Pumpen.aml.');

    const aml = await exportViaDialog(page, { format: 'aml' });
    expect(aml).toContain('Name="Pumpe_P1"');
    expect(aml).toContain('RefBaseSystemUnitPath="VDI_FPD_SystemUnitClassLib/FPD_Process"');
    expect(await source(page)).toMatchObject({ fileName: 'Pumpen.aml' });
    expect((await source(page)).hierarchyId).toBeTruthy();
    expect(fehler).toEqual([]);
  });

  test('the export dialog says where AML goes and that JSON and XML leave the rest out', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await dismissNotifications(page);

    await page.locator('#exportButton').click();
    const dialog = page.locator('dialog.fpb-export-dialog[open]');
    await expect(dialog.locator('.aml-kept-hint')).toContainText('Only an AML export keeps the rest of Anlage.aml');
    await dialog.locator('#exportFormat-aml').check();
    await expect(dialog.locator('.aml-target-hint')).toContainText('Writes the process into Anlage.aml');
    // AML is always the whole model with layout: neither scope nor layout to choose
    await expect(dialog.locator('#exportScope-layer')).toHaveCount(0);
    await expect(dialog.locator('#exportLayout')).toHaveCount(0);
    await expect(dialog.locator('.fpb-export-scope')).toHaveText('AML always contains the whole model.');
  });

  test('importing JSON afterwards drops the kept file', async ({ page }) => {
    const { importer } = await start(page);
    await importAml(page, MIXED);
    expect(await source(page)).toBeTruthy();

    await importer.import(JSON.parse(read('json/fpbjs-temperieren.json')));
    expect(await source(page)).toBe(null);
  });

  test('the import report says which elements carry more from the file and where to see it', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);

    const report = page.locator('[data-id="import.report"]');
    await expect(report).toContainText('elements carry more from the AML file');
    await expect(report).toContainText('Abgekühltes Medium');
    await expect(report).toContainText('"AML (read only)" in the properties panel');
  });

  test('the AML file overview lists the whole file and jumps to an element on another layer', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await dismissNotifications(page);

    await page.locator('#amlOverviewButton').click();
    const modal = page.locator('.aml-overview-modal');
    await expect(modal).toContainText('AML file: Anlage.aml');
    // a dialog of the modeler since 016e D1
    expect(await modal.evaluate((d) => d.tagName === 'DIALOG' && d.open)).toBe(true);
    const hierarchies = modal.locator('.aml-overview-hierarchies');
    await expect(hierarchies.locator('tr', { hasText: 'FPD_Heating' })).toContainText('process view, open in FPB.js');
    await expect(hierarchies.locator('tr', { hasText: 'FPBJS_Project' })).toContainText('process view');
    await expect(hierarchies.locator('tr', { hasText: 'Anlage' })).toContainText('other content');
    await expect(modal.locator('.aml-overview-libraries')).toContainText('VDI_FPD_SystemUnitClassLib');

    // "Stellventil betätigen" sits on the layer "Druckregelung", not on the open one
    await modal.getByRole('button', { name: 'Show Stellventil betätigen' }).click();
    await expect(modal).toHaveCount(0);
    const selected = await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.businessObject.name));
    expect(selected).toEqual(['Stellventil betätigen']);
  });

  // 016g D6
  test('the AML overview names elements and the file even without a name', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await dismissNotifications(page);
    const id = await page.evaluate(() => {
      const aml = window.fpbjs.get('amlSupport');
      const overview = aml.getOverview();
      const source = aml.getSource();
      const first = overview.elements[0];
      aml.getOverview = () => Object.assign({}, overview, { elements: [Object.assign({}, first, { name: '' })].concat(overview.elements.slice(1)) });
      aml.getSource = () => Object.assign({}, source, { fileName: '' });
      return first.id;
    });
    await page.locator('#amlOverviewButton').click();
    const modal = page.locator('.aml-overview-modal');
    await expect(modal.locator('.fpb-dialog-title')).toHaveText('AML file');
    await expect(modal.getByRole('button', { name: 'Show ' + id, exact: true })).toHaveCount(1);
  });

  test('marks on the canvas are off by default and can be switched on in the overview', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await dismissNotifications(page);
    await expect(page.locator('.fpb-aml-marker')).toHaveCount(0);

    await page.locator('#amlOverviewButton').click();
    await page.locator('#amlMarkersSwitch').check();
    await page.locator('.aml-overview-modal').getByRole('button', { name: 'Close AML file overview' }).click();
    // on the open layer only the state carries more
    await expect(page.locator('.fpb-aml-marker')).toHaveCount(1);
    await expect(page.locator(`.djs-overlays[data-container-id="${LINKED_STATE}"] .fpb-aml-marker`)).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('fpbjs.amlMarkers'))).toBe('true');

    // on another layer: the operator there carries a link into the plant
    await page.locator('#amlOverviewButton').click();
    await page.locator('.aml-overview-modal').getByRole('button', { name: 'Show Stellventil betätigen' }).click();
    const operator = await page.evaluate(() => window.fpbjs.get('selection').get()[0].id);
    await expect(page.locator(`.djs-overlays[data-container-id="${operator}"] .fpb-aml-marker`)).toHaveCount(1);

    await page.evaluate(() => window.fpbjs.get('amlMarkers').setEnabled(false));
    await expect(page.locator('.fpb-aml-marker')).toHaveCount(0);
  });

  test('without a kept AML file there is no AML file overview', async ({ page }) => {
    const { importer } = await start(page);
    await importer.import(JSON.parse(read('json/fpbjs-temperieren.json')));
    await openImportDialog(page);
    await page.locator(OPEN).getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#amlOverviewButton')).toHaveCount(0);

    await page.locator('#propertiesPanelToggle').click();
    await page.evaluate(() => {
      window.fpbjs.get('selection').select(window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0]);
    });
    await expect(page.locator('#bio-properties-panel-longName')).toBeVisible();
    await expect(amlGroup(page)).toHaveCount(0);
  });

  test('the browser backup keeps the AML file', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.fpbjs.get('autosave').ready());
    await importAml(page, MIXED);
    await page.evaluate((id) => {
      window.fpbjs.get('modeling').updateLabel(window.fpbjs.get('elementRegistry').get(id), 'Kaltes Wasser');
    }, LINKED_STATE);
    await page.evaluate(() => window.fpbjs.get('autosave').flush());

    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    await page.evaluate(() => window.fpbjs.get('autosave').ready());
    await page.locator('[data-id="autosave.pending"]').getByRole('button', { name: /^Restore/ }).click();
    await expect.poll(() => names(page)).toContain('Kaltes Wasser');

    expect(await source(page)).toMatchObject({ fileName: 'Anlage.aml', hierarchyName: 'FPD_Heating' });
    const aml = await exportViaDialog(page, { format: 'aml' });
    expect(aml).toContain('Name="Behaelter_B1"');
    expect(aml).toContain('Name="Kaltes Wasser"');
  });
});
