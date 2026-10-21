import { test, expect } from './support/test';

/**
 * Light and dark in the web app (016b V9, 016c T2, T5a): the first start
 * follows the system, a choice with the toggle is kept under fpbjs.theme and
 * wins; the old key fpb-theme, which app.js filled with "light" on every
 * first start, is not read.
 */

async function open(page) {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
}

const theme = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

/** The dark mode button, wherever the toolbar keeps it */
async function toggle(page) {
  const options = page.getByRole('button', { name: 'Show Options' });
  if (await options.count()) {
    await options.click();
  }
  await page.getByRole('button', { name: /Switch to (Dark|Light) Mode/ }).click();
}

test.describe('Light and dark', () => {

  test('the first start follows a dark system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    expect(await theme(page)).toBe('dark');
  });

  test('an old automatic "light" is passed over', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('fpb-theme', 'light'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    expect(await theme(page)).toBe('dark');
  });

  test('the scheme follows the system while nothing is chosen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);
    expect(await theme(page)).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => theme(page)).toBe('dark');
  });

  test('the toggle stores the choice and it wins over the system after a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    await toggle(page);
    expect(await theme(page)).toBe('light');
    expect(await page.evaluate(() => window.localStorage.getItem('fpbjs.theme'))).toBe('light');

    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    expect(await theme(page)).toBe('light');
  });
});
