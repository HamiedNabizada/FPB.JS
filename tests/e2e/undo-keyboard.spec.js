// tests/e2e/undo-keyboard.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { exportiere, nachIds } from './helpers/modelExport';

/**
 * E2E-Tests für Rückgängig bei Shapes und die Tastenkürzel (Feature 024 A).
 *
 * Vorher belegt: Strg+Z, Entf und Strg+A taten nichts (keine Editor-Actions).
 * Rückgängig über die API nahm bei Shapes nur die Zeichnung zurück, das Modell
 * (elementsContainer, consistsOf..., Kind-Ebenen) blieb verändert.
 *
 * Maßstab für Rückgängig ist der Export: nach Aktion und Strg+Z muss er dem
 * Stand davor gleichen, samt Kind-Ebene.
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

/** Element über seinen Namen anklicken (wählt es aus, gibt der Zeichenfläche den Fokus) */
async function klicke(page, name) {
  const punkt = await page.evaluate((name) => {
    const element = window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.name === name && !e.waypoints && e.type !== 'label')[0];
    const box = document.querySelector(`[data-element-id="${element.id}"]`).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, name);
  await page.mouse.click(punkt.x, punkt.y);
}

const taste = async (page, kuerzel) => {
  await page.keyboard.press(kuerzel);
  await page.waitForTimeout(150);
};

test.describe('Rückgängig bei Shapes', () => {

  test('Entf auf einen State und Strg+Z stellen State, Flows und Kind-Ebene wieder her', async ({ page }) => {
    // Rohstoff ist Eingang des dekomponierten Operators Erhitzen, also auch Grenz-State der Kind-Ebene
    const { fehler } = await vorbereiten(page);
    const vorher = await exportiere(page);

    await klicke(page, 'Rohstoff');
    await taste(page, 'Delete');
    const geloescht = await exportiere(page);
    expect(JSON.stringify(geloescht)).not.toEqual(JSON.stringify(vorher));

    await taste(page, 'Control+z');
    expect(nachIds(await exportiere(page))).toEqual(nachIds(vorher));

    await taste(page, 'Control+y');
    expect(nachIds(await exportiere(page))).toEqual(nachIds(geloescht));
    expect(fehler).toEqual([]);
  });

  test('Anlegen und Strg+Z hinterlässt nichts im Export', async ({ page }) => {
    const { fehler } = await vorbereiten(page);
    const vorher = await exportiere(page);

    await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const systemLimit = registry.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Product' });
      window.fpbjs.get('modeling').createShape(shape, { x: systemLimit.x + 60, y: systemLimit.y + 60 }, systemLimit);
    });
    await klicke(page, 'Erhitzen');
    await taste(page, 'Control+z');

    expect(nachIds(await exportiere(page))).toEqual(nachIds(vorher));
    expect(fehler).toEqual([]);
  });

  test('Verschieben und Strg+Z stellen die Position im Export wieder her', async ({ page }) => {
    const { fehler } = await vorbereiten(page);
    const vorher = await exportiere(page);

    await klicke(page, 'Prüfen');
    await taste(page, 'Shift+ArrowRight');
    expect(nachIds(await exportiere(page))).not.toEqual(nachIds(vorher));
    await taste(page, 'Control+z');

    expect(nachIds(await exportiere(page))).toEqual(nachIds(vorher));
    expect(fehler).toEqual([]);
  });

  test('nach einem Ebenenwechsel nimmt Strg+Z nichts aus der anderen Ebene zurück', async ({ page }) => {
    const { importer, fehler } = await vorbereiten(page);

    await klicke(page, 'Prüfen');
    await taste(page, 'Shift+ArrowRight');
    const verschoben = await exportiere(page);

    await importer.switchToChildLayer();
    await page.evaluate(async () => {
      const kind = window.fpbjs.get('canvas').getRootElement();
      window.fpbjs.get('modeling').switchProcess(kind.businessObject.parent);
      await new Promise((r) => setTimeout(r, 300));
    });
    await klicke(page, 'Prüfen');
    await taste(page, 'Control+z');

    expect(nachIds(await exportiere(page))).toEqual(nachIds(verschoben));
    expect(fehler).toEqual([]);
  });

});

test.describe('Tastenkürzel', () => {

  test('Entf auf einen dekomponierten Operator fragt vorher nach', async ({ page }) => {
    const { importer } = await vorbereiten(page);

    await klicke(page, 'Erhitzen');
    await taste(page, 'Delete');

    await expect(page.locator('.modal.show')).toContainText('decomposed');
    expect((await importer.dataStore()).prozesse).toHaveLength(2);
  });

  test('Strg+A wählt alle Elemente der Ebene aus', async ({ page }) => {
    await vorbereiten(page);

    await klicke(page, 'Prüfen');
    await taste(page, 'Control+a');

    const zahlen = await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const root = window.fpbjs.get('canvas').getRootElement();
      return {
        ausgewaehlt: window.fpbjs.get('selection').get().length,
        elemente: registry.filter((e) => e !== root && e.type !== 'label').length,
      };
    });
    expect(zahlen.ausgewaehlt).toBe(zahlen.elemente);
  });

  test('Entf in einem Feld des Properties-Panels löscht kein Element', async ({ page }) => {
    const { importer } = await vorbereiten(page);
    await page.click('#openPropertiesPanelButton');
    await klicke(page, 'Prüfen');
    const vorher = (await importer.elements()).length;

    await page.locator('#pp_identification_shortName').click();
    await page.keyboard.press('End');
    await taste(page, 'Backspace');
    await taste(page, 'Delete');

    expect((await importer.elements()).length).toBe(vorher);
  });

});
