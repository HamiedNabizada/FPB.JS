import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';
import { ImportPage } from './pages/ImportPage';
import { openImportDialog, pickFile, pressImport, importButton, dismissNotifications } from './helpers/importDialog';

/** New panel: AML section (028 E6, E9, 016b V11) */

const showcase = path.join(__dirname, '..', 'unit', 'aml', 'oracle', 'inputs', 'aml', 'Showcase-A-WaermetauscherMitRegelung.aml');

async function openWithAml(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto('/?panel=next');
  await openImportDialog(page);
  await pickFile(page, fs.readFileSync(showcase, 'utf8'), 'Showcase-A.aml', 'application/xml');
  await expect(importButton(page)).toBeEnabled({ timeout: 15000 });
  await pressImport(page);
  await page.waitForFunction(() => !!window.fpbjs.get('amlSupport').getIndex(), null, { timeout: 15000 });
  // the import report covers the panel button
  await dismissNotifications(page);
  await page.locator('#propertiesPanelToggle').click();
}

const group = (page) => page.locator('[data-group-id="group-aml"]');

test.describe('New properties panel, AML', () => {

  test('a selected element shows where it stands in the AML file, folded until opened', async ({ page }) => {
    await openWithAml(page);
    await page.evaluate(() => {
      const element = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('selection').select(element);
    });
    await expect(group(page)).toContainText('AML');
    await expect(group(page).locator('.bio-properties-panel-group-entries')).not.toHaveClass(/open/);

    await group(page).locator('.bio-properties-panel-group-header').click();
    await expect(group(page)).toContainText('Path');
    await expect(group(page)).toContainText('Class');
  });

  test('without a kept AML file there is no AML section', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const importer = new ImportPage(page);
    await importer.goto('/?panel=next');
    await importer.import(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'temperieren.json'), 'utf8')));
    await page.locator('#propertiesPanelToggle').click();
    await page.evaluate(() => {
      const element = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('selection').select(element);
    });
    await expect(page.locator('[data-group-id="group-identification"]')).toBeVisible();
    await expect(group(page)).toHaveCount(0);
  });
});
