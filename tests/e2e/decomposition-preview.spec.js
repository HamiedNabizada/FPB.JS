// tests/e2e/decomposition-preview.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für die Vorschau der Dekomposition (Feature 025).
 *
 * Beim Überfahren eines dekomponierten Operators erscheint eine Miniatur der
 * Ebene darunter, gezeichnet aus deren Geometrie. Ein Klick wechselt dorthin.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const vorschau = (page) => page.locator('.fpb-decomposition-preview');

async function vorbereiten(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

async function ueberfahren(page, name) {
  const punkt = await page.evaluate((name) => {
    const element = window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.name === name && !e.waypoints && e.type !== 'label')[0];
    const box = document.querySelector(`[data-element-id="${element.id}"]`).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, name);
  await page.mouse.move(punkt.x, punkt.y);
  return punkt;
}

test.describe('Vorschau der Dekomposition', () => {

  test('zeigt beim Überfahren eine Miniatur der Ebene darunter', async ({ page }) => {
    await vorbereiten(page);

    await ueberfahren(page, 'Erhitzen');

    await expect(vorschau(page)).toBeVisible({ timeout: 2000 });
    await expect(vorschau(page).locator('.fpb-decomposition-preview-title')).toHaveText('Erhitzen: 8 elements');
    // Systemgrenze, Elemente und Verbindungen der Kind-Ebene
    const gezeichnet = await page.evaluate(() => {
      const svg = document.querySelector('.fpb-decomposition-preview svg');
      return {
        formen: svg.querySelectorAll('rect, circle, polygon').length,
        linien: svg.querySelectorAll('polyline').length,
        groesse: [svg.getAttribute('width'), svg.getAttribute('height')],
      };
    });
    expect(gezeichnet.formen).toBe(9);
    expect(gezeichnet.linien).toBeGreaterThan(0);
    expect(gezeichnet.groesse).toEqual(['240', '150']);
  });

  test('ein Klick auf die Vorschau wechselt in die Ebene', async ({ page }) => {
    const importer = await vorbereiten(page);
    const oben = await importer.rootProcessId();

    await ueberfahren(page, 'Erhitzen');
    await expect(vorschau(page)).toBeVisible({ timeout: 2000 });
    await vorschau(page).click();

    await expect(vorschau(page)).toHaveCount(0);
    const ebene = await page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);
    expect(ebene).not.toBe(oben);
  });

  test('erscheint nicht bei einem Operator ohne Dekomposition', async ({ page }) => {
    await vorbereiten(page);

    await ueberfahren(page, 'Prüfen');
    await page.waitForTimeout(900);

    await expect(vorschau(page)).toHaveCount(0);
  });

  test('verschwindet beim Verlassen und stört das Ziehen nicht', async ({ page }) => {
    await vorbereiten(page);
    const punkt = await ueberfahren(page, 'Erhitzen');
    await expect(vorschau(page)).toBeVisible({ timeout: 2000 });

    // Ziehen beginnt: die Vorschau muss weg sein
    await page.mouse.down();
    await page.mouse.move(punkt.x + 60, punkt.y + 10, { steps: 8 });
    await expect(vorschau(page)).toHaveCount(0);
    await page.mouse.up();

    const verschoben = await page.evaluate(() => {
      const element = window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && !e.waypoints && e.type !== 'label')[0];
      return element.x;
    });
    expect(verschoben).toBeGreaterThan(0);
  });

});
