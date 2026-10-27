// tests/e2e/properties-panel-readonly.spec.js
import { test, expect } from './support/test';
import { openPanel, select, field, businessObject } from './helpers/panel';

/** New panel: read-only mode (027, 016b V10) and the copy button of the id (E5) */

const setReadOnly = (page, flag) => page.evaluate((flag) => window.fpbjs.get('readOnly').set(flag), flag);

test.describe('New properties panel, read-only', () => {

  test('fields stay readable and selectable but cannot change the model', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Erhitzen');
    await setReadOnly(page, true);

    await expect(field(page, 'longName')).toHaveAttribute('readonly', '');
    await expect(field(page, 'longName')).not.toHaveAttribute('disabled', '');
    await field(page, 'longName').click();
    await page.keyboard.type('Neu');
    await page.waitForTimeout(500);
    expect((await businessObject(page, 'Erhitzen')).identification.longName || '').toBe('');
  });

  // Review Focus 4
  test('switching read-only while the panel is open takes effect at once', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Erhitzen');
    await expect(field(page, 'longName')).not.toHaveAttribute('readonly', '');

    await setReadOnly(page, true);
    await expect(field(page, 'longName')).toHaveAttribute('readonly', '');

    await setReadOnly(page, false);
    await expect(field(page, 'longName')).not.toHaveAttribute('readonly', '');
  });

  test('the unique id has a copy button, also in read-only mode', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions only in Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openPanel(page);
    await select(page, 'Erhitzen');
    await setReadOnly(page, true);

    const id = await field(page, 'uniqueIdent').inputValue();
    await page.getByRole('button', { name: 'Copy unique ID' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id);
  });
});
