// tests/e2e/view.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für die Ansicht: eingepasste Ansicht nach dem Import und Minimap.
 *
 * Vorher belegt: nach dem Import stand die Ansicht am Ursprung mit Zoom 1, größere
 * Modelle lagen teils außerhalb des Fensters. In der Minimap waren die
 * Verbindungen schwarz gefüllte Flächen, weil fill:none nur aus diagram-js.css kam.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

test.describe('Ansicht', () => {

  test('zeigt nach dem Import das ganze Modell', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    const ausserhalb = await page.evaluate(() => {
      const flaeche = document.querySelector('#modeler-container .djs-container').getBoundingClientRect();
      return window.fpbjs.get('elementRegistry')
        .filter((e) => !e.waypoints && e.type !== 'label' && e.parent)
        .map((e) => ({ id: e.id, box: document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect() }))
        .filter(({ box }) => box.left < flaeche.left - 1 || box.top < flaeche.top - 1
          || box.right > flaeche.right + 1 || box.bottom > flaeche.bottom + 1)
        .map(({ id }) => id);
    });
    expect(ausserhalb).toEqual([]);
  });

  test('Minimap lässt sich öffnen und zeichnet Verbindungen ungefüllt', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    await page.click('.djs-minimap .toggle');
    await expect(page.locator('.djs-minimap.open .map')).toBeVisible();

    const fuellungen = await page.evaluate(() => [...document.querySelectorAll('.djs-minimap .map path[style*="marker-end"]')]
      .map((p) => getComputedStyle(p).fill));
    expect(fuellungen.length).toBeGreaterThan(0);
    expect([...new Set(fuellungen)]).toEqual(['none']);
  });


  test('das Context-Pad bleibt neben den Panels sichtbar', async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 700 });
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    // Element an den rechten Rand der Zeichenfläche schieben: dort hätte das
    // Pad in seiner Standardlage keinen Platz mehr
    await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const element = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:TechnicalResource')[0];
      canvas.scrollToElement(element);
      const box = document.querySelector(`[data-element-id="${element.id}"]`).getBoundingClientRect();
      const flaeche = canvas.getContainer().getBoundingClientRect();
      canvas.scroll({ dx: flaeche.right - box.right - 10, dy: 0 });
      window.fpbjs.get('selection').select(element);
      window.fpbjs.get('contextPad').open(element);
    });
    await page.waitForTimeout(300);

    const lage = await page.evaluate(() => {
      const pad = document.querySelector('.djs-context-pad.open').getBoundingClientRect();
      const panels = document.querySelector('.side-panels').getBoundingClientRect();
      return { padRechts: pad.right, panelsLinks: panels.left, padLinks: pad.left };
    });
    expect(lage.padRechts).toBeLessThanOrEqual(lage.panelsLinks);
    expect(lage.padLinks).toBeGreaterThan(0);
  });

  /**
   * app/css/diagram-js.css ist eine Kopie des Stylesheets von diagram-js und
   * hinkte weit hinterher. Was seit Version 15 dazukam, lief deshalb ohne
   * Gestaltung: hier die Umrandung, die diagram-js seit 15.13 auch um
   * Verbindungen legt und in seinem Stylesheet wieder ausblendet.
   */
  test('eine ausgewählte Verbindung bekommt kein Umrandungsrechteck', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    const umrandung = await page.evaluate(() => {
      const verbindung = window.fpbjs.get('elementRegistry').filter((e) => e.waypoints)[0];
      window.fpbjs.get('selection').select(verbindung);
      const outline = document.querySelector(`[data-element-id="${verbindung.id}"] .djs-outline`);
      if (!outline) return { vorhanden: false };
      const box = outline.getBoundingClientRect();
      return { vorhanden: true, display: getComputedStyle(outline).display, flaeche: Math.round(box.width * box.height) };
    });

    expect(umrandung.vorhanden ? umrandung.display : 'none').toBe('none');
    expect(umrandung.vorhanden ? umrandung.flaeche : 0).toBe(0);
  });

  test('die Kantengriffe der Systemgrenze zeigen einen Größen-Cursor', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    const cursor = await page.evaluate(() => {
      const systemLimit = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      window.fpbjs.get('selection').select(systemLimit);
      const lies = (richtung) => {
        const griff = document.querySelector('.djs-resizer-' + richtung);
        return griff ? getComputedStyle(griff).cursor : 'fehlt';
      };
      return { n: lies('n'), s: lies('s'), e: lies('e'), w: lies('w') };
    });

    expect(cursor).toEqual({ n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' });
  });

  /**
   * Die Panels nehmen der Zeichenfläche Breite weg. diagram-js beobachtet
   * seinen Container nicht von sich aus, deshalb rechnete alles, was die
   * sichtbare Fläche misst, mit dem alten Wert weiter (gemessen: Container
   * 1033, Viewbox weiter 1281). `services/CanvasResizeNotifier` sagt Bescheid,
   * das Modul `keep-selection-visible` von diagram-js hält die Auswahl im Bild.
   */
  test('beim Öffnen eines Panels folgt die Ansicht und die Auswahl bleibt sichtbar', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(clone());

    await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const rechts = registry
        .filter((e) => !e.waypoints && e.type !== 'label' && e.type !== 'fpb:Process')
        .sort((a, b) => (b.x + b.width) - (a.x + a.width))[0];
      window.fpbjs.get('selection').select(rechts);
      window.fpbjs.get('canvas').scrollToElement(rechts);
    });
    await page.waitForTimeout(500);

    const lage = async () => page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const container = canvas.getContainer().getBoundingClientRect();
      const auswahl = window.fpbjs.get('selection').get()[0];
      const element = document.querySelector(`[data-element-id="${auswahl.id}"]`).getBoundingClientRect();
      return {
        breiteContainer: Math.round(container.width),
        breiteViewbox: Math.round(canvas.viewbox().outer.width),
        sichtbar: element.left >= container.left - 1 && element.right <= container.right + 1,
      };
    });

    expect(await lage()).toMatchObject({ sichtbar: true });

    await page.click('#openPropertiesPanelButton');
    await page.waitForTimeout(800);

    const nachher = await lage();
    expect(nachher.breiteViewbox).toBe(nachher.breiteContainer);
    expect(nachher.sichtbar).toBe(true);
  });

});
