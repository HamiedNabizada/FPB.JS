// tests/e2e/properties-panel-next.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Das neue Eigenschaften-Panel (Preact, @bpmn-io/properties-panel).
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function vorbereiten(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  // starts closed, like the old panel
  await expect(page.locator('#propertiesPanelToggle')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#propertiesPanelToggle').click();
  await expect(page.locator('.fpb-properties.open')).toBeVisible();
}

const auswaehlen = (page, name) => page.evaluate((name) => {
  const element = window.fpbjs.get('elementRegistry')
    .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0];
  window.fpbjs.get('selection').select(element);
}, name);

const kopf = (page) => page.locator('.bio-properties-panel-header');
const feld = (page, id) => page.locator(`#bio-properties-panel-${id}`);
const stapel = (page) => page.evaluate(() => window.fpbjs.get('commandStack')._stackIdx + 1);
const rueckgaengig = (page) => page.evaluate(() => window.fpbjs.get('commandStack').undo());

test.describe('Neues Eigenschaften-Panel', () => {

  test('zeigt ohne Auswahl die Ebene und mit Auswahl Typ und Name im Kopf', async ({ page }) => {
    await vorbereiten(page);
    await expect(kopf(page)).toContainText('Process');
    await expect(kopf(page)).toContainText('Top level');

    await auswaehlen(page, 'Erhitzen');
    await expect(kopf(page)).toContainText('Process operator');
    await expect(kopf(page)).toContainText('Erhitzen');
    await expect(feld(page, 'shortName')).toHaveValue('Erhitzen');
  });

  test('Umbenennen im Panel ist ein Rückgängig-Schritt und ändert die Zeichenfläche', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Erhitzen');
    const vorher = await stapel(page);

    await feld(page, 'shortName').fill('');
    await feld(page, 'shortName').pressSequentially('Erwärmen', { delay: 30 });
    await expect.poll(() => stapel(page)).toBe(vorher + 1);
    await expect(kopf(page)).toContainText('Erwärmen');
    await expect(page.locator('.djs-element .djs-label', { hasText: 'Erwärmen' }).first()).toBeAttached();

    await rueckgaengig(page);
    await expect(feld(page, 'shortName')).toHaveValue('Erhitzen');
    await expect(kopf(page)).toContainText('Erhitzen');
  });

  test('Langname: Eingabe und Rückgängig', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Erhitzen');

    await feld(page, 'longName').fill('Erhitzen auf 80 Grad');
    await expect.poll(() => page.evaluate(() => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === 'Erhitzen' && x.type !== 'label')[0];
      return e.businessObject.identification.longName;
    })).toBe('Erhitzen auf 80 Grad');

    await rueckgaengig(page);
    await expect(feld(page, 'longName')).toHaveValue('');
  });

  test('eine Umbenennung auf der Zeichenfläche erscheint im Panel', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Erhitzen');

    await page.evaluate(() => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === 'Erhitzen' && x.type !== 'label')[0];
      window.fpbjs.get('modeling').updateLabel(e, 'Aufwärmen');
    });
    await expect(feld(page, 'shortName')).toHaveValue('Aufwärmen');
  });

  test('Systemgrenze hat ihren Namen, Mehrfachauswahl einen Hinweis', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Aufheizen mit Prüfung');
    await expect(kopf(page)).toContainText('System limit');
    await expect(feld(page, 'systemLimitName')).toHaveValue('Aufheizen mit Prüfung');

    await page.evaluate(() => {
      const r = window.fpbjs.get('elementRegistry');
      const namen = ['Erhitzen', 'Prüfen'];
      window.fpbjs.get('selection').select(r.filter((e) => e.businessObject && namen.includes(e.businessObject.name) && e.type !== 'label'));
    });
    await expect(page.locator('.bio-properties-panel-placeholder')).toContainText('Multiple elements');
  });

  test('der Umschalter blendet das Panel aus und merkt sich das', async ({ page }) => {
    await vorbereiten(page);
    await page.locator('#propertiesPanelToggle').click();
    await expect(page.locator('.fpb-properties-body')).toHaveCount(0);

    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    await expect(page.locator('#propertiesPanelToggle')).toHaveAttribute('aria-expanded', 'false');

    // und offen bleibt es nach dem Öffnen ebenso
    await page.locator('#propertiesPanelToggle').click();
    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    await expect(page.locator('#propertiesPanelToggle')).toHaveAttribute('aria-expanded', 'true');
  });
});
