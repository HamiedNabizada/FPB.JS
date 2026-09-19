// tests/e2e/tandem-consistency.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für inTandemWith und Rückgängig bei Verbindungen (Bug B07).
 *
 * Das Fixture hat in der Eltern-Ebene die Parallele Verzweigung
 * Erhitzen → Abwärme / Warmprodukt. Erhitzen ist dekomponiert, in der Kind-Ebene
 * münden zwei Parallele Verzweigungen (von Vorwärmen und Fertigheizen) in den
 * Grenz-State Abwärme.
 *
 * Vorher belegt: Löschen der Verbindung Erhitzen → Abwärme in der Eltern-Ebene
 * entfernte Abwärme samt Flows in der Kind-Ebene, die Partner behielten die IDs
 * der entfernten Flows. Anlegen und Rückgängig ließ den Flow im Export zurück,
 * Löschen und Rückgängig verlor ihn dort.
 */

const ERHITZEN_ZU_ABWAERME = 'af7572cb';
const ERHITZEN_ZU_WARMPRODUKT = '5ebecf9d';
const KIND_PARTNER = ['97fa2d66', 'b299ba2b'];
const KIND_ENTFERNT = ['0f73cdc1', '1849fba8'];

const clone = () => JSON.parse(JSON.stringify(basis));

/** Export wie DownloadModal: Referenzen als IDs, alle Layer */
async function exportiere(page) {
  return page.evaluate(() => {
    window.fpbjs.get('eventBus').fire('dataStore.updateAll', {});
    const idOf = (x) => (x && typeof x === 'object' ? x.id : x);
    const liste = ['elementsContainer', 'inTandemWith', 'incoming', 'outgoing', 'isAssignedTo', 'consistsOfStates', 'consistsOfProcessOperator', 'consistsOfProcesses'];
    const einzeln = ['sourceRef', 'targetRef', 'decomposedView', 'parent', 'consistsOfSystemLimit', 'isDecomposedProcessOperator', 'entryPoint'];
    const text = JSON.stringify(window.fpbjs.getProcesses(), (key, val) => {
      if (liste.includes(key)) return Array.isArray(val) ? val.map(idOf) : idOf(val);
      if (einzeln.includes(key)) return idOf(val);
      if (['di', 'children', 'labels', 'ProjectAssignment', 'TemporaryFlowHint'].includes(key)) return undefined;
      return val;
    });
    return JSON.parse(text).filter((eintrag) => eintrag.process);
  });
}

const alleDaten = (prozesse) => prozesse.flatMap((p) => p.elementDataInformation);
const finde = (prozesse, prefix) => alleDaten(prozesse).find((e) => e.id.startsWith(prefix));

/** Einträge in inTandemWith, deren ID es im Export nicht gibt */
function veraltet(prozesse) {
  const ids = new Set(alleDaten(prozesse).map((e) => e.id));
  return alleDaten(prozesse).flatMap((e) => (e.inTandemWith || [])
    .filter((t) => !ids.has(t))
    .map((t) => `${e.id.slice(0, 8)} -> ${t.slice(0, 8)}`));
}

/** Aufruf im Browser mit einer Verbindung, gesucht über den ID-Anfang */
async function mitVerbindung(page, prefix, aktion) {
  return page.evaluate(({ prefix, aktion }) => {
    const verbindung = window.fpbjs.get('elementRegistry').filter((e) => e.waypoints && e.id.startsWith(prefix))[0];
    const modeling = window.fpbjs.get('modeling');
    if (aktion === 'loeschen') {
      modeling.removeConnection(verbindung);
      return null;
    }
    // dritten ParallelFlow von der gleichen Quelle zu einem freien State ziehen
    const belegt = new Set(verbindung.source.outgoing.map((f) => f.target.id));
    const ziel = window.fpbjs.get('elementRegistry').filter((e) => !e.waypoints && e.type === 'fpb:Product' && !belegt.has(e.id) && !(e.incoming || []).length)[0];
    return modeling.connect(verbindung.source, ziel, { type: verbindung.type }).id;
  }, { prefix, aktion });
}

const rueckgaengig = (page) => page.evaluate(() => window.fpbjs.get('commandStack').undo());
const wiederholen = (page) => page.evaluate(() => window.fpbjs.get('commandStack').redo());

