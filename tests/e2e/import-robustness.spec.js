// tests/e2e/import-robustness.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für den JSON-Import.
 *
 * Deckt JSONImporter.js ab. Jeder Test hier bildet einen Fehler ab, der vorher
 * belegt wurde: bis auf die Tandem-Auflösung brach der Import in diesen Fällen
 * komplett ab, mit einem TypeError als einziger Rückmeldung.
 *
 * Das Fixture ist ein echtes Modell mit zwei Layern, Dekomposition, Parallel-
 * und Alternative-Flows, einer Usage-Verbindung und Characteristics.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const prozesse = (daten) => daten.filter((eintrag) => eintrag.process);
const daten = (prozess) => prozess.elementDataInformation;
const visuell = (prozess) => prozess.elementVisualInformation;

/** Dritten ParallelFlow zu einer bestehenden Zweiergruppe erzeugen */
function mitTandemDreiergruppe(einseitig) {
  const modell = clone();
  const prozess = prozesse(modell)[1];
  const gruppen = {};
  daten(prozess)
    .filter((e) => e.$type === 'fpb:ParallelFlow')
    .forEach((flow) => (gruppen[flow.sourceRef] = gruppen[flow.sourceRef] || []).push(flow));

  const paar = Object.values(gruppen).find((g) => g.length === 2);
  const dritter = JSON.parse(JSON.stringify(paar[0]));
  dritter.id = 'tandem-dritter-0000-0000-000000000003';
  const visuellDritter = JSON.parse(JSON.stringify(visuell(prozess).find((v) => v.id === paar[0].id)));
  visuellDritter.id = dritter.id;

  daten(prozess).push(dritter);
  visuell(prozess).push(visuellDritter);
  daten(prozess).find((e) => e.$type === 'fpb:SystemLimit').elementsContainer.push(dritter.id);
  daten(prozess).find((e) => e.id === dritter.sourceRef).outgoing.push(dritter.id);
  daten(prozess).find((e) => e.id === dritter.targetRef).incoming.push(dritter.id);

  const gruppe = [paar[0], paar[1], dritter];
  gruppe.forEach((flow, index) => {
    flow.inTandemWith = einseitig
      ? (index === 0 ? gruppe.slice(1).map((f) => f.id) : [])
      : gruppe.filter((f) => f !== flow).map((f) => f.id);
  });
  return { modell, ids: gruppe.map((f) => f.id) };
}

/** Kopie des Modells mit durchgehend neuen IDs und eigenem Projektnamen */
function mitEigenenIds(modell, projektname) {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
  const zuordnung = new Map();
  const text = JSON.stringify(modell).replace(uuid, (alt) => {
    if (!zuordnung.has(alt)) {
      zuordnung.set(alt, 'ffffffff-0000-4000-8000-' + String(zuordnung.size).padStart(12, '0'));
    }
    return zuordnung.get(alt);
  });
  const kopie = JSON.parse(text);
  kopie.filter((eintrag) => eintrag.$type === 'fpb:Project').forEach((projekt) => { projekt.name = projektname; });
  kopie.filter((eintrag) => eintrag.process && eintrag.process.parent && eintrag.process.parent.name)
    .forEach((eintrag) => { eintrag.process.parent.name = projektname; });
  return kopie;
}

test.describe('Import - gültiges Modell', () => {

  test('lädt beide Layer vollständig', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    const store = await importer.dataStore();
    expect(store.projektdefinitionen).toBe(1);
    expect(store.prozesse).toHaveLength(2);
    expect(await importer.elements()).toHaveLength(39);
    expect(await importer.unresolvedReferences()).toEqual([]);
  });

  test('verändert das übergebene Objekt nicht', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();

    const unverändert = await page.evaluate(async (modell) => {
      const vorher = JSON.stringify(modell);
      window.fpbjs.get('eventBus').fire('FPBJS.import', { data: modell });
      await new Promise((r) => setTimeout(r, 3200));
      return JSON.stringify(modell) === vorher;
    }, clone());

    expect(unverändert).toBe(true);
  });

  test('spiegelt die Waypoints jeder Verbindung ins DI', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    const verbindungen = await importer.connections();
    expect(verbindungen.length).toBeGreaterThan(0);
    expect(verbindungen.filter((c) => !c.hatDiWaypoints)).toEqual([]);
  });

});

