// tests/e2e/roundtrip.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Rundreise über eine echte Datei: Import, Export, erneuter Import, Export.
 *
 * Der Export muss die Quelle vollständig wiedergeben und beim zweiten Durchlauf
 * unverändert bleiben. Vorher belegt: der Renderer hing `_tooltipText` an jedes
 * gezeichnete Element, das Feld stand danach in elementVisualInformation
 * (in 24 von 44 Dateien auf der Platte). Der Vergleich hätte auch den Verlust
 * der actualValues gefangen.
 *
 * Referenzlisten werden ohne Reihenfolge verglichen, Elemente je Prozess über
 * ihre ID.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

const REFERENZLISTEN = ['incoming', 'outgoing', 'isAssignedTo', 'inTandemWith', 'elementsContainer',
  'consistsOfStates', 'consistsOfProcessOperator', 'consistsOfProcesses'];

function normiert(eintrag) {
  const kopie = { ...eintrag };
  REFERENZLISTEN.forEach((schluessel) => {
    if (Array.isArray(kopie[schluessel])) {
      kopie[schluessel] = kopie[schluessel].map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).sort();
    }
  });
  return kopie;
}

// Laufzeitzustand, den ältere Exporte mitschrieben (das Fixture stammt aus einem):
// CSS-Marker der Zeichenfläche. Der Export lässt ihn weg.
function ohneLaufzeit(grafik) {
  const { markers, ...rest } = grafik;
  return rest;
}

/** Prozess-ID -> { process, daten: {id: element}, grafik: {id: element} } */
function nachIds(modell) {
  const ergebnis = {};
  modell.filter((eintrag) => eintrag.process).forEach((eintrag) => {
    const zuMap = (liste, normieren) => Object.fromEntries((liste || []).map((e) => [e.id, normieren ? normiert(e) : ohneLaufzeit(e)]));
    ergebnis[eintrag.process.id] = {
      process: normiert({ ...eintrag.process, elementsContainer: undefined }),
      daten: zuMap(eintrag.elementDataInformation, true),
      grafik: zuMap(eintrag.elementVisualInformation, false),
    };
  });
  return JSON.parse(JSON.stringify(ergebnis));
}

/** Export wie DownloadModal, Stufe "alle Informationen" (Replacer dort gespiegelt) */
async function exportiere(page) {
  return page.evaluate(() => {
    window.fpbjs.get('eventBus').fire('dataStore.updateAll', {});
    const idOf = (x) => (typeof x === 'string' || !x ? x : x.id || x.uniqueIdent || x.$id || x);
    const liste = ['elementsContainer', 'consistsOfStates', 'consistsOfProcessOperator', 'consistsOfProcesses', 'inTandemWith', 'isAssignedTo', 'incoming', 'outgoing'];
    const einzeln = ['entryPoint', 'sourceRef', 'targetRef', 'decomposedView', 'parent', 'consistsOfSystemLimit'];
    return JSON.parse(JSON.stringify(window.fpbjs.getProcesses(), (name, val) => {
      if (liste.includes(name)) return Array.isArray(val) ? val.map(idOf) : idOf(val);
      if (einzeln.includes(name)) return idOf(val);
      if (name === 'isDecomposedProcessOperator') return val === null || val === undefined ? null : idOf(val);
      if (['di', 'children', 'labels', 'ProjectAssignment', 'TemporaryFlowHint', 'markers'].includes(name)) return undefined;
      return val;
    }));
  });
}

/** Beide Ebenen einmal zeichnen lassen, danach zurück auf die oberste */
async function alleEbenenZeichnen(importer, page) {
  await importer.switchToChildLayer();
  await page.evaluate(async () => {
    const kind = window.fpbjs.get('canvas').getRootElement();
    window.fpbjs.get('modeling').switchProcess(kind.businessObject.parent);
    await new Promise((r) => setTimeout(r, 300));
  });
}

test.describe('Rundreise', () => {

  test('Export gibt die Quelle vollständig wieder', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());
    await alleEbenenZeichnen(importer, page);

    const export1 = await exportiere(page);

    expect(nachIds(export1)).toEqual(nachIds(clone()));
  });

  test('schreibt keine Felder des Renderers in die Datei', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());
    await alleEbenenZeichnen(importer, page);

    const text = JSON.stringify(await exportiere(page));

    expect(text).not.toContain('_tooltipText');
  });

  test('bleibt beim zweiten Durchlauf unverändert', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());
    await alleEbenenZeichnen(importer, page);
    const export1 = await exportiere(page);

    await importer.import(export1);
    await alleEbenenZeichnen(importer, page);
    const export2 = await exportiere(page);

    expect(nachIds(export2)).toEqual(nachIds(export1));
  });

});
