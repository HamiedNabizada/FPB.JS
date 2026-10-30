// tests/e2e/check-in-dialogs.spec.js
import fs from 'fs';
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für die Modellprüfung an den Übergabestellen.
 *
 * Die Prüfung lief bisher nur im Editor. Eine Datei, die sauber importiert,
 * aber gegen Regeln verstößt, sagte nichts; und beim Download erfuhr man es
 * auch nicht. Jetzt steht das Ergebnis im Import-Bericht und als Hinweis im
 * Export-Dialog.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

/** Modell mit einem Regelverstoß: ein Operator liegt außerhalb der Systemgrenze (B2) */
function mitVerstoss() {
  const modell = clone();
  const prozess = modell.find((eintrag) => eintrag.process);
  const operator = prozess.elementVisualInformation.find((v) => v.type === 'fpb:ProcessOperator');
  operator.x += 900;
  return modell;
}

async function laden(page, modell) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(modell);
  await page.waitForTimeout(600);
  return importer;
}

const bericht = (page) => page.locator('[data-id="import.report"]');

test.describe('Prüfung an den Übergabestellen', () => {

  test('der Import-Bericht nennt die Befunde der Prüfung', async ({ page }) => {
    await laden(page, mitVerstoss());

    await expect(bericht(page)).toBeVisible();
    await expect(bericht(page).locator('.fpb-notification-message')).toContainText('1 error');
    await expect(bericht(page).locator('.fpb-notification-message')).toContainText('0 warnings');
  });

  test('der Knopf im Bericht öffnet die Liste der Befunde', async ({ page }) => {
    await laden(page, mitVerstoss());

    const knopf = bericht(page).getByRole('button', { name: 'Show findings' });
    await expect(knopf).toBeVisible();
    // der Knopf liegt an seiner Stelle wirklich obenauf
    const obenauf = await page.evaluate(() => {
      const button = [...document.querySelectorAll('[data-id="import.report"] button')]
        .find((b) => b.textContent.includes('Show findings'));
      const box = button.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button;
    });
    expect(obenauf).toBe(true);

    await knopf.dispatchEvent('click');

    await expect(page.locator('.fpb-validation-panel.open')).toBeVisible();
    await expect(page.locator('.fpb-validation-item[data-rule="B2"]')).toHaveCount(1);
  });

  test('ein regelkonformes Modell zeigt keinen Bericht', async ({ page }) => {
    await laden(page, clone());

    await expect(bericht(page)).toHaveCount(0);
  });

  test('der Export-Dialog weist auf Befunde hin, exportiert aber weiter', async ({ page }) => {
    await laden(page, mitVerstoss());
    // Der Bericht liegt über den Knöpfen der Seitenleiste
    await bericht(page).getByRole('button', { name: 'Dismiss' }).dispatchEvent('click');
    await expect(bericht(page)).toHaveCount(0);

    await page.locator('#exportButton').click();

    const hinweis = page.locator('dialog.fpb-export-dialog[open] .fpb-export-check');
    await expect(hinweis).toContainText('1 error');
    await expect(hinweis).toContainText('The export runs anyway');

    // der Export läuft trotz Befund
    const download = page.waitForEvent('download');
    await page.locator('dialog.fpb-export-dialog[open] [data-answer="export"]').click();
    const daten = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
    expect(daten.length).toBeGreaterThan(0);
  });

  test('ohne Befunde steht kein Hinweis im Export-Dialog', async ({ page }) => {
    await laden(page, clone());

    await page.locator('#exportButton').click();

    await expect(page.locator('dialog.fpb-export-dialog[open]')).toBeVisible();
    await expect(page.locator('.fpb-export-check')).toHaveCount(0);
  });

});
