// tests/e2e/export-undo.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für den PDF-Export und die Undo-Historie.
 *
 * Der PDF-Export rendert jede Ebene einzeln und schaltet dafür durch alle
 * Ebenen. Das ist kein Ebenenwechsel des Benutzers, sondern ein Durchlauf, der
 * dort endet, wo er begonnen hat. Die Historie muss ihn überleben, sonst
 * verliert ein Export still alles, was vorher gemacht wurde.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function laden(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

/** Einen Operator der aktuellen Ebene verschieben, gibt id und alte Position zurück */
function verschieben(page) {
  return page.evaluate(() => {
    const element = window.fpbjs.get('elementRegistry')
      .filter((e) => e.type === 'fpb:ProcessOperator')[0];
    const vorher = element.x;
    window.fpbjs.get('modeling').moveElements([element], { x: 40, y: 0 });
    return { id: element.id, vorher, nachher: element.x };
  });
}

const positionVon = (page, id) => page.evaluate(
  (id) => window.fpbjs.get('elementRegistry').get(id).x, id
);

const kannRueckgaengig = (page) => page.evaluate(() => window.fpbjs.get('commandStack').canUndo());

async function downloadDialogOeffnen(page) {
  await page.locator('.layerPanel > button').first().click();
  await page.evaluate(() => {
    const knopf = [...document.querySelectorAll('button')].find((b) => b.querySelector('[data-icon="download"]'));
    knopf.click();
  });
  await expect(page.locator('.modal.show')).toBeVisible();
}

test.describe('PDF-Export und Historie', () => {

  test('der PDF-Export lässt die Historie unangetastet', async ({ page }) => {
    await laden(page);
    const verschoben = await verschieben(page);
    expect(await kannRueckgaengig(page)).toBe(true);

    const ebeneVorher = await page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);
    await downloadDialogOeffnen(page);

    const download = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('.modal.show button', { hasText: 'PDF' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

    // zurück auf der Ausgangsebene und die Historie steht noch
    expect(await page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id)).toBe(ebeneVorher);
    expect(await kannRueckgaengig(page)).toBe(true);

    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await positionVon(page, verschoben.id)).toBe(verschoben.vorher);
  });

  test('ein echter Ebenenwechsel beendet die Historie weiterhin', async ({ page }) => {
    const importer = await laden(page);
    await verschieben(page);
    expect(await kannRueckgaengig(page)).toBe(true);

    await importer.switchToChildLayer();

    expect(await kannRueckgaengig(page)).toBe(false);
  });

});
