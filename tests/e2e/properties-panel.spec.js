// tests/e2e/properties-panel.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für das Properties-Panel bei Änderungen von außen.
 *
 * Vorher belegt: die Felder der Identifikation sind ungesteuert (defaultValue).
 * Nach einer Umbenennung auf der Zeichenfläche zeigte das offene Panel weiter
 * den alten Namen, und ein Zeichen im Feld "Short Name" schrieb den alten Namen
 * zurück: "Erhitzen" -> Umbenennung "Neu" -> Tippen "X" -> "ErhitzenX".
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function panelMitOperator(page) {
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  await page.click('#openPropertiesPanelButton');
  await page.evaluate(() => {
    const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
    window.fpbjs.get('selection').select(operator);
  });
  const feld = page.locator('#pp_identification_shortName');
  await expect(feld).toBeVisible();
  return feld;
}

const nameImModell = (page) => page.evaluate(() =>
  window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0].businessObject.name);

test.describe('Properties-Panel - Änderungen von außen', () => {

  test('zeigt den auf der Zeichenfläche geänderten Namen', async ({ page }) => {
    const feld = await panelMitOperator(page);
    const alt = await feld.inputValue();

    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('modeling').updateLabel(operator, 'Neu');
    });

    await expect(feld).toHaveValue('Neu');
    expect(alt).not.toBe('Neu');
  });

  test('Tippen nach einer Umbenennung schreibt den alten Namen nicht zurück', async ({ page }) => {
    const feld = await panelMitOperator(page);

    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('modeling').updateLabel(operator, 'Neu');
    });
    await feld.click();
    await page.keyboard.press('End');
    await page.keyboard.type('X');

    expect(await nameImModell(page)).toBe('NeuX');
  });

  test('behält beim Tippen im Panel Fokus und alle Zeichen', async ({ page }) => {
    const feld = await panelMitOperator(page);
    const alt = await feld.inputValue();

    await feld.click();
    await page.keyboard.press('End');
    await page.keyboard.type('abc', { delay: 30 });

    await expect(feld).toBeFocused();
    await expect(feld).toHaveValue(alt + 'abc');
    expect(await nameImModell(page)).toBe(alt + 'abc');
  });

});
