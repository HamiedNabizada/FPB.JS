// tests/e2e/systemlimit-resize.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests zum Vergrößern der Systemgrenze (Bug B01, Teil Grenz-States).
 *
 * Die Grenz-States stehen für Ein- und Ausgänge des dekomponierten Operators
 * eine Ebene höher und gehören auf die Grenze. Vor der Behebung blieben sie
 * beim Ziehen der unteren Kante stehen und hingen danach im Inneren, die
 * Modellprüfung meldete Regel B6.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function inDerKindEbene(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  await importer.switchToChildLayer();
  return importer;
}

/** Lage der States, bezogen auf die Kanten der Systemgrenze */
const lage = (page) => page.evaluate(() => {
  const registry = window.fpbjs.get('elementRegistry');
  const systemLimit = registry.filter((e) => e.type === 'fpb:SystemLimit')[0];
  return registry
    .filter((e) => ['fpb:Product', 'fpb:Energy', 'fpb:Information'].includes(e.type))
    .map((state) => ({
      id: state.id,
      name: state.businessObject.name,
      anOberkante: Math.abs(state.y + state.height / 2 - systemLimit.y) < 2,
      anUnterkante: Math.abs(state.y + state.height / 2 - (systemLimit.y + systemLimit.height)) < 2,
      x: state.x,
    }));
});

const vergroessern = (page, dx, dy) => page.evaluate(({ dx, dy }) => {
  const systemLimit = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
  window.fpbjs.get('modeling').resizeShape(systemLimit, {
    x: systemLimit.x, y: systemLimit.y,
    width: systemLimit.width + dx, height: systemLimit.height + dy,
  });
}, { dx, dy });

const befunde = (page, regel) => page.evaluate((regel) => window.fpbjs.get('fpbValidation').run()
  .filter((issue) => issue.rule === regel).map((issue) => issue.elementId), regel);

test.describe('Systemgrenze vergrößern', () => {

  test('die Grenz-States bleiben auf der Grenze', async ({ page }) => {
    await inDerKindEbene(page);
    const vorher = await lage(page);
    const anKanten = vorher.filter((s) => s.anOberkante || s.anUnterkante);
    expect(anKanten.length).toBeGreaterThan(1);
    expect(await befunde(page, 'B6')).toEqual([]);

    await vergroessern(page, 300, 200);

    const nachher = await lage(page);
    anKanten.forEach((s) => {
      const jetzt = nachher.find((n) => n.id === s.id);
      expect({ id: jetzt.id, oben: jetzt.anOberkante, unten: jetzt.anUnterkante })
        .toEqual({ id: s.id, oben: s.anOberkante, unten: s.anUnterkante });
    });
    expect(await befunde(page, 'B6')).toEqual([]);
  });

  test('die States im Inneren bleiben, wo sie sind', async ({ page }) => {
    await inDerKindEbene(page);
    const innen = (await lage(page)).filter((s) => !s.anOberkante && !s.anUnterkante);

    await vergroessern(page, 300, 200);

    const nachher = await lage(page);
    innen.forEach((s) => {
      expect(nachher.find((n) => n.id === s.id).x).toBe(s.x);
    });
  });

  test('Rückgängig nimmt Vergrößerung und verschobene Grenz-States zusammen zurück', async ({ page }) => {
    await inDerKindEbene(page);
    const vorher = await lage(page);

    await vergroessern(page, 300, 200);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());

    expect(await lage(page)).toEqual(vorher);
  });

});
