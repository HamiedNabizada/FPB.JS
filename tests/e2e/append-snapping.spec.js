// tests/e2e/append-snapping.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für Anhängen und Hilfslinien (Feature 024 F und G).
 *
 * Anhängen erzeugt ein verbundenes Element unterhalb, nach der Flussrichtung
 * von oben nach unten. Die Hilfslinien kommen aus dem Snapping von diagram-js.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function vorbereiten(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

async function contextPadOeffnen(page, name) {
  await page.evaluate((name) => {
    const element = window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.name === name && !e.waypoints && e.type !== 'label')[0];
    window.fpbjs.get('selection').select(element);
    window.fpbjs.get('contextPad').open(element);
  }, name);
}

const element = (page, name) => page.evaluate((name) => {
  const e = window.fpbjs.get('elementRegistry')
    .filter((x) => x.businessObject && x.businessObject.name === name && !x.waypoints && x.type !== 'label')[0];
  return e && { id: e.id, x: e.x, y: e.y, width: e.width, height: e.height };
}, name);

const auswahl = (page) => page.evaluate(() => {
  const e = window.fpbjs.get('selection').get()[0];
  return e && {
    typ: e.type, x: e.x, y: e.y, width: e.width, height: e.height,
    quelle: e.incoming.map((c) => ({ typ: c.type, von: c.source.businessObject.name })),
  };
});

test.describe('Anhängen', () => {

  test('an einen State hängt direkt ein Operator darunter, verbunden und benennbar', async ({ page }) => {
    await vorbereiten(page);
    const quelle = await element(page, 'Warmprodukt');

    await contextPadOeffnen(page, 'Warmprodukt');
    await page.click('.djs-context-pad [data-action="append"]');

    const neu = await auswahl(page);
    expect(neu.typ).toBe('fpb:ProcessOperator');
    expect(neu.quelle).toEqual([{ typ: 'fpb:Flow', von: 'Warmprodukt' }]);
    expect(neu.y).toBeGreaterThan(quelle.y + quelle.height);
    await expect(page.locator('.djs-direct-editing-parent')).toBeVisible();
  });

  test('an einen Operator fragt ein Menü nach dem State-Typ', async ({ page }) => {
    await vorbereiten(page);

    await contextPadOeffnen(page, 'Erhitzen');
    await page.click('.djs-context-pad [data-action="append"]');
    await expect(page.locator('.djs-popup .entry')).toHaveText(['Product', 'Energy', 'Information']);
    await page.click('.djs-popup .entry:has-text("Information")');

    const neu = await auswahl(page);
    expect(neu.typ).toBe('fpb:Information');
    // Erhitzen verzweigt parallel, der neue Ausgang gehört zur Verzweigung
    expect(neu.quelle).toEqual([{ typ: 'fpb:ParallelFlow', von: 'Erhitzen' }]);
  });

  test('weicht einem belegten Platz aus und bleibt in der Systemgrenze', async ({ page }) => {
    await vorbereiten(page);
    const warmprodukt = await element(page, 'Warmprodukt');

    // Erhitzen hat direkt unter sich schon Warmprodukt
    await contextPadOeffnen(page, 'Erhitzen');
    await page.click('.djs-context-pad [data-action="append"]');
    await page.click('.djs-popup .entry:has-text("Product")');

    const neu = await auswahl(page);
    const systemLimit = await page.evaluate(() => {
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      return { x: sl.x, y: sl.y, width: sl.width, height: sl.height };
    });
    const ueberlappt = neu.x < warmprodukt.x + warmprodukt.width && warmprodukt.x < neu.x + neu.width
      && neu.y < warmprodukt.y + warmprodukt.height && warmprodukt.y < neu.y + neu.height;
    expect(ueberlappt).toBe(false);
    expect(neu.x).toBeGreaterThanOrEqual(systemLimit.x);
    expect(neu.x + neu.width).toBeLessThanOrEqual(systemLimit.x + systemLimit.width);
  });

  test('ein einziges Rückgängig nimmt das Anhängen samt Platz schaffen zurück', async ({ page }) => {
    await vorbereiten(page);
    const vorher = await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const sl = registry.filter((e) => e.type === 'fpb:SystemLimit')[0];
      return { anzahl: registry.filter((e) => e.type !== 'label').length, slHoehe: sl.height };
    });

    // Gutprodukt liegt auf dem unteren Rand: die Systemgrenze muss wachsen
    await contextPadOeffnen(page, 'Gutprodukt');
    await page.click('.djs-context-pad [data-action="append"]');
    const gewachsen = await page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0].height);
    expect(gewachsen).toBeGreaterThan(vorher.slHoehe);

    await page.evaluate(() => {
      window.fpbjs.get('canvas').focus();
      window.fpbjs.get('commandStack').undo();
    });

    const nachher = await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const sl = registry.filter((e) => e.type === 'fpb:SystemLimit')[0];
      return { anzahl: registry.filter((e) => e.type !== 'label').length, slHoehe: sl.height };
    });
    expect(nachher).toEqual(vorher);
  });

});

test.describe('Hilfslinien', () => {

  test('ein gezogenes Element rastet an der Mitte eines anderen ein und zeigt die Linie', async ({ page }) => {
    await vorbereiten(page);
    const ziel = await element(page, 'Erhitzen');
    const gezogen = await element(page, 'Prüfen');

    const zielMitteX = ziel.x + ziel.width / 2;
    const punkte = await page.evaluate(({ zielId, quelleId }) => {
      const box = (id) => document.querySelector(`[data-element-id="${id}"]`).getBoundingClientRect();
      const zielBox = box(zielId);
      const quelleBox = box(quelleId);
      return {
        start: { x: quelleBox.x + quelleBox.width / 2, y: quelleBox.y + quelleBox.height / 2 },
        // 6 px neben der Mitte von Erhitzen, auf gleicher Höhe wie bisher
        ziel: { x: zielBox.x + zielBox.width / 2 + 6, y: quelleBox.y + quelleBox.height / 2 },
      };
    }, { zielId: ziel.id, quelleId: gezogen.id });

    await page.mouse.move(punkte.start.x, punkte.start.y);
    await page.mouse.down();
    await page.mouse.move(punkte.ziel.x, punkte.ziel.y, { steps: 12 });
    await expect(page.locator('.djs-snap-line')).not.toHaveCount(0);
    await page.mouse.up();

    const nachher = await element(page, 'Prüfen');
    expect(nachher.x + nachher.width / 2).toBe(zielMitteX);
    expect(nachher.y).toBe(gezogen.y);
  });

});
