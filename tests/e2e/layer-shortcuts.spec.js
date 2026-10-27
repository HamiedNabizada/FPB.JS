import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Alt+Down opens the layer of the selected decomposed operator, Alt+Up goes
 * to the parent layer (016d V5). In the test model "Erhitzen" on the top
 * layer is decomposed.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const ROOT = '55b4780e-6896-4e92-b184-858cf0cb5b32';
const CHILD = '9ca400c0-a373-48c0-9f13-37ce196cee29';

async function laden(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

/** Click an element by its name, as a user selects it */
async function klicke(page, name) {
  const punkt = await page.evaluate((name) => {
    const element = window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.name === name && !e.waypoints && e.type !== 'label')[0];
    const box = document.querySelector(`[data-element-id="${element.id}"]`).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, name);
  await page.mouse.click(punkt.x, punkt.y);
}

const ebene = (page) => page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);
const lage = (page, name) => page.evaluate((name) => {
  const element = window.fpbjs.get('elementRegistry')
    .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0];
  return { x: element.x, y: element.y };
}, name);

test.describe('Layer shortcuts', () => {

  test('Alt+Down opens the layer of the selected decomposed operator', async ({ page }) => {
    await laden(page);
    await klicke(page, 'Erhitzen');
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(() => ebene(page)).toBe(CHILD);
  });

  test('Alt+Up goes to the parent layer, on the top layer it does nothing', async ({ page }) => {
    const importer = await laden(page);
    await importer.switchToChildLayer();
    await klicke(page, 'Vorwärmen');
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => ebene(page)).toBe(ROOT);

    await klicke(page, 'Erhitzen');
    const vorher = await lage(page, 'Erhitzen');
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(300);
    expect(await ebene(page)).toBe(ROOT);
    expect(await lage(page, 'Erhitzen')).toEqual(vorher);
  });

  test('without a decomposed operator Alt+Down does nothing and moves nothing', async ({ page }) => {
    await laden(page);
    await klicke(page, 'Prüfen');
    const vorher = await lage(page, 'Prüfen');
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(300);
    expect(await ebene(page)).toBe(ROOT);
    expect(await lage(page, 'Prüfen')).toEqual(vorher);
  });

  // Review Focus 5
  test('Alt+Up in a field of the properties panel does not switch the layer', async ({ page }) => {
    const importer = await laden(page);
    await importer.switchToChildLayer();
    await page.locator('#propertiesPanelToggle').click();
    await klicke(page, 'Vorwärmen');
    const feld = page.locator('#bio-properties-panel-shortName');
    await feld.click();
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(300);
    expect(await ebene(page)).toBe(CHILD);
    await expect(feld).toBeFocused();
  });

  test('the help lists Alt+Up and Alt+Down', async ({ page }) => {
    await laden(page);
    await page.getByRole('button', { name: 'Show information and help', exact: true }).click();
    const dialog = page.locator('.modal.show');
    await dialog.getByText('Keyboard Shortcuts', { exact: true }).click();
    await expect(dialog).toContainText('Alt+↓');
    await expect(dialog).toContainText('Open the layer of the selected decomposed operator');
    await expect(dialog).toContainText('Alt+↑');
    await expect(dialog).toContainText('Go to the parent layer');
  });
});
