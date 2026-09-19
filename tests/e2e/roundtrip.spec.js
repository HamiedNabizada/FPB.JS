// tests/e2e/roundtrip.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { exportiere, nachIds } from './helpers/modelExport';

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
