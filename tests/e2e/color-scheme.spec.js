// tests/e2e/color-scheme.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für das Farbschema bei Farbfehlsichtigkeit.
 *
 * VDI 3682 gibt den Elementtypen ihre Farben, und zwei davon fallen bei
 * Farbfehlsichtigkeit zusammen (gemessen im Unit-Test zu core/colorScheme).
 * Das zweite Schema hält sie auseinander. Es ist eine Sache der Anzeige: es
 * steht im Browser, nicht im Modell, und färbt Zeichenfläche, Palette, Menüs
 * und Vorschau gleichermaßen.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

const STANDARD = { operator: 'rgb(19, 174, 77)', produkt: 'rgb(237, 32, 40)' };
const ZUGAENGLICH = { operator: 'rgb(77, 255, 151)', produkt: 'rgb(229, 0, 38)' };

async function laden(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

const fuellungen = (page) => page.evaluate(() => {
  const registry = window.fpbjs.get('elementRegistry');
  const fuellung = (typ) => {
    const element = registry.filter((e) => e.type === typ)[0];
    const visual = document.querySelector(`[data-element-id="${element.id}"] .djs-visual > *`);
    return getComputedStyle(visual).fill;
  };
  return { operator: fuellung('fpb:ProcessOperator'), produkt: fuellung('fpb:Product') };
});

const umschalten = (page, schema) => page.evaluate(
  (schema) => window.fpbjs.get('colorSchemeService').set(schema), schema
);

test.describe('Farbschema', () => {

  test('der Schalter färbt Zeichenfläche und Palette um', async ({ page }) => {
    await laden(page);
    expect(await fuellungen(page)).toEqual(STANDARD);

    await page.locator('.layerPanel > button').first().click();
    await page.locator('#colorSchemeButton').click();
    await page.waitForTimeout(400);

    expect(await fuellungen(page)).toEqual(ZUGAENGLICH);

    // das Symbol der Palette trägt dieselbe Farbe
    const symbol = await page.locator('.djs-palette .entry[data-action="fpb-processoperator"]')
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(symbol.toUpperCase()).toContain('4DFF97');
  });

  test('die Wahl überlebt das Neuladen', async ({ page }) => {
    await laden(page);
    await umschalten(page, 'accessible');

    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);

    expect(await page.evaluate(() => window.fpbjs.get('colorSchemeService').get())).toBe('accessible');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-colors'))).toBe('accessible');
  });

  test('der Export trägt die Farben des gewählten Schemas', async ({ page }) => {
    await laden(page);
    await umschalten(page, 'accessible');
    await page.waitForTimeout(300);

    const svg = await page.evaluate(() => new Promise((resolve) => {
      window.fpbjs.saveSVG({}, (err, ergebnis) => resolve(err ? '' : ergebnis));
    }));

    expect(svg.toLowerCase()).toContain('rgb(77, 255, 151)');
    expect(svg.toLowerCase()).not.toContain('rgb(19, 174, 77)');
  });

  test('das Modell bleibt vom Schema unberührt', async ({ page }) => {
    const importer = await laden(page);
    const vorher = await importer.elements();

    await umschalten(page, 'accessible');
    await page.waitForTimeout(300);

    expect(await importer.elements()).toEqual(vorher);
  });

  test('Fehler und Warnung der Prüfung tragen verschiedene Zeichen', async ({ page }) => {
    // ein Operator außerhalb der Systemgrenze: Regel B2, ein Fehler
    const modell = clone();
    const prozess = modell.find((eintrag) => eintrag.process);
    const operator = prozess.elementVisualInformation.find((v) => v.type === 'fpb:ProcessOperator');
    operator.x += 900;

    await page.setViewportSize({ width: 1600, height: 1000 });
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);
    await page.waitForTimeout(600);

    const marker = page.locator('.fpb-validation-marker.fpb-validation-error');
    await expect(marker.first()).toHaveText('✕');

    await page.evaluate(() => window.fpbjs.get('fpbValidation').openPanel());
    await expect(page.locator('.fpb-validation-item[data-rule="B2"] .fpb-validation-item-head'))
      .toContainText('Error');
  });

});
