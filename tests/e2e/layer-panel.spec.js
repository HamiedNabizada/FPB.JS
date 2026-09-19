// tests/e2e/layer-panel.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für die Prozess-Baumansicht im Layer-Panel.
 *
 * Vorher belegt: der Baum memoisierte über die Liste der Prozesse. Das Umbenennen
 * eines dekomponierten ProcessOperators ändert dessen BusinessObject an Ort und
 * Stelle, die Liste bleibt gleich, der Baum zeigte weiter den alten Namen.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

test.describe('Layer-Panel - Prozessbaum', () => {

  test('zeigt den neuen Namen eines umbenannten dekomponierten ProcessOperators', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());
    expect(await importer.layerPanelText()).toContain('Erhitzen');

    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.businessObject.decomposedView)[0];
      window.fpbjs.get('modeling').updateLabel(operator, 'Aufheizen');
    });
    await page.waitForTimeout(300);

    const text = await importer.layerPanelText();
    expect(text).toContain('Aufheizen');
    expect(text).not.toContain('Erhitzen');
  });

});
