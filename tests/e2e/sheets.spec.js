// tests/e2e/sheets.spec.js
import { test, expect, devices } from './support/test';
import basis from './fixtures/temperieren.json';

/**
 * Sheets on narrow touch screens (016f E2): properties, layers and the model
 * check open as one sheet from the bottom over the whole width; the canvas
 * gives it its height, so nothing on the canvas lies on the sheet.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function load(page, withModel = true) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
  if (withModel) {
    await page.evaluate((data) => new Promise((resolve) => {
      window.fpbjs.get('eventBus').once('import.done', () => resolve());
      window.fpbjs.get('eventBus').fire('FPBJS.import', { data });
      setTimeout(resolve, 8000);
    }), clone());
    await page.evaluate(() => window.fpbjs.get('fpbNotifications').clear());
  }
  return errors;
}

const openSheet = (page, name = 'test', title = 'Test') =>
  page.evaluate(({ name, title }) => window.fpbjs.get('fpbSheets').open(name, { title }), { name, title });

const box = (page, selector) => page.evaluate((s) => {
  const e = document.querySelector(s);
  return e ? e.getBoundingClientRect().toJSON() : null;
}, selector);

const pageSize = (page) => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

/** Drag the head of the sheet with the mouse: pointer events, as a finger gives them */
async function dragHead(page, toY) {
  const head = await box(page, '.fpb-sheet-head');
  const x = head.left + 40;
  const y = head.top + head.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, (y + toY) / 2, { steps: 4 });
  await page.mouse.move(x, toY, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

for (const [label, device] of [['phone', devices['Pixel 5']], ['tablet', devices['iPad (gen 7)']]]) {

  // defaultBrowserType may not be set inside a describe group
  const { defaultBrowserType, ...deviceOptions } = device;

  test.describe(`Sheets on a ${label}`, () => {
    test.use(deviceOptions);

    test('a sheet opens from the bottom over the whole width, at half the height', async ({ page }) => {
      const errors = await load(page);
      await openSheet(page);
      const sheet = page.locator('.fpb-sheet');
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('.fpb-sheet-title')).toHaveText('Test');
      const size = await pageSize(page);
      const b = await box(page, '.fpb-sheet');
      expect(b.left).toBe(0);
      expect(Math.round(b.width)).toBe(size.width);
      expect(Math.round(b.bottom)).toBe(size.height);
      expect(Math.abs(b.height - size.height / 2)).toBeLessThanOrEqual(2);
      expect(errors).toEqual([]);
    });

    test('the canvas gives the sheet its height, nothing lies on the sheet', async ({ page }) => {
      await load(page);
      await page.evaluate(() => window.fpbjs.get('fpbNotifications').show({ key: 'sheet', type: 'warning', title: 'A message', message: 'Above the sheet.' }));
      await openSheet(page);
      await expect(page.locator('.fpb-sheet')).toBeVisible();
      await page.waitForTimeout(400);
      const top = (await box(page, '.fpb-sheet')).top;
      for (const selector of ['#modeler-container', '.djs-palette', '.fpb-breadcrumbs', '.side-panels', '.fpb-notification', '.djs-minimap']) {
        const b = await box(page, selector);
        expect(b, selector).not.toBeNull();
        expect(b.bottom, selector).toBeLessThanOrEqual(top + 1);
      }
      // also what overflows its box: every point of the head belongs to the sheet
      const hits = await page.evaluate(() => {
        const head = document.querySelector('.fpb-sheet-head').getBoundingClientRect();
        return [8, head.width / 2, head.width - 22].map((x) => {
          const hit = document.elementFromPoint(x, head.top + head.height / 2);
          return !!(hit && hit.closest('.fpb-sheet'));
        });
      });
      expect(hits).toEqual([true, true, true]);
      const groups = await page.evaluate(() => Array.from(document.querySelectorAll('.fpb-toolbar-group')).map((g) => g.getBoundingClientRect().bottom));
      groups.forEach((bottom) => expect(bottom).toBeLessThanOrEqual(top + 1));
    });

    test('dragging the head makes the sheet taller up to just below the top, dragging it down closes it', async ({ page }) => {
      await load(page);
      await openSheet(page);
      await expect(page.locator('.fpb-sheet')).toBeVisible();
      const size = await pageSize(page);
      await dragHead(page, 10);
      expect(Math.abs((await box(page, '.fpb-sheet')).top - 56)).toBeLessThanOrEqual(2);
      await dragHead(page, size.height - 40);
      await expect(page.locator('.fpb-sheet')).toHaveCount(0);
      expect(await page.evaluate(() => window.fpbjs.get('fpbSheets').current())).toBeNull();
      // the canvas has the whole height again
      expect(Math.round((await box(page, '#modeler-container')).bottom)).toBe(size.height);
    });

    test('Escape and the cross close the sheet', async ({ page }) => {
      await load(page);
      await openSheet(page);
      await page.locator('.fpb-sheet-close').focus();
      await page.keyboard.press('Escape');
      await expect(page.locator('.fpb-sheet')).toHaveCount(0);
      await openSheet(page);
      await page.locator('.fpb-sheet-close').click();
      await expect(page.locator('.fpb-sheet')).toHaveCount(0);
    });

    test('a lower page keeps the sheet inside it', async ({ page }) => {
      await load(page);
      await openSheet(page);
      await dragHead(page, 10);
      const size = await pageSize(page);
      await page.setViewportSize({ width: size.width, height: Math.round(size.height / 2) });
      await page.waitForTimeout(300);
      const b = await box(page, '.fpb-sheet');
      expect(b.top).toBeGreaterThanOrEqual(56 - 1);
      expect(Math.round(b.bottom)).toBe(Math.round(size.height / 2));
    });
  });
}

test.describe('No sheets', () => {

  test('desktop and a tablet in landscape have no sheets', async ({ browser }) => {
    const desktop = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await load(desktop, false);
    await openSheet(desktop);
    expect(await desktop.evaluate(() => window.fpbjs.get('fpbSheets').isActive())).toBe(false);
    await expect(desktop.locator('.fpb-sheet')).toHaveCount(0);
    await desktop.close();

    const { defaultBrowserType, ...ipad } = devices['iPad (gen 7) landscape'];
    const context = await browser.newContext(ipad);
    const tablet = await context.newPage();
    await load(tablet, false);
    await openSheet(tablet);
    expect(await tablet.evaluate(() => window.fpbjs.get('fpbSheets').isActive())).toBe(false);
    await expect(tablet.locator('.fpb-sheet')).toHaveCount(0);
    await context.close();
  });
});
