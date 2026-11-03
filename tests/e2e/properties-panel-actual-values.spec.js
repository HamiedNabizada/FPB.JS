import { test, expect } from './support/test';
import { openPanel, select, field, undo } from './helpers/panel';

/**
 * Actual values as a list (016c decision 9): each with value and unit,
 * editable, removable, "Add" appends a row that reaches the model with its
 * first input (016g B1). Blatt 2 wants a location and time
 * stamp per actual value; format v1 has no room for it (020a). In the test
 * model "Temperatur" of "Rohstoff" has the actual value 0.
 */

const actuals = (page) => page.evaluate(() => {
  const state = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Rohstoff' && e.type !== 'label')[0];
  const list = state.businessObject.characteristics[0].descriptiveElement.actualValues;
  return (Array.isArray(list) ? list : [list]).filter(Boolean).map((v) => ({ value: v.value, unit: v.unit || '' }));
});
const stackIndex = (page) => page.evaluate(() => window.fpbjs.get('commandStack')._stackIdx);
const stepsSince = (page, from) => page.evaluate((from) => new Set(window.fpbjs.get('commandStack')._stack
  .slice(from + 1, window.fpbjs.get('commandStack')._stackIdx + 1).map((action) => action.id)).size, from);

async function openTemperatur(page) {
  await openPanel(page);
  await select(page, 'Rohstoff');
  await page.locator('.fpb-characteristic-row').first().click();
}

test.describe('New properties panel, actual values', () => {

  test('actual values can be added, edited and removed, one undo step each', async ({ page }) => {
    await openTemperatur(page);
    const before = await stackIndex(page);

    await page.getByRole('button', { name: 'Add actual value' }).click();
    await expect(field(page, 'characteristic-0-actual-1-value')).toBeVisible();
    expect(await actuals(page)).toEqual([{ value: 0, unit: '' }]);
    await field(page, 'characteristic-0-actual-1-value').fill('21,5');
    await field(page, 'characteristic-0-actual-1-unit').fill('°C');
    await expect.poll(() => actuals(page)).toEqual([{ value: 0, unit: '' }, { value: 21.5, unit: '°C' }]);

    await page.getByRole('button', { name: 'Remove actual value 1' }).click();
    await expect.poll(() => actuals(page)).toEqual([{ value: 21.5, unit: '°C' }]);
    expect(await stepsSince(page, before)).toBe(3);

    await undo(page);
    await expect.poll(() => actuals(page)).toEqual([{ value: 0, unit: '' }, { value: 21.5, unit: '°C' }]);
  });

  test('the row summary counts further actual values', async ({ page }) => {
    await openTemperatur(page);
    await page.getByRole('button', { name: 'Add actual value' }).click();
    await field(page, 'characteristic-0-actual-1-value').fill('3');
    await expect(page.locator('.fpb-characteristic-row-summary').first()).toContainText('(+1)');
  });

  // 016g B1
  test('Add shows an empty row that reaches the model only with the first input', async ({ page }) => {
    await openTemperatur(page);
    await page.getByRole('button', { name: 'Add actual value' }).click();
    await expect(field(page, 'characteristic-0-actual-1-value')).toBeVisible();
    await page.waitForTimeout(400);
    expect(await actuals(page)).toEqual([{ value: 0, unit: '' }]);

    await field(page, 'characteristic-0-actual-1-value').fill('7');
    await expect.poll(() => actuals(page)).toEqual([{ value: 0, unit: '' }, { value: 7, unit: '' }]);
    await expect(field(page, 'characteristic-0-actual-1-value')).toBeFocused();
  });

  test('an added row left empty is not saved', async ({ page }) => {
    await openTemperatur(page);
    await page.getByRole('button', { name: 'Add actual value' }).click();
    await expect(field(page, 'characteristic-0-actual-1-value')).toBeVisible();
    await select(page, 'Erhitzen');
    await select(page, 'Rohstoff');
    await page.locator('.fpb-characteristic-row').first().click();
    await expect(field(page, 'characteristic-0-actual-0-value')).toBeVisible();
    await expect(field(page, 'characteristic-0-actual-1-value')).toHaveCount(0);
    expect(await actuals(page)).toEqual([{ value: 0, unit: '' }]);
  });

  // final review 016g, I2: Backspace or the undo of the field, not only the
  // undo of the canvas
  test('emptying an added row with the keyboard takes it out of the model and keeps the row', async ({ page }) => {
    await openTemperatur(page);
    await page.getByRole('button', { name: 'Add actual value' }).click();
    const value = field(page, 'characteristic-0-actual-1-value');
    await value.fill('7');
    await expect.poll(() => actuals(page)).toEqual([{ value: 0, unit: '' }, { value: 7, unit: '' }]);
    await value.press('Backspace');
    await expect.poll(() => actuals(page)).toEqual([{ value: 0, unit: '' }]);
    await expect(value).toBeVisible();
    await expect(value).toBeFocused();
    await expect(page.locator('.fpb-characteristic-row-summary').first()).not.toContainText('(+1)');

    await value.fill('8');
    await expect.poll(() => actuals(page)).toEqual([{ value: 0, unit: '' }, { value: 8, unit: '' }]);
    await value.press('Control+z');
    await expect(value).toHaveValue('');
    await expect.poll(() => actuals(page)).toEqual([{ value: 0, unit: '' }]);
  });

  // review focus 2
  test('undo after the first input removes row and value in one step', async ({ page }) => {
    await openTemperatur(page);
    await page.getByRole('button', { name: 'Add actual value' }).click();
    await field(page, 'characteristic-0-actual-1-value').fill('7');
    await expect.poll(() => actuals(page)).toEqual([{ value: 0, unit: '' }, { value: 7, unit: '' }]);
    await undo(page);
    await expect.poll(() => actuals(page)).toEqual([{ value: 0, unit: '' }]);
    await expect(field(page, 'characteristic-0-actual-1-value')).toHaveCount(0);
  });

  test('in read-only mode there is neither Add nor remove', async ({ page }) => {
    await openTemperatur(page);
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await expect(field(page, 'characteristic-0-actual-0-value')).toHaveAttribute('readonly', '');
    await expect(page.getByRole('button', { name: 'Add actual value' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Remove actual value/ })).toHaveCount(0);
  });
});
