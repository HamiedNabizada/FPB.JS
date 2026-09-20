// tests/e2e/accessibility.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für Feature 022 (Barrierefreiheit).
 *
 * Gemessen war vorher: sechs Knöpfe ohne zugänglichen Namen, die Zeichenfläche
 * ohne Rolle und Beschriftung, kein einziges Element mit einer Rolle, kein
 * `lang` am Dokument, und die Palette war mit der Tabulatortaste nicht
 * erreichbar. Diese Tests halten den behobenen Zustand fest.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

/** Knöpfe ohne Text, ohne aria-label und ohne title */
const knoepfeOhneNamen = (page) => page.evaluate(() => {
  return [...document.querySelectorAll('button')]
    .filter((b) => b.offsetParent !== null)
    .filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'))
    .map((b) => b.className + ' ' + b.innerHTML.slice(0, 60));
});

async function laden(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

test.describe('Barrierefreiheit', () => {

  test('das Dokument nennt seine Sprache', async ({ page }) => {
    await laden(page);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  });

  test('die Zeichenfläche hat Rolle und Beschriftung', async ({ page }) => {
    await laden(page);

    const flaeche = await page.evaluate(() => {
      const container = window.fpbjs.get('canvas').getContainer();
      return {
        rolle: container.getAttribute('role'),
        beschriftung: container.getAttribute('aria-label'),
        erreichbar: container.getAttribute('tabindex'),
      };
    });
    expect(flaeche.rolle).toBe('application');
    expect(flaeche.beschriftung).toContain('Process diagram');
    expect(flaeche.erreichbar).toBe('0');
  });

  test('die Elemente auf der Zeichenfläche tragen ihren Namen', async ({ page }) => {
    await laden(page);

    const beschriftet = await page.evaluate(() => [...document.querySelectorAll('.djs-element[data-element-id]')]
      .map((el) => el.querySelector('.djs-visual'))
      .filter(Boolean)
      .map((visual) => visual.getAttribute('aria-label'))
      .filter(Boolean));

    expect(beschriftet.length).toBeGreaterThan(5);
    expect(beschriftet).toContain('ProcessOperator: Erhitzen');
  });

  test('alle sichtbaren Knöpfe haben einen zugänglichen Namen', async ({ page }) => {
    await laden(page);
    expect(await knoepfeOhneNamen(page)).toEqual([]);

    // auch mit geöffneten Bereichen: Optionen, Prozessbaum, Eigenschaften
    await page.locator('.layerPanel > button').first().click();
    await page.locator('#openLayerButton').click();
    await page.locator('#openPropertiesPanelButton').click();
    await page.waitForTimeout(300);

    expect(await knoepfeOhneNamen(page)).toEqual([]);
  });

  test('die Palette ist mit der Tastatur erreichbar und auslösbar', async ({ page }) => {
    await laden(page);

    const erreichbar = await page.evaluate(() => [...document.querySelectorAll('.djs-palette .entry')]
      .every((entry) => entry.getAttribute('tabindex') === '0' && entry.getAttribute('role') === 'button'));
    expect(erreichbar).toBe(true);

    const handWerkzeug = page.locator('.djs-palette .entry[data-action="hand-tool"]');
    await handWerkzeug.focus();
    await page.keyboard.press('Enter');

    await expect(handWerkzeug).toHaveClass(/highlighted-entry/);
  });

  test('der Prozessbaum lässt sich mit der Tastatur bedienen', async ({ page }) => {
    const importer = await laden(page);
    const obersteEbene = await importer.rootProcessId();

    await page.locator('#openLayerButton').click();
    const knoten = page.locator('.arborist-node-content');
    await expect(knoten.first()).toBeVisible();

    // in die Kind-Ebene wechseln, ohne die Maus zu benutzen
    const kind = knoten.nth(1);
    await kind.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    expect(await importer.rootProcessId()).not.toBe(obersteEbene);
  });

});
