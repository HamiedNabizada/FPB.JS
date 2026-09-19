// tests/e2e/clipboard.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { exportiere, nachIds } from './helpers/modelExport';

/**
 * E2E-Tests für Kopieren und Einfügen (Feature 024 H).
 *
 * Kopiert werden States, Operatoren und Ressourcen samt der Verbindungen
 * untereinander. Die Kopie bekommt neue IDs und eigene Daten.
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

/** Elemente über ihre Namen auswählen und der Zeichenfläche den Fokus geben */
async function auswaehlen(page, namen) {
  await page.evaluate((namen) => {
    const registry = window.fpbjs.get('elementRegistry');
    const elemente = namen.map((name) => registry
      .filter((e) => e.businessObject && e.businessObject.name === name && !e.waypoints && e.type !== 'label')[0]);
    window.fpbjs.get('selection').select(elemente);
    window.fpbjs.get('canvas').focus();
  }, namen);
}

const auswahlInfo = (page) => page.evaluate(() => window.fpbjs.get('selection').get().map((e) => ({
  id: e.id,
  typ: e.type,
  name: e.businessObject.name,
  x: e.x,
  y: e.y,
  ausgehend: e.outgoing.map((c) => c.type + ' -> ' + c.target.businessObject.name),
})));

test.describe('Kopieren und Einfügen', () => {

  test('Strg+C und Strg+V kopieren Auswahl samt Verbindungen mit neuen IDs', async ({ page }) => {
    const { fehler } = await vorbereiten(page);
    await auswaehlen(page, ['Warmprodukt', 'Prüfen']);
    const original = await auswahlInfo(page);

    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);

    const kopie = await auswahlInfo(page);
    expect(kopie).toHaveLength(2);
    expect(kopie.map((e) => e.name)).toEqual(['Warmprodukt', 'Prüfen']);
    expect(kopie.map((e) => e.typ)).toEqual(original.map((e) => e.typ));
    expect(kopie.map((e) => e.id)).not.toEqual(original.map((e) => e.id));
    expect(kopie[0].ausgehend).toEqual(['fpb:Flow -> Prüfen']);
    // versetzt eingefügt, nicht auf dem Original
    expect(kopie[0].x).toBe(original[0].x + 40);
    expect(kopie[0].y).toBe(original[0].y + 40);
    expect(fehler).toEqual([]);
  });

  test('die Kopie teilt ihre Daten nicht mit dem Original', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, ['Warmprodukt']);

    const geteilt = await page.evaluate(() => {
      const copyPaste = window.fpbjs.get('fpbCopyPaste');
      const original = window.fpbjs.get('selection').get()[0];
      copyPaste.copy();
      const kopie = copyPaste.paste()[0];
      window.fpbjs.get('modeling').updateLabel(kopie, 'Kopie');
      return {
        identGeteilt: kopie.businessObject.identification === original.businessObject.identification,
        merkmaleGeteilt: kopie.businessObject.characteristics === original.businessObject.characteristics,
        uniqueIdentPasst: kopie.businessObject.identification.uniqueIdent === kopie.id,
        originalName: original.businessObject.name,
        kopieName: kopie.businessObject.name,
      };
    });

    expect(geteilt).toEqual({
      identGeteilt: false,
      merkmaleGeteilt: false,
      uniqueIdentPasst: true,
      originalName: 'Warmprodukt',
      kopieName: 'Kopie',
    });
  });

  test('ein Rückgängig nimmt das Einfügen samt Verbindungen zurück', async ({ page }) => {
    await vorbereiten(page);
    const vorher = await exportiere(page);
    await auswaehlen(page, ['Warmprodukt', 'Prüfen', 'Gutprodukt']);

    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    expect(nachIds(await exportiere(page))).toEqual(nachIds(vorher));
  });

  test('zweimal Einfügen legt die Kopien nebeneinander', async ({ page }) => {
    const { importer } = await vorbereiten(page);
    await auswaehlen(page, ['Warmprodukt']);
    const original = (await auswahlInfo(page))[0];

    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(200);
    const erste = (await auswahlInfo(page))[0];
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(200);
    const zweite = (await auswahlInfo(page))[0];

    expect(erste.x).toBe(original.x + 40);
    expect(zweite.x).toBe(original.x + 80);
    expect(new Set([original.id, erste.id, zweite.id]).size).toBe(3);
    expect(await importer.unresolvedReferences()).toEqual([]);
  });

});
