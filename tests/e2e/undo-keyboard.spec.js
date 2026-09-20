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

/**
 * Einzelne Tasten für die Werkzeuge der Palette, angezeigt in deren Tooltip
 * (diagram-js zeichnet ihn seit Version 15 selbst und nimmt dafür
 * `entry.shortcut`).
 *
 * Heikel daran: diagram-js bindet die Tastatur an die Zeichenfläche, und das
 * Beschriften eines Elements passiert innerhalb davon. Ohne Schutz hätte der
 * Name "Halbschale" beim ersten Buchstaben die Hand aktiviert.
 */
test.describe('Werkzeug-Tasten', () => {

  const werkzeuge = (page) => page.evaluate(() => ({
    hand: !!window.fpbjs.get('handTool').isActive(),
    lasso: !!window.fpbjs.get('lassoTool').isActive(),
    space: !!window.fpbjs.get('spaceTool').isActive(),
  }));

  test('H, L und S schalten die Werkzeuge an und wieder aus', async ({ page }) => {
    await vorbereiten(page);
    await klicke(page, 'Erhitzen');

    await page.keyboard.press('h');
    expect(await werkzeuge(page)).toMatchObject({ hand: true, lasso: false });
    await page.keyboard.press('h');
    expect(await werkzeuge(page)).toMatchObject({ hand: false });

    await page.keyboard.press('l');
    expect(await werkzeuge(page)).toMatchObject({ lasso: true, hand: false });
    await page.keyboard.press('l');

    await page.keyboard.press('s');
    expect(await werkzeuge(page)).toMatchObject({ space: true });
    await page.keyboard.press('s');
    expect(await werkzeuge(page)).toMatchObject({ space: false });
  });

  test('Tippen beim Beschriften löst kein Werkzeug aus', async ({ page }) => {
    await vorbereiten(page);

    const punkt = await page.evaluate(() => {
      const element = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:Product')[0];
      const box = document.querySelector(`[data-element-id="${element.id}"]`).getBoundingClientRect();
      return { id: element.id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    await page.mouse.dblclick(punkt.x, punkt.y);
    await expect(page.locator('.djs-direct-editing-content')).toBeVisible();

    await page.keyboard.press('Control+a');
    await page.keyboard.type('Halbschale');
    expect(await werkzeuge(page)).toEqual({ hand: false, lasso: false, space: false });

    await page.keyboard.press('Escape');
    await page.mouse.click(1300, 900);
    await page.waitForTimeout(300);
  });

  test('das Kürzel steht im Tooltip des Palette-Eintrags', async ({ page }) => {
    await vorbereiten(page);

    await page.locator('.djs-palette .entry[data-action="hand-tool"]').hover();

    const tooltip = page.locator('.djs-hover-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 3000 });
    await expect(tooltip.locator('.djs-palette-tooltip-shortcut')).toHaveText('H');
  });

});
