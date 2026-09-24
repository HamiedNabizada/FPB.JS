// tests/e2e/autosave.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Sicherung im Browser in der Web-App: nach Änderungen liegt das Modell im
 * localStorage, nach dem Neuladen wird es angeboten, "New model" räumt auf,
 * beim Verlassen mit ungespeicherten Änderungen warnt der Browser.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const KEY = 'fpbjs.autosave';

const sicherung = (page) => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), KEY);
const namen = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry')
  .filter((e) => e.businessObject && e.businessObject.name && e.type !== 'label')
  .map((e) => e.businessObject.name).sort());
const ungespeichert = (page) => page.evaluate(() => window.fpbjs.get('autosave').isDirty());
const verlassenWarnt = (page) => page.evaluate(() => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

/** Operator "Erhitzen" umbenennen, ein normaler Befehl */
const umbenennen = (page, name) => page.evaluate((name) => {
  const registry = window.fpbjs.get('elementRegistry');
  const operator = registry.filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
  window.fpbjs.get('modeling').updateLabel(operator, name);
}, name);

async function laden(page) {
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

test.describe('Sicherung im Browser', () => {

  test('ein importiertes Modell gilt als gespeichert, eine Änderung nicht', async ({ page }) => {
    await laden(page);

    expect(await ungespeichert(page)).toBe(false);
    expect(await verlassenWarnt(page)).toBe(false);
    expect((await sicherung(page)).model.length).toBeGreaterThan(0);

    await umbenennen(page, 'Erwärmen');
    await expect.poll(async () => JSON.stringify((await sicherung(page)).model)).toContain('Erwärmen');
    expect(await ungespeichert(page)).toBe(true);
    expect(await verlassenWarnt(page)).toBe(true);
  });

  test('ein Ebenenwechsel ist keine Änderung', async ({ page }) => {
    await laden(page);

    await page.evaluate(() => {
      const fpb = window.fpbjs;
      const operator = fpb.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.decomposedView)[0];
      fpb.get('modeling').switchProcess(operator.businessObject.decomposedView);
    });
    await page.evaluate(() => window.fpbjs.get('autosave').flush());

    expect(await ungespeichert(page)).toBe(false);
  });

  test('nach dem Neuladen wird die Sicherung angeboten und lässt sich wiederherstellen', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erwärmen');
    await page.evaluate(() => window.fpbjs.get('autosave').flush());

    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);

    const hinweis = page.locator('.autosave-notice');
    await expect(hinweis).toBeVisible();
    await expect(hinweis).toContainText('Unsaved model found');
    expect(await namen(page)).toEqual([]);

    await hinweis.getByRole('button', { name: 'Restore' }).click();
    await expect(hinweis).toHaveCount(0);
    await expect.poll(() => namen(page)).toContain('Erwärmen');

    // wiederhergestellt ist noch in keiner Datei
    expect(await ungespeichert(page)).toBe(true);
  });

  test('Verwerfen lässt die Zeichenfläche leer und die Sicherung ist weg', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erwärmen');
    await page.evaluate(() => window.fpbjs.get('autosave').flush());

    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    await page.locator('.autosave-notice').getByRole('button', { name: 'Discard' }).click();

    await expect(page.locator('.autosave-notice')).toHaveCount(0);
    expect(await sicherung(page)).toBeNull();
    expect(await namen(page)).toEqual([]);
  });

  test('New model fragt bei ungespeicherten Änderungen, leert alles und lässt neu modellieren', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erwärmen');

    await page.getByRole('button', { name: 'Show Options' }).click();
    await page.locator('#newModelButton').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Start a new model?');
    await dialog.getByRole('button', { name: 'Yes, proceed' }).click();

    await expect(dialog).toHaveCount(0);
    expect(await namen(page)).toEqual([]);
    expect(await sicherung(page)).toBeNull();
    expect(await ungespeichert(page)).toBe(false);
    await expect(page.locator('#openLayerButton')).toHaveCount(0);

    // Neu anfangen: das erste Element legt wieder ein Projekt an
    const modell = await page.evaluate(() => {
      const fpb = window.fpbjs;
      const modeling = fpb.get('modeling');
      const limit = modeling.createShape({ type: 'fpb:SystemLimit' }, { x: 400, y: 300 }, fpb.get('canvas').getRootElement());
      modeling.createShape({ type: 'fpb:ProcessOperator' }, { x: 400, y: 300 }, limit);
      fpb.get('eventBus').fire('dataStore.updateAll', {});
      return {
        prozesse: fpb.getProcesses().filter((p) => p.process).length,
        projekt: Boolean(fpb.getProjectDefinition()),
      };
    });
    expect(modell).toEqual({ prozesse: 1, projekt: true });
    await expect.poll(async () => (await sicherung(page)) !== null).toBe(true);
  });

  test('ohne Änderungen startet New model ohne Rückfrage', async ({ page }) => {
    await laden(page);

    await page.getByRole('button', { name: 'Show Options' }).click();
    await page.locator('#newModelButton').click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await namen(page)).toEqual([]);
  });

  test('ein Download des ganzen Modells gilt als gespeichert', async ({ page }) => {
    await laden(page);
    await umbenennen(page, 'Erwärmen');
    await page.evaluate(() => window.fpbjs.get('autosave').flush());
    expect(await ungespeichert(page)).toBe(true);

    await page.evaluate(() => window.fpbjs.get('eventBus').fire('model.downloaded', { format: 'json' }));
    expect(await ungespeichert(page)).toBe(false);
    expect(await verlassenWarnt(page)).toBe(false);
  });
});