test.describe('Import - unvollständige Dateien', () => {

  test('überspringt IDs ohne Datensatz', async ({ page }) => {
    const modell = clone();
    daten(prozesse(modell)[0])
      .find((e) => e.$type === 'fpb:SystemLimit')
      .elementsContainer.push('00000000-dead-beef-0000-000000000000');

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);

    expect((await importer.dataStore()).prozesse).toHaveLength(2);
    expect(await importer.elements()).toHaveLength(39);
  });

  test('zeichnet Verbindungen ohne visuelle Information als gerade Linie', async ({ page }) => {
    const modell = clone();
    const prozess = prozesse(modell)[0];
    const flow = daten(prozess).find((e) => e.$type === 'fpb:Flow');
    const usage = daten(prozess).find((e) => e.$type === 'fpb:Usage');
    prozess.elementVisualInformation = visuell(prozess).filter((v) => v.id !== flow.id && v.id !== usage.id);

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);

    const verbindungen = await importer.connections();
    expect((await importer.dataStore()).prozesse).toHaveLength(2);
    for (const id of [flow.id, usage.id]) {
      const verbindung = verbindungen.find((c) => c.id === id);
      expect(verbindung, `Verbindung ${id} fehlt nach dem Import`).toBeTruthy();
      expect(verbindung.waypoints).toBeGreaterThanOrEqual(2);
    }
  });

  test('verbindet Flows auch ohne incoming/outgoing an den Elementen', async ({ page }) => {
    const modell = clone();
    prozesse(modell).forEach((prozess) => daten(prozess).forEach((element) => {
      if (!/Flow|Usage|SystemLimit/.test(element.$type)) {
        delete element.incoming;
        delete element.outgoing;
      }
    }));

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);

    const verbindungen = await importer.connections();
    expect(verbindungen.length).toBe(19);
    expect(await importer.unresolvedReferences()).toEqual([]);
    verbindungen.forEach((verbindung) => {
      expect(verbindung.sourceRef, `Flow ${verbindung.id} ohne Source`).toBeTruthy();
      expect(verbindung.targetRef, `Flow ${verbindung.id} ohne Target`).toBeTruthy();
    });
  });

  test('entfernt Flows, deren Zielelement in der Datei fehlt', async ({ page }) => {
    const modell = clone();
    const prozess = prozesse(modell)[0];
    const opfer = daten(prozess).find((e) => e.name === 'Ausschuss');
    const verwaisteFlows = daten(prozess).filter((e) => e.targetRef === opfer.id).map((e) => e.id);

    prozess.elementDataInformation = daten(prozess).filter((e) => e.id !== opfer.id);
    prozess.elementVisualInformation = visuell(prozess).filter((v) => v.id !== opfer.id);
    const systemLimit = daten(prozess).find((e) => e.$type === 'fpb:SystemLimit');
    systemLimit.elementsContainer = systemLimit.elementsContainer.filter((id) => id !== opfer.id);

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);

    expect(verwaisteFlows.length).toBeGreaterThan(0);
    expect((await importer.dataStore()).prozesse).toHaveLength(2);

    const elemente = await importer.elements();
    expect(elemente.filter((e) => verwaisteFlows.includes(e.id))).toEqual([]);
    expect(await importer.unresolvedReferences()).toEqual([]);

    // auch keine Erwähnung der entfernten Flows in den Listen der übrigen Elemente
    const erwähnungen = elemente.filter((e) => [...e.incoming, ...e.outgoing, ...e.inTandemWith]
      .some((ref) => verwaisteFlows.includes(String(ref).replace('STRING:', ''))));
    expect(erwähnungen).toEqual([]);
  });

  test('entfernt Flows mit einer ins Leere zeigenden Referenz', async ({ page }) => {
    const modell = clone();
    const flow = daten(prozesse(modell)[0]).find((e) => e.$type === 'fpb:Flow');
    flow.targetRef = '00000000-dead-beef-0000-000000000001';

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);

    const elemente = await importer.elements();
    expect((await importer.dataStore()).prozesse).toHaveLength(2);
    expect(elemente.find((e) => e.id === flow.id)).toBeUndefined();
    expect(elemente.filter((e) => [...e.incoming, ...e.outgoing].includes(flow.id))).toEqual([]);
  });

  test('verwirft einen Sub-Prozess-Verweis, dessen Prozess fehlt', async ({ page }) => {
    const modell = clone().filter((eintrag) => !(eintrag.process && eintrag.process.isDecomposedProcessOperator));

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);

    const store = await importer.dataStore();
    expect(store.prozesse).toHaveLength(1);
    expect(await importer.unresolvedReferences()).toEqual([]);
    const consistsOf = await page.evaluate(() => {
      const prozess = window.fpbjs.getProcesses().filter((p) => p && p.process)[0].process;
      return (prozess.consistsOfProcesses || []).map((c) => (typeof c === 'string' ? c : c.id));
    });
    expect(consistsOf).toEqual([]);
  });

});

