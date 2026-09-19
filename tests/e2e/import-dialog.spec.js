// tests/e2e/import-dialog.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für den Import-Dialog: Datei per Drag and Drop.
 *
 * Die Datei wird im Browser als File erzeugt und über DragEvents mit einem
 * DataTransfer abgelegt, so wie es der Browser beim Ziehen aus dem Explorer tut.
 */

const DATEINAME = 'temperieren.json';

async function dialogOeffnen(page) {
  const importer = new ImportPage(page);
  await importer.goto();
  await page.locator('.layerPanel > button').first().click();
  await page.locator('.upload-properties button').click();
  await expect(page.locator('.modal-body .fileLabel')).toBeVisible();
  return importer;
}

/** Datei über dem Ziel fallen lassen; liefert, ob die Seite den Drop abgefangen hat */
async function dateiAblegen(page, selector, inhalt, name) {
  return page.evaluate(({ selector, inhalt, name }) => {
    const ziel = document.querySelector(selector);
    const transfer = new DataTransfer();
    transfer.items.add(new File([inhalt], name, { type: 'application/json' }));
    const optionen = { bubbles: true, cancelable: true, dataTransfer: transfer };
    ziel.dispatchEvent(new DragEvent('dragenter', optionen));
    ziel.dispatchEvent(new DragEvent('dragover', optionen));
    const drop = new DragEvent('drop', optionen);
    ziel.dispatchEvent(drop);
    return drop.defaultPrevented;
  }, { selector, inhalt, name });
}

test.describe('Import-Dialog - Drag and Drop', () => {

  test('übernimmt eine abgelegte Datei und importiert sie', async ({ page }) => {
    const importer = await dialogOeffnen(page);

    const abgefangen = await dateiAblegen(page, '.modal-body', JSON.stringify(basis), DATEINAME);

    expect(abgefangen).toBe(true);
    await expect(page.locator('.modal-body .fileLabel')).toHaveText(DATEINAME);
    const knopf = page.locator('.modal-footer button');
    await expect(knopf).toBeEnabled();
    await knopf.click();
    await page.waitForTimeout(importer.importDelay);

    expect((await importer.dataStore()).prozesse).toHaveLength(2);
  });

  test('lehnt eine Datei mit falscher Endung ab', async ({ page }) => {
    await dialogOeffnen(page);

    await dateiAblegen(page, '.modal-body', 'kein Modell', 'notizen.txt');

    await expect(page.locator('.modal-body .fileLabel')).not.toHaveText('notizen.txt');
    await expect(page.locator('.modal-footer button')).toBeDisabled();
  });

  test('eine neben dem Dialog abgelegte Datei öffnet der Browser nicht', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();

    const abgefangen = await dateiAblegen(page, '#modeler-container .djs-container', JSON.stringify(basis), DATEINAME);

    expect(abgefangen).toBe(true);
    expect((await importer.dataStore()).prozesse).toHaveLength(0);
  });

});
