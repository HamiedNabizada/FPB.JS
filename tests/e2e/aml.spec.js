// tests/e2e/aml.spec.js
import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';

import { ImportPage } from './pages/ImportPage';
import {
  openImportDialog, pickFile, pressImport, importButton, exportViaDialog, dismissNotifications
} from './helpers/importDialog';

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
    await page.locator('.modal.show .aml-hierarchies').getByLabel(view).check();
  }
  return pressImport(page);
}

const source = (page) => page.evaluate(() => {
  const s = window.fpbjs.get('amlSupport').getSource();
  return s && { fileName: s.fileName, hierarchyName: s.hierarchyName, hierarchyId: s.hierarchyId, length: s.text.length };
});
const indexReady = (page) => page.waitForFunction(() => !!window.fpbjs.get('amlSupport').getIndex(), null, { timeout: 15000 });
const names = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry')
  .filter((e) => e.businessObject && e.businessObject.name && e.type !== 'label').map((e) => e.businessObject.name));

test.describe('AutomationML import and export', () => {

  test('asks which process view to open when the file has several', async ({ page }) => {
    const { fehler } = await start(page);
    await openImportDialog(page);
    await pickFile(page, MIXED, 'Anlage.aml', 'application/xml');

    const choice = page.locator('.modal.show .aml-hierarchies');
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

    const dialog = page.locator('.modal.show');
    await expect(dialog).toContainText('Other parts of the AutomationML file link to an element you are deleting.');
    await expect(dialog).toContainText('B1_Prozess (Behaelter_B1)');
    await dialog.getByRole('button', { name: 'Yes, proceed' }).click();
    await expect.poll(() => page.evaluate((id) => !!window.fpbjs.get('elementRegistry').get(id), LINKED_STATE)).toBe(false);

    const aml = await exportViaDialog(page, { format: 'aml' });
    expect(aml).not.toContain('Name="B1_Prozess"');
    expect(aml).toContain('Name="Behaelter_B1"');
    await expect(page.locator('.import-report')).toContainText('AML export: 1 link removed');
    await expect(page.locator('.import-report')).toContainText("Removed link 'B1_Prozess' in 'Behaelter_B1'");
  });

  test('cancelling that question keeps the state', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await indexReady(page);

    await page.evaluate((id) => {
      window.fpbjs.get('fpbDelete').remove([window.fpbjs.get('elementRegistry').get(id)]);
    }, LINKED_STATE);
    await page.locator('.modal.show').getByRole('button', { name: 'Cancel' }).click();
    expect(await page.evaluate((id) => !!window.fpbjs.get('elementRegistry').get(id), LINKED_STATE)).toBe(true);
  });

  test('the properties panel shows the foreign content of the element, read only', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await indexReady(page);

    // the import report sits over the panel button
    await dismissNotifications(page);
    await page.locator('#openPropertiesPanelButton').click();
    await page.evaluate((id) => {
      window.fpbjs.get('selection').select(window.fpbjs.get('elementRegistry').get(id));
    }, LINKED_STATE);

    const section = page.locator('.pp-aml');
    await expect(section).toBeVisible();
    await section.getByRole('button', { name: 'AML (read only)' }).click();
    const table = section.locator('.pp-aml-table');
    await expect(table).toContainText('Materialnummer');
    await expect(table).toContainText('4711');
    await expect(table).toContainText('Anlagenbezug');
    await expect(table).toContainText('B1_Prozess');
    await expect(table).toContainText('Behaelter_B1 (ZumProzess)');
    expect(await table.locator('input, textarea, select').count()).toBe(0);
  });

  test('an element without foreign content has no AML section', async ({ page }) => {
    await start(page);
    await importAml(page, MIXED);
    await indexReady(page);

    // the import report sits over the panel button
    await dismissNotifications(page);
    await page.locator('#openPropertiesPanelButton').click();
    await page.evaluate(() => {
      const plain = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:Product' && e.id !== '8891b025-4d01-3179-be62-74c48ee6c819')[0];
      window.fpbjs.get('selection').select(plain);
    });
    await expect(page.locator('#pp_identification_longName')).toBeVisible();
    await expect(page.locator('.pp-aml')).toHaveCount(0);
  });

  test('a file without FPD content opens empty; the AML export adds the process to that file', async ({ page }) => {
    const { fehler } = await start(page);
    await openImportDialog(page);
    await pickFile(page, NO_FPD, 'Pumpen.aml', 'application/xml');
    await expect(page.locator('.modal.show .aml-no-fpd')).toBeVisible({ timeout: 15000 });
    await importButton(page).click();

    await expect.poll(() => source(page)).toMatchObject({ fileName: 'Pumpen.aml', hierarchyId: null });
    await expect(page.locator('.import-report')).toContainText('contains no FPD process');
    await dismissNotifications(page);

    // an empty model has nothing to export
    const empty = await page.evaluate(() => window.fpbjs.get('amlSupport').exportAml().then(() => 'exported', (e) => e.message));
    expect(empty).toContain('The model is empty');

    // a system limit from the palette
    await page.locator('.djs-palette .entry[data-action="fpb-systemlimit"]').click();
    const canvas = await page.getByRole('application', { name: /Process diagram/ }).boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await expect.poll(() => page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit').length)).toBe(1);

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

    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.querySelector('[data-icon="download"]')).click();
    });
    await expect(page.locator('.modal.show .aml-kept-hint')).toContainText('Only an AML export keeps the rest of Anlage.aml');
    await page.locator('#formatAML').check();
    await expect(page.locator('.modal.show .aml-target-hint')).toContainText('Writes the process into Anlage.aml');
    await expect(page.locator('#information2')).toBeDisabled();
    await expect(page.locator('#informationLevel2')).toBeDisabled();
  });

  test('importing JSON afterwards drops the kept file', async ({ page }) => {
    const { importer } = await start(page);
    await importAml(page, MIXED);
    expect(await source(page)).toBeTruthy();

    await importer.import(JSON.parse(read('json/fpbjs-temperieren.json')));
    expect(await source(page)).toBe(null);
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
    await page.locator('.autosave-notice').getByRole('button', { name: /^Restore/ }).click();
    await expect.poll(() => names(page)).toContain('Kaltes Wasser');

    expect(await source(page)).toMatchObject({ fileName: 'Anlage.aml', hierarchyName: 'FPD_Heating' });
    const aml = await exportViaDialog(page, { format: 'aml' });
    expect(aml).toContain('Name="Behaelter_B1"');
    expect(aml).toContain('Name="Kaltes Wasser"');
  });
});