test.describe('Tandem - Löschen in der Eltern-Ebene', () => {

  test('lässt in der Kind-Ebene keine veralteten IDs zurück', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    await mitVerbindung(page, ERHITZEN_ZU_ABWAERME, 'loeschen');
    const prozesse = await exportiere(page);

    expect(veraltet(prozesse)).toEqual([]);
    KIND_ENTFERNT.forEach((id) => expect(finde(prozesse, id)).toBeUndefined());
  });

  test('macht einen allein gebliebenen Partner wieder zum normalen Flow', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    await mitVerbindung(page, ERHITZEN_ZU_ABWAERME, 'loeschen');
    const prozesse = await exportiere(page);

    KIND_PARTNER.forEach((id) => {
      const partner = finde(prozesse, id);
      expect(partner.$type).toBe('fpb:Flow');
      expect(partner.inTandemWith || []).toEqual([]);
    });

    // In der Kind-Ebene als normaler Flow gezeichnet, an Quelle und Ziel angebunden
    await importer.switchToChildLayer();
    const gezeichnet = await page.evaluate((ids) => ids.map((prefix) => {
      const c = window.fpbjs.get('elementRegistry').filter((e) => e.waypoints && e.id.startsWith(prefix))[0];
      return c && { typ: c.type, quelle: !!c.source && c.source.outgoing.includes(c), ziel: !!c.target && c.target.incoming.includes(c) };
    }), KIND_PARTNER);
    expect(gezeichnet).toEqual(KIND_PARTNER.map(() => ({ typ: 'fpb:Flow', quelle: true, ziel: true })));
  });

  test('Rückgängig stellt Kind-Ebene und Tandem wieder her, Wiederholen löscht erneut', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());
    const vorher = await exportiere(page);

    await mitVerbindung(page, ERHITZEN_ZU_ABWAERME, 'loeschen');
    await rueckgaengig(page);
    const nachUndo = await exportiere(page);

    const tandemVon = (prozesse, id) => [finde(prozesse, id).$type, (finde(prozesse, id).inTandemWith || []).slice().sort()];
    [...KIND_PARTNER, ...KIND_ENTFERNT, ERHITZEN_ZU_ABWAERME, ERHITZEN_ZU_WARMPRODUKT].forEach((id) => {
      expect(tandemVon(nachUndo, id)).toEqual(tandemVon(vorher, id));
    });
    expect(alleDaten(nachUndo)).toHaveLength(alleDaten(vorher).length);

    await wiederholen(page);
    const nachRedo = await exportiere(page);
    expect(veraltet(nachRedo)).toEqual([]);
    KIND_PARTNER.forEach((id) => expect(finde(nachRedo, id).$type).toBe('fpb:Flow'));
  });

});

test.describe('Tandem - Rückgängig bei Verbindungen', () => {

  test('Anlegen und Rückgängig hinterlässt nichts im Export', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());
    const vorher = await exportiere(page);

    const neu = await mitVerbindung(page, ERHITZEN_ZU_ABWAERME, 'anlegen');
    expect(finde(await exportiere(page), neu)).toBeDefined();

    await rueckgaengig(page);
    const nachher = await exportiere(page);

    expect(JSON.stringify(nachher)).not.toContain(neu);
    expect(alleDaten(nachher)).toHaveLength(alleDaten(vorher).length);
    expect(finde(nachher, ERHITZEN_ZU_ABWAERME).inTandemWith).toEqual(finde(vorher, ERHITZEN_ZU_ABWAERME).inTandemWith);
  });

  test('Anlegen, Rückgängig und Partner löschen lässt keine veralteten IDs zurück', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    await mitVerbindung(page, ERHITZEN_ZU_ABWAERME, 'anlegen');
    await rueckgaengig(page);
    await mitVerbindung(page, ERHITZEN_ZU_ABWAERME, 'loeschen');

    expect(veraltet(await exportiere(page))).toEqual([]);
  });

  test('Löschen und Rückgängig behält den Flow im Export, mit Tandem', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    const neu = await mitVerbindung(page, ERHITZEN_ZU_ABWAERME, 'anlegen');
    const mitDrittem = await exportiere(page);
    await mitVerbindung(page, neu, 'loeschen');
    await rueckgaengig(page);
    const nachher = await exportiere(page);

    const flow = finde(nachher, neu);
    expect(flow).toBeDefined();
    expect(flow.inTandemWith.slice().sort()).toEqual(finde(mitDrittem, neu).inTandemWith.slice().sort());
    expect(finde(nachher, ERHITZEN_ZU_ABWAERME).inTandemWith).toContain(neu);
    expect(veraltet(nachher)).toEqual([]);
  });

});
