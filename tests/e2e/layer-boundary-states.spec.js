// tests/e2e/layer-boundary-states.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für Szenario 3 der Layer-Konsistenz: eine neue Verbindung zu einem
 * bereits dekomponierten Operator legt den Grenz-State in der Ebene darunter an.
 *
 * Zwei alte Bugs hängen daran:
 * - B02: mehrere neue Grenz-States landeten aufeinander, weil die Position aus
 *   der Anzahl der States gerechnet wurde statt aus dem rechten Rand der schon
 *   vorhandenen.
 * - B03: ein namenloser State wurde ohne Hinweis mitgenommen. Die Modellprüfung
 *   nennt ihn heute unter Regel D4.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function laden(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

/** Legt `anzahl` States an und verbindet sie mit dem dekomponierten Operator */
const statesAnlegen = (page, anzahl, name) => page.evaluate(({ anzahl, name }) => {
  const registry = window.fpbjs.get('elementRegistry');
  const modeling = window.fpbjs.get('modeling');
  const factory = window.fpbjs.get('elementFactory');
  const operator = registry.filter((e) => e.type === 'fpb:ProcessOperator' && e.businessObject.decomposedView)[0];
  const systemLimit = registry.filter((e) => e.type === 'fpb:SystemLimit')[0];
  const angelegt = [];

  for (let i = 0; i < anzahl; i++) {
    const state = factory.createShape({ type: 'fpb:Product', id: 'neu' + i });
    modeling.createShape(state, { x: systemLimit.x + 80 + i * 120, y: systemLimit.y + 60 }, systemLimit);
    if (name) {
      modeling.updateLabel(state, name + (i + 1));
    }
    modeling.connect(state, operator, { type: 'fpb:Flow' });
    angelegt.push(state.id);
  }

  const kind = operator.businessObject.decomposedView;
  const kindGrenze = kind.businessObject.elementsContainer
    .filter((e) => e.businessObject.$type === 'fpb:SystemLimit')[0];
  return kindGrenze.businessObject.elementsContainer
    .filter((e) => angelegt.includes(e.id))
    .map((e) => ({ id: e.id, x: e.x, y: e.y, name: e.businessObject.name }));
}, { anzahl, name });

test.describe('Szenario 3: Grenz-States in der Kind-Ebene', () => {

  test('mehrere neue Grenz-States liegen nebeneinander, nicht übereinander', async ({ page }) => {
    await laden(page);

    const grenzStates = await statesAnlegen(page, 3, 'Zusatz');

    expect(grenzStates).toHaveLength(3);
    const positionen = grenzStates.map((s) => `${s.x},${s.y}`);
    expect(new Set(positionen).size).toBe(3);
    // auf derselben Grenze, von links nach rechts, ohne Überschneidung
    expect(new Set(grenzStates.map((s) => s.y)).size).toBe(1);
    const x = grenzStates.map((s) => s.x).sort((a, b) => a - b);
    expect(x[1] - x[0]).toBeGreaterThanOrEqual(50);
    expect(x[2] - x[1]).toBeGreaterThanOrEqual(50);
  });

  test('ein namenloser State wandert mit und wird von der Prüfung genannt', async ({ page }) => {
    await laden(page);

    const grenzStates = await statesAnlegen(page, 1, null);
    expect(grenzStates).toHaveLength(1);
    expect(grenzStates[0].name).toBeFalsy();

    // Regel D4: die Prüfung weist auf den fehlenden Namen hin, in beiden Ebenen
    const befunde = await page.evaluate(() => window.fpbjs.get('fpbValidation').run()
      .filter((issue) => issue.rule === 'D4')
      .map((issue) => issue.elementId));
    expect(befunde.filter((id) => id === 'neu0').length).toBe(2);
  });

});

/**
 * Szenario 6: ein State aus dem Inneren wird auf die Grenze geschoben und wird
 * damit zum Ein- oder Ausgang des Operators eine Ebene höher. Danach fragt der
 * Editor nach.
 *
 * Hier abgesichert, weil BoundaryStateResizeBehavior seit 2026-09-20 genau
 * diese Rückfrage unterdrückt, wenn ein Grenz-State nur seiner Kante folgt.
 * Die echte Frage muss bleiben.
 */
test.describe('Szenario 6: State auf die Grenze schieben', () => {

  test('das Verschieben auf die Grenze fragt nach', async ({ page }) => {
    const importer = await laden(page);
    await importer.switchToChildLayer();
    await page.evaluate(() => {
      window.__nachfragen = [];
      window.fpbjs.get('eventBus').on('confirmation.required', (e) => { window.__nachfragen.push(e.title); });
    });

    const verschoben = await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const systemLimit = registry.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const unterkante = systemLimit.y + systemLimit.height;
      const innen = registry
        .filter((e) => ['fpb:Product', 'fpb:Energy', 'fpb:Information'].includes(e.type))
        .filter((s) => Math.abs(s.y + s.height / 2 - unterkante) > 60 && Math.abs(s.y + s.height / 2 - systemLimit.y) > 60)[0];
      if (!innen) return null;
      window.fpbjs.get('modeling').moveElements([innen], { x: 0, y: unterkante - (innen.y + innen.height / 2) });
      return innen.id;
    });

    expect(verschoben).not.toBeNull();
    expect(await page.evaluate(() => window.__nachfragen)).toEqual(['Confirm boundary placement']);
  });

});
