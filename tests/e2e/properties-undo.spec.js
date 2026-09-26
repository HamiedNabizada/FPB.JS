// tests/e2e/properties-undo.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für Rückgängig bei Eingaben im Eigenschaften-Panel.
 *
 * Das Panel änderte Identifikation und Merkmale direkt am Objekt und reichte
 * dann dasselbe Objekt an updateProperties weiter. Alter und neuer Wert waren
 * damit identisch, Rückgängig tat nichts. Das Löschen eines Merkmals lief ganz
 * ohne Befehl. Und die Felder der Merkmale hingen am Listenplatz, nach dem
 * Löschen eines mittleren Merkmals konnten sie Werte des falschen zeigen.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const OPERATOR = 'Prüfen';

async function vorbereiten(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto('/?panel=legacy');
  await importer.import(clone());
  await page.evaluate((name) => {
    const element = window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.name === name && !e.waypoints && e.type !== 'label')[0];
    window.fpbjs.get('selection').select(element);
  }, OPERATOR);
  await page.click('#openPropertiesPanelButton');
  await expect(page.locator('.propertiespanel .accordion-button', { hasText: 'Identification' })).toBeVisible();
}

const bereich = (page, titel) => page.locator('.propertiespanel .accordion-button', { hasText: titel }).first();

const modell = (page) => page.evaluate((name) => {
  const element = window.fpbjs.get('elementRegistry')
    .filter((e) => e.businessObject && e.businessObject.name === name && !e.waypoints && e.type !== 'label')[0];
  const bo = element.businessObject;
  return {
    longName: bo.identification.longName,
    merkmale: (bo.characteristics || []).map((c) => c.category.shortName + '=' + c.descriptiveElement.setpointValue.value),
  };
}, OPERATOR);

const rueckgaengig = (page) => page.evaluate(() => window.fpbjs.get('commandStack').undo());

async function merkmaleAnlegen(page, anzahl) {
  await bereich(page, 'Actions').click();
  const knopf = page.getByRole('button', { name: 'Add characteristics' });
  for (let i = 0; i < anzahl; i++) {
    await knopf.click();
  }
  await expect(page.locator('.characteristics-properties')).toHaveCount(anzahl);
}

/** Setpoint-Wert des Merkmals an Position `nr` (1-basiert) über das Feld setzen */
async function sollwertEintragen(page, nr, wert) {
  const block = page.locator('.characteristics-properties').nth(nr - 1);
  // erst das Merkmal selbst, dann darin den beschreibenden Teil aufklappen
  await block.locator('.accordion-button').first().click();
  await block.locator('.accordion-button', { hasText: 'Descriptive Element' }).click();
  await block.locator('input[placeholder="value"]').first().fill(wert);
}

test.describe('Rückgängig im Eigenschaften-Panel', () => {

  test('eine Änderung am Langnamen lässt sich zurücknehmen', async ({ page }) => {
    await vorbereiten(page);
    const vorher = (await modell(page)).longName;

    // der Bereich Identification ist von Haus aus offen, ein Klick schlösse ihn
    const feld = page.locator('#pp_identification_longName');
    await expect(feld).toBeVisible();
    await feld.fill('Neuer Langname');
    expect((await modell(page)).longName).toBe('Neuer Langname');

    await rueckgaengig(page);
    expect((await modell(page)).longName).toBe(vorher);
  });

  test('eine Änderung an einem Merkmal lässt sich zurücknehmen', async ({ page }) => {
    await vorbereiten(page);
    await merkmaleAnlegen(page, 1);

    await sollwertEintragen(page, 1, '42');
    expect((await modell(page)).merkmale).toEqual(['C_1=42']);

    await rueckgaengig(page);
    expect((await modell(page)).merkmale).toEqual(['C_1=0']);
  });

  test('das Löschen eines Merkmals ist ein Befehl und lässt sich zurücknehmen', async ({ page }) => {
    await vorbereiten(page);
    await merkmaleAnlegen(page, 3);
    await sollwertEintragen(page, 1, '100');
    await sollwertEintragen(page, 2, '200');
    await sollwertEintragen(page, 3, '300');

    // immer nur ein Merkmal ist aufgeklappt: C_2 wieder öffnen, dort sitzt sein Papierkorb
    await page.locator('.characteristics-properties').nth(1).locator('.accordion-button').first().click();
    await page.getByRole('button', { name: 'Remove characteristic C_2' }).click();

    expect((await modell(page)).merkmale).toEqual(['C_1=100', 'C_3=300']);
    // jedes verbliebene Feld zeigt den Wert seines eigenen Merkmals
    const angezeigt = await page.locator('.characteristics-properties').evaluateAll((bloecke) => bloecke.map((b) => ({
      kopf: b.querySelector('.accordion-button b').textContent.trim(),
      wert: b.querySelector('input[placeholder="value"]') ? b.querySelector('input[placeholder="value"]').value : null,
    })));
    expect(angezeigt.map((a) => a.kopf)).toEqual(['C_1', 'C_3']);
    angezeigt.filter((a) => a.wert !== null).forEach((a) => {
      expect(a.wert).toBe(a.kopf === 'C_1' ? '100' : '300');
    });

    await rueckgaengig(page);
    expect((await modell(page)).merkmale).toEqual(['C_1=100', 'C_2=200', 'C_3=300']);
  });

});
