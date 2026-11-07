// tests/e2e/decomposition-preview.spec.js
import { test, expect } from './support/test';
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


  test('geht während einer Ziehbewegung nicht auf, auch nicht über dem zerlegten Operator', async ({ page }) => {
    // WebKit 2026-11-07: beim Ziehen eines Flussendes ging die Vorschau über
    // dem zerlegten Operator auf und lag über dem Ziel, das Loslassen traf sie
    await vorbereiten(page);
    const punkte = await page.evaluate(() => {
      const fpb = window.fpbjs;
      const reg = fpb.get('elementRegistry');
      const canvas = fpb.get('canvas');
      const vb = canvas.viewbox();
      const rect = canvas.getContainer().getBoundingClientRect();
      const screen = (p) => ({ x: rect.left + (p.x - vb.x) * vb.scale, y: rect.top + (p.y - vb.y) * vb.scale });
      const name = (n) => reg.filter((e) => e.businessObject && e.businessObject.name === n && e.type !== 'label')[0];
      const flow = name('Warmprodukt').outgoing[0]; // Warmprodukt -> Prüfen
      const erhitzen = name('Erhitzen');
      const index = flow.waypoints.length - 1;
      const start = screen(flow.waypoints[index]);
      fpb.get('bendpointMove').start(new MouseEvent('mousedown', { clientX: start.x, clientY: start.y, button: 0 }), flow, index);
      return { start, ueber: screen({ x: erhitzen.x + erhitzen.width / 2, y: erhitzen.y + erhitzen.height / 2 }) };
    });
    await page.mouse.move(punkte.start.x, punkte.start.y);
    await page.mouse.move(punkte.ueber.x, punkte.ueber.y, { steps: 6 });
    await page.waitForTimeout(900);
    await expect(vorschau(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  });
});
