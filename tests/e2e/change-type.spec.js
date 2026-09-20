// tests/e2e/change-type.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { exportiere, nachIds } from './helpers/modelExport';

/**
 * E2E-Tests für den Typwechsel über das Context-Pad (Feature 024 D).
 *
 * Vorher ging ein Typwechsel nur durch Löschen und neu Anlegen, mit neuen IDs
 * und ohne die Verbindungen. Fixture: Abwärme (Energy) ist Ausgang von Erhitzen
 * und Grenz-State in dessen Kind-Ebene; die Ausgänge von Erhitzen bilden eine
 * Parallele Verzweigung.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function vorbereiten(page) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return { importer, fehler };
}

async function menueOeffnen(page, auswahl) {
  await page.evaluate((auswahl) => {
    const registry = window.fpbjs.get('elementRegistry');
    const element = auswahl.name
      ? registry.filter((e) => e.businessObject && e.businessObject.name === auswahl.name && !e.waypoints && e.type !== 'label')[0]
      : registry.filter((e) => e.waypoints && e.id.startsWith(auswahl.id))[0];
    window.fpbjs.get('selection').select(element);
    window.fpbjs.get('contextPad').open(element);
  }, auswahl);
  await page.click('.djs-context-pad [data-action="change_type"]');
  await expect(page.locator('.djs-popup')).toBeVisible();
}

const prozesseOhneProjekt = (eintraege) => eintraege.filter((p) => p.process);
const alle = (eintraege) => prozesseOhneProjekt(eintraege).flatMap((p) => p.elementDataInformation);

test.describe('Typwechsel', () => {

  test('ein State wechselt den Typ in allen Ebenen, ID und Verbindungen bleiben', async ({ page }) => {
    const { fehler } = await vorbereiten(page);
    const vorher = await exportiere(page);
    const id = alle(vorher).find((e) => e.name === 'Abwärme').id;

    await menueOeffnen(page, { name: 'Abwärme' });
    await page.click('.djs-popup .entry:has-text("Product")');

    const nachher = await exportiere(page);
    const inEbenen = (eintraege) => prozesseOhneProjekt(eintraege).map((p) => p.elementDataInformation.find((e) => e.id === id)).filter(Boolean);
    expect(inEbenen(nachher).map((e) => e.$type)).toEqual(['fpb:Product', 'fpb:Product']);
    expect(prozesseOhneProjekt(nachher).flatMap((p) => p.elementVisualInformation.filter((v) => v.id === id).map((v) => v.type)))
      .toEqual(['fpb:Product', 'fpb:Product']);
    // alles andere unverändert, insbesondere die Flows von und zu Abwärme
    const ohneTyp = (eintraege) => nachIds(prozesseOhneProjekt(eintraege).map((p) => ({
      ...p,
      elementDataInformation: p.elementDataInformation.map((e) => (e.id === id ? { ...e, $type: 'x' } : e)),
      elementVisualInformation: p.elementVisualInformation.map((v) => (v.id === id ? { ...v, type: 'x' } : v)),
    })));
    expect(ohneTyp(nachher)).toEqual(ohneTyp(vorher));
    expect(fehler).toEqual([]);
  });

  test('eine Verzweigung wechselt als Ganzes zwischen Parallel und Alternative', async ({ page }) => {
    const { fehler } = await vorbereiten(page);
    const vorher = await exportiere(page);
    const gruppe = alle(vorher).filter((e) => e.$type === 'fpb:ParallelFlow' && (e.inTandemWith || []).length
      && alle(vorher).find((s) => s.id === e.sourceRef && s.name === 'Erhitzen'));
    expect(gruppe.length).toBe(2);

    await menueOeffnen(page, { id: gruppe[0].id.slice(0, 8) });
    await page.click('.djs-popup .entry:has-text("Alternative")');

    const nachher = await exportiere(page);
    gruppe.forEach((flow) => {
      const neu = alle(nachher).find((e) => e.id === flow.id);
      expect(neu.$type).toBe('fpb:AlternativeFlow');
      expect(neu.inTandemWith.slice().sort()).toEqual(flow.inTandemWith.slice().sort());
      expect([neu.sourceRef, neu.targetRef]).toEqual([flow.sourceRef, flow.targetRef]);
    });
    expect(fehler).toEqual([]);
  });

  test('die Verzweigung wird nach dem Wechsel passend zum Typ gezeichnet', async ({ page }) => {
    // Der Unterschied steckt im Layouter: eine alternative Verzweigung läuft
    // gerade zum Ziel, eine parallele knickt auf den gemeinsamen Balken.
    const { fehler } = await vorbereiten(page);
    const stuetzpunkte = () => page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((e) => e.waypoints && e.source && e.source.businessObject.name === 'Erhitzen' && e.type !== 'fpb:Usage')
      .map((e) => ({ typ: e.type, punkte: e.waypoints.length, knickY: e.waypoints.length > 2 ? e.waypoints[1].y : null })));

    const vorher = await stuetzpunkte();
    expect(vorher.every((c) => c.typ === 'fpb:ParallelFlow' && c.punkte > 2)).toBe(true);

    await menueOeffnen(page, { id: (await page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((e) => e.waypoints && e.source && e.source.businessObject.name === 'Erhitzen' && e.type !== 'fpb:Usage')[0].id)).slice(0, 8) });
    await page.click('.djs-popup .entry:has-text("Alternative")');

    const alternativ = await stuetzpunkte();
    expect(alternativ.every((c) => c.typ === 'fpb:AlternativeFlow' && c.punkte === 2)).toBe(true);

    await menueOeffnen(page, { id: alternativ.length ? (await page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((e) => e.waypoints && e.source && e.source.businessObject.name === 'Erhitzen' && e.type !== 'fpb:Usage')[0].id)).slice(0, 8) : '' });
    await page.click('.djs-popup .entry:has-text("Parallel")');

    const wiederParallel = await stuetzpunkte();
    expect(wiederParallel.every((c) => c.typ === 'fpb:ParallelFlow' && c.punkte > 2)).toBe(true);
    // beide Linien knicken auf denselben Balken
    expect(new Set(wiederParallel.map((c) => c.knickY)).size).toBe(1);
    expect(fehler).toEqual([]);
  });

  test('Rückgängig stellt den vorherigen Typ in allen Ebenen wieder her', async ({ page }) => {
    await vorbereiten(page);
    const vorher = await exportiere(page);

    await menueOeffnen(page, { name: 'Abwärme' });
    await page.click('.djs-popup .entry:has-text("Information")');
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());

    expect(nachIds(await exportiere(page))).toEqual(nachIds(vorher));
  });

  test('die gewechselte Datei lässt sich wieder importieren', async ({ page }) => {
    const { importer } = await vorbereiten(page);
    await menueOeffnen(page, { name: 'Abwärme' });
    await page.click('.djs-popup .entry:has-text("Product")');
    const gewechselt = await exportiere(page);

    await importer.import(gewechselt);

    expect(nachIds(await exportiere(page))).toEqual(nachIds(gewechselt));
    expect(await importer.unresolvedReferences()).toEqual([]);
  });

  test('beim Zeichnen einer Verzweigung behält der vorhandene Flow seine ID', async ({ page }) => {
    // ReplaceConnectionBehavior gleicht die Typen an einer Quelle an. Früher per
    // Löschen und neu Anlegen, die ID änderte sich dabei von selbst (Bug B07).
    const { fehler } = await vorbereiten(page);
    const flows = () => page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((e) => e.waypoints && e.source && e.source.businessObject.name === 'Warmprodukt' && e.type !== 'fpb:Usage')
      .map((e) => ({ id: e.id, typ: e.type, tandem: (e.businessObject.inTandemWith || []).map((p) => p.id || p) })));

    const vorher = await flows();
    expect(vorher).toHaveLength(1);
    expect(vorher[0].typ).toBe('fpb:Flow');

    await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const quelle = registry.filter((e) => e.businessObject && e.businessObject.name === 'Warmprodukt' && !e.waypoints)[0];
      const ziel = registry.filter((e) => e.type === 'fpb:ProcessOperator'
        && !(e.incoming || []).some((c) => c.source === quelle))[0];
      window.fpbjs.get('modeling').connect(quelle, ziel, { type: 'fpb:AlternativeFlow' });
    });

    const gezeichnet = await flows();
    expect(gezeichnet).toHaveLength(2);
    const alt = gezeichnet.find((f) => f.id === vorher[0].id);
    expect(alt.typ).toBe('fpb:AlternativeFlow');
    expect(alt.tandem).toEqual([gezeichnet.find((f) => f.id !== alt.id).id]);

    // wieder löschen: der übrige Flow behält ebenfalls seine ID
    await page.evaluate((id) => {
      const registry = window.fpbjs.get('elementRegistry');
      window.fpbjs.get('modeling').removeConnection(registry.get(id));
    }, gezeichnet.find((f) => f.id !== vorher[0].id).id);

    const zurueck = await flows();
    expect(zurueck).toEqual([{ id: vorher[0].id, typ: 'fpb:Flow', tandem: [] }]);
    expect(fehler).toEqual([]);
  });

  test('das Menü zeigt den aktuellen Typ gesperrt, Operatoren haben keinen Eintrag', async ({ page }) => {
    await vorbereiten(page);

    await menueOeffnen(page, { name: 'Abwärme' });
    await expect(page.locator('.djs-popup .entry.disabled')).toHaveText(['Energy']);

    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('contextPad').open(operator);
    });
    await expect(page.locator('.djs-context-pad [data-action="change_type"]')).toHaveCount(0);
  });

});
