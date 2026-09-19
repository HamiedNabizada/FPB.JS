// tests/e2e/helpers/modelExport.js

/**
 * Export wie DownloadModal (Stufe "alle Informationen", Replacer dort gespiegelt)
 * und ein Vergleich, der Referenzlisten ohne Reihenfolge und Elemente je Prozess
 * über ihre ID betrachtet.
 */

const REFERENZLISTEN = ['incoming', 'outgoing', 'isAssignedTo', 'inTandemWith', 'elementsContainer',
  'consistsOfStates', 'consistsOfProcessOperator', 'consistsOfProcesses'];

export function normiert(eintrag) {
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
export function ohneLaufzeit(grafik) {
  const { markers, ...rest } = grafik;
  return rest;
}

/** Prozess-ID -> { process, daten: {id: element}, grafik: {id: element} } */
export function nachIds(modell) {
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
export async function exportiere(page) {
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

