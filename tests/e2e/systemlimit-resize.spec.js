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

/**
 * Ziehen an der Kante selbst, mit der Maus, nicht über die API.
 *
 * Drei alte Fehler steckten hier zusammen:
 * - der Griff für die Kante war 20 Pixel groß und saß nur in der Mitte; überall
 *   sonst erwischte der Zeiger den Grenz-State, der auf der Linie sitzt, und zog
 *   ihn herunter (genau das "Runterfallen"),
 * - das Mitziehen der Grenz-States löste die Rückfrage "Confirm boundary
 *   placement" aus, obwohl sich nichts änderte,
 * - die Systemgrenze ließ sich nicht verkleinern und wuchs bei jedem Ziehen von
 *   selbst, weil die über die Linie ragenden Hälften der Grenz-States als
 *   Mindestgröße galten.
 */
test.describe('An der Kante ziehen', () => {

  /** Punkt auf der Kantenlinie in Bildschirmkoordinaten, Anteil der Breite */
  const punktAufUnterkante = (page, anteil) => page.evaluate((anteil) => {
    const systemLimit = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
    window.fpbjs.get('selection').select(systemLimit);
    const canvas = window.fpbjs.get('canvas');
    const box = canvas.viewbox();
    const rect = canvas.getContainer().getBoundingClientRect();
    return {
      x: rect.left + (systemLimit.x + systemLimit.width * anteil - box.x) * box.scale,
      y: rect.top + (systemLimit.y + systemLimit.height - box.y) * box.scale,
    };
  }, anteil);

  async function ziehen(page, anteil, dy) {
    const punkt = await punktAufUnterkante(page, anteil);
    await page.mouse.move(punkt.x, punkt.y);
    await page.mouse.down();
    await page.mouse.move(punkt.x, punkt.y + dy / 2, { steps: 8 });
    await page.mouse.move(punkt.x, punkt.y + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  }

  const groesse = (page) => page.evaluate(() => {
    const systemLimit = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
    return { y: Math.round(systemLimit.y), hoehe: Math.round(systemLimit.height) };
  });

  test('die ganze Kante fasst den Griff, nicht nur ihre Mitte', async ({ page }) => {
    await inDerKindEbene(page);
    await punktAufUnterkante(page, 0.5);

    const getroffen = await page.evaluate(() => {
      const systemLimit = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      const canvas = window.fpbjs.get('canvas');
      const box = canvas.viewbox();
      const rect = canvas.getContainer().getBoundingClientRect();
      const y = rect.top + (systemLimit.y + systemLimit.height - box.y) * box.scale;
      return [0.2, 0.4, 0.6, 0.8].map((anteil) => {
        const x = rect.left + (systemLimit.x + systemLimit.width * anteil - box.x) * box.scale;
        const el = document.elementFromPoint(x, y);
        return el && el.getAttribute('class');
      });
    });

    expect(getroffen).toEqual(['djs-resizer-hit', 'djs-resizer-hit', 'djs-resizer-hit', 'djs-resizer-hit']);
  });

  test('Ziehen an der Kante vergrößert und verkleinert, ohne States abzuwerfen', async ({ page }) => {
    await inDerKindEbene(page);
    const vorher = await groesse(page);

    await ziehen(page, 0.7, 120);
    const groesser = await groesse(page);
    expect(groesser.hoehe).toBeGreaterThan(vorher.hoehe + 80);
    expect(groesser.y).toBe(vorher.y);

    await ziehen(page, 0.7, -90);
    const kleiner = await groesse(page);
    expect(kleiner.hoehe).toBeLessThan(groesser.hoehe - 50);

    // alle Grenz-States sitzen weiter auf ihrer Kante
    const nachher = await lage(page);
    expect(nachher.filter((s) => s.anOberkante || s.anUnterkante).length).toBeGreaterThan(3);
    expect(await befunde(page, 'B6')).toEqual([]);
  });

  test('das Ziehen fragt nicht nach einer Grenz-Platzierung', async ({ page }) => {
    await inDerKindEbene(page);
    await page.evaluate(() => {
      window.__nachfragen = [];
      window.fpbjs.get('eventBus').on('confirmation.required', (e) => { window.__nachfragen.push(e.title); });
    });

    await ziehen(page, 0.7, 120);

    expect(await page.evaluate(() => window.__nachfragen)).toEqual([]);
    await expect(page.locator('.modal.show')).toHaveCount(0);
  });

});
