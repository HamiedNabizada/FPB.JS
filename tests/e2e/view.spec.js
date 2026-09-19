// tests/e2e/view.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für die Ansicht: eingepasste Ansicht nach dem Import und Minimap.
 *
 * Vorher belegt: nach dem Import stand die Ansicht am Ursprung mit Zoom 1, größere
 * Modelle lagen teils außerhalb des Fensters. In der Minimap waren die
 * Verbindungen schwarz gefüllte Flächen, weil fill:none nur aus diagram-js.css kam.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

test.describe('Ansicht', () => {

  test('zeigt nach dem Import das ganze Modell', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    const ausserhalb = await page.evaluate(() => {
      const flaeche = document.querySelector('#modeler-container .djs-container').getBoundingClientRect();
      return window.fpbjs.get('elementRegistry')
        .filter((e) => !e.waypoints && e.type !== 'label' && e.parent)
        .map((e) => ({ id: e.id, box: document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect() }))
        .filter(({ box }) => box.left < flaeche.left - 1 || box.top < flaeche.top - 1
          || box.right > flaeche.right + 1 || box.bottom > flaeche.bottom + 1)
        .map(({ id }) => id);
    });
    expect(ausserhalb).toEqual([]);
  });

  test('Minimap lässt sich öffnen und zeichnet Verbindungen ungefüllt', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    await page.click('.djs-minimap .toggle');
    await expect(page.locator('.djs-minimap.open .map')).toBeVisible();

    const fuellungen = await page.evaluate(() => [...document.querySelectorAll('.djs-minimap .map path[style*="marker-end"]')]
      .map((p) => getComputedStyle(p).fill));
    expect(fuellungen.length).toBeGreaterThan(0);
    expect([...new Set(fuellungen)]).toEqual(['none']);
  });

});
