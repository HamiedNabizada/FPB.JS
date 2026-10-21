import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * How the canvas looks, light and dark (016c T4): recorded before the switch
 * from the copied diagram-js style sheet to the one of the package, compared
 * after it. Phase B2 task 13 records the new look of palette and menus on
 * purpose (--update-snapshots).
 */

async function open(page, colorScheme) {
  await page.emulateMedia({ colorScheme });
  await page.setViewportSize({ width: 1400, height: 900 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
  await page.evaluate(() => {
    window.fpbjs.get('canvas').zoom('fit-viewport');
    window.fpbjs.get('selection').select([]);
  });
  await page.evaluate(() => document.fonts.ready);
}

async function openTypeMenu(page) {
  await page.evaluate(() => {
    const element = window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.name === 'Rohstoff' && e.type !== 'label')[0];
    window.fpbjs.get('selection').select(element);
    window.fpbjs.get('contextPad').open(element);
  });
  await page.click('.djs-context-pad [data-action="change_type"]');
  await expect(page.locator('.djs-popup')).toBeVisible();
}

const shot = { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' };

/** Background colour and corner radius of a part, and the surface value of the design */
const look = (page, selector) => page.evaluate((selector) => {
  const part = document.querySelector(selector);
  const probe = document.createElement('div');
  probe.style.background = 'var(--fpb-surface)';
  part.parentNode.appendChild(probe);
  const surface = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const style = getComputedStyle(part);
  return { background: style.backgroundColor, surface, radius: parseFloat(style.borderTopLeftRadius) };
}, selector);

for (const scheme of ['light', 'dark']) {
  test.describe(`Canvas look (${scheme})`, () => {

    test('canvas with palette', async ({ page }) => {
      await open(page, scheme);
      await expect(page.locator('.djs-container.djs-parent')).toHaveScreenshot(`canvas-${scheme}.png`, shot);
    });

    test('context pad of an operator', async ({ page }) => {
      await open(page, scheme);
      await page.evaluate(() => {
        const element = window.fpbjs.get('elementRegistry')
          .filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
        window.fpbjs.get('selection').select(element);
        window.fpbjs.get('contextPad').open(element);
      });
      await expect(page.locator('.djs-context-pad.open')).toHaveScreenshot(`context-pad-${scheme}.png`, shot);
    });

    test('palette, context pad and type menu use the card look', async ({ page }) => {
      await open(page, scheme);
      const palette = await look(page, '.djs-palette');
      expect(palette.background).toBe(palette.surface);
      expect(palette.radius).toBeGreaterThanOrEqual(8);

      await openTypeMenu(page);
      const menu = await look(page, '.djs-popup');
      expect(menu.background).toBe(menu.surface);
      expect(menu.radius).toBeGreaterThanOrEqual(8);

      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        const element = window.fpbjs.get('elementRegistry')
          .filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
        window.fpbjs.get('selection').select(element);
        window.fpbjs.get('contextPad').open(element);
      });
      const pad = await look(page, '.djs-context-pad.open');
      expect(pad.background).toBe(pad.surface);
      expect(pad.radius).toBeGreaterThanOrEqual(8);
    });

    test('type menu of a state', async ({ page }) => {
      await open(page, scheme);
      await openTypeMenu(page);
      await expect(page.locator('.djs-popup')).toHaveScreenshot(`type-menu-${scheme}.png`, shot);
    });
  });
}
