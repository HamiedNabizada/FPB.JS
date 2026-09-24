// tests/e2e/connection-bridges.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Nach jedem Befehl wurden alle Verbindungen neu gezeichnet, damit die Brücken
 * an Kreuzungen stimmen. Jetzt nur noch die, deren Verlauf oder Kreuzungen sich
 * geändert haben. Dieser Test prüft nach jedem Schritt, dass die Zeichenfläche
 * genau so aussieht wie nach einem vollständigen Neuzeichnen.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

/** Pfaddaten aller Verbindungen, so wie sie gerade auf der Zeichenfläche stehen */
const linien = (page) => page.evaluate(() => {
  const registry = window.fpbjs.get('elementRegistry');
  const result = {};
  registry.filter((e) => e.waypoints).forEach((connection) => {
    const visual = registry.getGraphics(connection).querySelector('.djs-visual');
    result[connection.id] = [...visual.children].map((node) => node.outerHTML).join('');
  });
  return result;
});

/** Das alte Verhalten: jede Verbindung neu zeichnen */
const allesNeuZeichnen = (page) => page.evaluate(() => {
  const eventBus = window.fpbjs.get('eventBus');
  window.fpbjs.get('elementRegistry').filter((e) => e.waypoints)
    .forEach((connection) => eventBus.fire('element.changed', { element: connection }));
});

test('nach jedem Befehl stimmen die Brücken mit einem vollständigen Neuzeichnen überein', async ({ page }) => {
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());

  // Feste Folge von Verschiebungen, damit Kreuzungen entstehen und verschwinden
  const schritte = [
    [0, 0, 160], [1, -140, 0], [2, 0, -120], [0, 90, 40], [3, -60, 180],
    [1, 200, -30], [4, 0, 150], [2, -180, 60], [3, 120, -150], [4, -40, -40],
  ];

  let mitBruecke = 0;
  for (const [nr, dx, dy] of schritte) {
    await page.evaluate(([nr, dx, dy]) => {
      const registry = window.fpbjs.get('elementRegistry');
      const root = window.fpbjs.get('canvas').getRootElement();
      const shapes = registry.filter((e) => !e.waypoints && e.type !== 'label' && e !== root &&
        e.type !== 'fpb:SystemLimit' && e.parent && e.parent.type === 'fpb:SystemLimit');
      window.fpbjs.get('modeling').moveElements([shapes[nr % shapes.length]], { x: dx, y: dy });
    }, [nr, dx, dy]);

    const neu = await linien(page);
    await allesNeuZeichnen(page);
    const voll = await linien(page);

    expect(neu).toEqual(voll);
    if (Object.values(voll).some((svg) => / A 7,7 /.test(svg))) {
      mitBruecke++;
    }

    // und ebenso nach Rückgängig
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    const neuUndo = await linien(page);
    await allesNeuZeichnen(page);
    expect(neuUndo).toEqual(await linien(page));
    await page.evaluate(() => window.fpbjs.get('commandStack').redo());
  }

  // Der Vergleich ist nur aussagekräftig, wenn auch Brücken vorkamen
  expect(mitBruecke).toBeGreaterThan(0);
});

test('eine neue Kreuzung bekommt ihre Brücke auch an der Linie, die der Befehl nicht berührt', async ({ page }) => {
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());

  // Die Nutzung zur Heizplatte läuft waagerecht auf Höhe 349/350. Die Linie
  // von Prüfen zu Ausschuss bekommt einen senkrechten Abschnitt quer hindurch.
  const ids = await page.evaluate(() => {
    const registry = window.fpbjs.get('elementRegistry');
    const verbindung = (von, nach) => registry.filter((e) => e.waypoints &&
      e.source.businessObject.name === von && e.target.businessObject.name === nach)[0];
    const nutzung = verbindung('Erhitzen', 'Heizplatte') || verbindung('Heizplatte', 'Erhitzen');
    const quer = verbindung('Prüfen', 'Ausschuss');
    window.fpbjs.get('modeling').updateWaypoints(quer, [
      { x: 1013, y: 630 }, { x: 1013, y: 300 }, { x: 1100, y: 300 }, { x: 1100, y: 675 }
    ]);
    return { nutzung: nutzung.id };
  });

  const neu = await linien(page);
  expect(neu[ids.nutzung]).toMatch(/ A 7,7 /);
  await allesNeuZeichnen(page);
  expect(neu).toEqual(await linien(page));

  // Rückgängig nimmt die Brücke wieder weg
  await page.evaluate(() => window.fpbjs.get('commandStack').undo());
  const zurueck = await linien(page);
  expect(zurueck[ids.nutzung]).not.toMatch(/ A 7,7 /);
  await allesNeuZeichnen(page);
  expect(zurueck).toEqual(await linien(page));
});
