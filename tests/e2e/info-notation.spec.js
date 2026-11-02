import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';

/**
 * The notation reference in "Information" (016e D3, V14): every element of
 * VDI 3682 Blatt 1 with its symbol, its name and one sentence.
 */

async function start(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await new ImportPage(page).goto();
  return { errors };
}

const dialog = (page) => page.locator('dialog.fpb-info-dialog[open]');

test.describe('Notation', () => {

  test('Information explains the symbols of VDI 3682 in the tab Notation', async ({ page }) => {
    const { errors } = await start(page);
    await page.getByRole('button', { name: 'Show information and help', exact: true }).click();
    await expect(dialog(page).getByRole('tab')).toHaveText(['About', 'Notation', 'Keyboard Shortcuts', 'Help']);
    await dialog(page).getByRole('tab', { name: 'Notation' }).click();

    const entries = dialog(page).locator('.fpb-notation-entry');
    await expect(entries).toHaveCount(8);
    await expect(entries.locator('dt')).toHaveText([
      'Product', 'Energy', 'Information', 'Process operator', 'Technical resource', 'System limit', 'Flow', 'Usage'
    ]);
    await expect(dialog(page).locator('.fpb-notation-entry[data-id="processOperator"] dd'))
      .toHaveText('Converts products, energies and information into new ones; only process operators can be decomposed.');
    await expect(dialog(page).locator('.fpb-notation-flows')).toContainText('parallel flows share part of their way');
    await expect(dialog(page)).toContainText('VDI 3682 Blatt 1 (2015), section 4');

    // every symbol is drawn
    const sizes = await entries.locator('.fpb-notation-symbol').evaluateAll((symbols) => symbols.map((s) => {
      const r = s.getBoundingClientRect();
      const style = getComputedStyle(s);
      return r.width > 20 && r.height > 20 && (style.backgroundImage !== 'none' || !!s.querySelector('svg'));
    }));
    expect(sizes).toEqual(new Array(8).fill(true));

    await page.keyboard.press('Escape');
    await page.evaluate(() => window.fpbjs.get('fpbInfo').open('notation'));
    await expect(dialog(page).getByRole('tab', { name: 'Notation' })).toHaveAttribute('aria-selected', 'true');
    expect(errors).toEqual([]);
  });

  test('the symbols of the notation follow the accessible colour scheme', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.fpbjs.get('fpbInfo').open('notation'));
    const product = dialog(page).locator('.fpb-notation-entry[data-id="product"] .fpb-notation-symbol');
    const image = () => product.evaluate((s) => getComputedStyle(s).backgroundImage);
    const standard = await image();
    expect(standard).toContain('ed2028');
    await page.evaluate(() => document.documentElement.setAttribute('data-colors', 'accessible'));
    await expect.poll(image).toContain('E50026');
  });
});