test.describe('Import - Referenzauflösung', () => {

  test('löst eine einseitig gepflegte Tandem-Gruppe beidseitig auf', async ({ page }) => {
    const { modell, ids } = mitTandemDreiergruppe(true);

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);

    const gruppe = (await importer.elements()).filter((e) => ids.includes(e.id));
    expect(gruppe).toHaveLength(3);
    gruppe.forEach((flow) => {
      expect(flow.inTandemWith.filter((ref) => String(ref).startsWith('STRING:')), `${flow.id} hat unaufgelöste Partner`).toEqual([]);
    });
    // der Flow, der die Gruppe führt, kennt beide Partner
    expect(gruppe.find((f) => f.id === ids[0]).inTandemWith).toHaveLength(2);
    // und die Partner kennen ihn zurück
    gruppe.slice(1).forEach((flow) => expect(flow.inTandemWith).toContain(ids[0]));
  });

  test('lässt eine beidseitig gepflegte Tandem-Gruppe unverändert', async ({ page }) => {
    const { modell, ids } = mitTandemDreiergruppe(false);

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);

    const gruppe = (await importer.elements()).filter((e) => ids.includes(e.id));
    expect(gruppe).toHaveLength(3);
    gruppe.forEach((flow) => expect(flow.inTandemWith.sort()).toEqual(ids.filter((id) => id !== flow.id).sort()));
  });

  test('leitet ein fehlendes parent aus consistsOfProcesses ab', async ({ page }) => {
    const modell = clone();
    prozesse(modell).forEach((eintrag) => delete eintrag.process.parent);

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(modell);

    const store = await importer.dataStore();
    const kind = store.prozessMitParent.find((p) => p.id !== store.prozesse[0]);
    expect(kind.parent).toBe(store.prozesse[0]);

    // und damit funktioniert der Weg zurück aus dem Child-Layer
    const childId = await importer.switchToChildLayer();
    expect(childId).toBe(kind.id);
    expect(await importer.compose()).toEqual({ ok: true });
    expect(await importer.rootProcessId()).toBe(store.prozesse[0]);
  });

});

test.describe('Import - zweites Modell', () => {

  test('ersetzt Datenspeicher und Layer-Panel statt anzuhängen', async ({ page }) => {
    const erstes = clone();
    const zweitesModell = mitEigenenIds(clone(), 'ZWEITES_PROJEKT');

    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(erstes);
    const ersteProzesse = (await importer.dataStore()).prozesse;

    await importer.import(zweitesModell);
    const store = await importer.dataStore();

    expect(store.projektdefinitionen).toBe(1);
    expect(store.prozesse).toHaveLength(2);
    store.prozesse.forEach((id) => expect(ersteProzesse).not.toContain(id));
    expect(await importer.layerPanelText()).toContain('ZWEITES_PROJEKT');
  });

});
