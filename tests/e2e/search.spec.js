// tests/e2e/search.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für die Suche über alle Ebenen (Feature 024 C).
 *
 * Fixture: Vorwärmen gibt es nur in der Kind-Ebene von Erhitzen, Abwärme ist
 * Ausgang von Erhitzen und damit in beiden Ebenen vorhanden.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function vorbereiten(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

async function zeichenflaecheFokussieren(page) {
  await page.evaluate(() => window.fpbjs.get('canvas').focus());
}

const treffer = (page) => page.locator('.fpb-search .djs-search-result');

test.describe('Suche über alle Ebenen', () => {

  test('Strg+F findet ein Element der Kind-Ebene und springt dorthin', async ({ page }) => {
    const importer = await vorbereiten(page);
    const oben = await importer.rootProcessId();

    await zeichenflaecheFokussieren(page);
    await page.keyboard.press('Control+f');
    await expect(page.locator('.fpb-search.open input')).toBeFocused();
    await page.keyboard.type('vorw');

    await expect(treffer(page).first()).toContainText('Vorwärmen');
    await expect(treffer(page).first()).toContainText('Erhitzen');
    await page.keyboard.press('Enter');

    await expect(page.locator('.fpb-search.open')).toHaveCount(0);
    const zustand = await page.evaluate(() => ({
      ebene: window.fpbjs.get('canvas').getRootElement().id,
      ausgewaehlt: window.fpbjs.get('selection').get().map((e) => e.businessObject.name),
    }));
    expect(zustand.ebene).not.toBe(oben);
    expect(zustand.ausgewaehlt).toEqual(['Vorwärmen']);
  });

  test('ein Grenz-State erscheint einmal je Ebene, die aktuelle zuerst', async ({ page }) => {
    await vorbereiten(page);

    await page.click('#openSearchButton');
    await page.keyboard.type('Abwärme');

    await expect(treffer(page)).toHaveCount(2);
    const ebenen = await treffer(page).locator('.fpb-search-meta').allTextContents();
    expect(ebenen[0]).not.toContain('Erhitzen');
    expect(ebenen[1]).toContain('Erhitzen');
  });

  test('meldet fehlende Treffer und schließt mit Escape', async ({ page }) => {
    await vorbereiten(page);

    await page.click('#openSearchButton');
    await page.keyboard.type('gibt es nicht');
    await expect(treffer(page)).toHaveText(['No element found']);

    await page.keyboard.press('Escape');
    await expect(page.locator('.fpb-search.open')).toHaveCount(0);
  });

  test('Pfeiltasten wählen den Treffer, ein Klick springt ebenfalls', async ({ page }) => {
    await vorbereiten(page);

    await page.click('#openSearchButton');
    await page.keyboard.type('e');
    await page.keyboard.press('ArrowDown');
    await expect(treffer(page).nth(1)).toHaveClass(/djs-search-result-selected/);

    const name = (await treffer(page).nth(2).locator('.djs-search-result-primary').textContent()).trim();
    await treffer(page).nth(2).click();

    const ausgewaehlt = await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.businessObject.name));
    expect(ausgewaehlt).toEqual([name]);
  });

});
