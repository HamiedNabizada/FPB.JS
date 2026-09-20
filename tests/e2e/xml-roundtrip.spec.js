// tests/e2e/xml-roundtrip.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { exportiere, nachIds } from './helpers/modelExport';

/**
 * Rundreise durch das XML über die Oberfläche: Modell laden, als XML
 * exportieren, dieselbe Datei wieder importieren, vergleichen.
 *
 * Der XML-Weg (XMLMapper) hatte bisher keinen Test. Er muss im Browser laufen:
 * in der Unit-Umgebung (happy-dom) kommen die Attribute im Namensraum
 * `visual:` nicht durch, ein Unit-Test wäre also aussagelos.
 *
 * Bedeutungsgleiche Unterschiede werden vor dem Vergleich angeglichen:
 * - fehlende gegen leere Merkmalsliste,
 * - Zahl gegen Zahl als Text (XML-Attribute tragen keinen Typ),
 * - `original` an Stützpunkten (Andock-Angabe von diagram-js, wird neu berechnet).
 */

const clone = () => JSON.parse(JSON.stringify(basis));

/** Gleicht bedeutungsgleiche Unterschiede an (siehe Kopf) */
function angeglichen(modell) {
  return JSON.parse(JSON.stringify(modell, (schluessel, wert) => {
    if (schluessel === 'original') return undefined;
    if (schluessel === 'characteristics' && Array.isArray(wert) && !wert.length) return undefined;
    if (schluessel === 'value' && typeof wert === 'number') return String(wert);
    return wert;
  }));
}

const positionen = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry')
  .filter((e) => e.businessObject && !e.waypoints && e.type !== 'label' && e.type !== 'fpb:Process')
  .map((e) => `${e.id}:${e.x},${e.y},${e.width},${e.height}`).sort());

const stuetzpunkte = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry')
  .filter((e) => e.waypoints)
  .map((e) => `${e.id}:${e.waypoints.map((p) => `${p.x},${p.y}`).join(' ')}`).sort());

/** Über den Download-Dialog als XML exportieren, Ergebnis per Event abholen */
async function alsXmlExportieren(page) {
  await page.locator('.layerPanel > button').first().click();
  await page.evaluate(() => {
    const knopf = [...document.querySelectorAll('button')].find((b) => b.querySelector('[data-icon="download"]'));
    knopf.click();
  });
  await expect(page.locator('#formatXML')).toBeVisible();

  const xml = await page.evaluate(() => new Promise((resolve) => {
    window.fpbjs.get('eventBus').once('fpbjs', (e) => resolve(e.format === 'xml' ? e.data : null));
    document.querySelector('#formatXML').click();
    document.querySelector('#export1').click();
    setTimeout(() => {
      const senden = [...document.querySelectorAll('.modal.show .modal-footer button')].pop();
      senden.click();
    }, 150);
    setTimeout(() => resolve(null), 8000);
  }));
  return xml;
}

/** XML als Datei in den Import-Dialog ziehen und importieren */
async function xmlImportieren(page, xml) {
  await page.evaluate(() => {
    const knopf = [...document.querySelectorAll('button')].find((b) => b.querySelector('[data-icon="upload"]'));
    knopf.click();
  });
  await expect(page.locator('.fileLabel')).toBeVisible();
  await page.evaluate((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'modell.xml', { type: 'text/xml' }));
    // genau der Dialog mit dem Dateifeld, der Export-Dialog kann noch im DOM sein
    const ziel = document.querySelector('.fileLabel').closest('.modal-body');
    ziel.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    ziel.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, xml);
  await expect(page.locator('.fileLabel')).toHaveText('modell.xml');
  await page.evaluate(() => {
    const dialog = document.querySelector('.fileLabel').closest('.modal-content');
    dialog.querySelector('.modal-footer button').click();
  });
  await page.waitForTimeout(3500);
}

test.describe('XML Rundreise', () => {

  test('Export nach XML und Import zurück erhalten Daten und Grafik', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const importer = new ImportPage(page);
    const warnungen = [];
    await importer.goto();
    await page.exposeFunction('__warnung', (w) => warnungen.push(...w));
    await page.evaluate(() => window.fpbjs.get('eventBus')
      .on('import.report', (e) => window.__warnung(e.warnings.map((w) => w.message))));
    await importer.import(clone());

    const vorherJson = await exportiere(page);
    const vorherPositionen = await positionen(page);
    const vorherStuetzpunkte = await stuetzpunkte(page);

    const xml = await alsXmlExportieren(page);
    expect(xml).toContain('<project');
    expect(xml).toContain('visual:waypoints');

    await xmlImportieren(page, xml);

    expect(await positionen(page)).toEqual(vorherPositionen);
    expect(await stuetzpunkte(page)).toEqual(vorherStuetzpunkte);
    const nachher = await exportiere(page);
    expect(angeglichen(nachIds(nachher))).toEqual(angeglichen(nachIds(vorherJson)));

    // die Dinge, die der XML-Weg vorher verlor, ausdrücklich geprüft
    const flows = (daten) => daten.filter((e) => e.process).flatMap((e) => e.elementDataInformation)
      .filter((e) => e.$type.includes('Flow') && !e.$type.includes('Usage'))
      .map((e) => `${e.$type} ${e.id} [${(e.inTandemWith || []).slice().sort().join(',')}]`).sort();
    expect(flows(nachher)).toEqual(flows(vorherJson));

    const merkmal = (daten) => daten.filter((e) => e.process).flatMap((e) => e.elementDataInformation)
      .find((e) => e.characteristics && e.characteristics.length).characteristics[0].descriptiveElement;
    expect(angeglichen(merkmal(nachher))).toEqual(angeglichen(merkmal(vorherJson)));

    // incoming/outgoing führen die Flüsse, nicht die verbundenen Elemente
    const flussIds = new Set(nachher.filter((e) => e.process).flatMap((e) => e.elementDataInformation)
      .filter((e) => e.$type.includes('Flow') || e.$type.includes('Usage')).map((e) => e.id));
    const falsch = nachher.filter((e) => e.process).flatMap((e) => e.elementDataInformation)
      .flatMap((e) => [...(e.incoming || []), ...(e.outgoing || [])])
      .filter((verweis) => !flussIds.has(verweis));
    expect(falsch).toEqual([]);
    // kein automatisches Layout, keine verworfenen Referenzen
    expect(warnungen).toEqual([]);
    expect(await importer.unresolvedReferences()).toEqual([]);
  });

});
