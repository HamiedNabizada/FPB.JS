import { test, expect } from './support/test';
import { openPanel, select, field, undo, clone } from './helpers/panelNext';

/**
 * Validity limits by the regions of VDI 3682 Blatt 2 Abschn. 5.2: acceptance
 * region and permitted rejection region, each with a lower and an upper
 * limit; outside the permitted rejection region the value is not permissible
 * (016c decisions 3, 8, T8, T9). In the test model "Rohstoff" has the
 * characteristic "Temperatur".
 */

/** Undo steps since `from`: nested commands share the id of their step */
const stepsSince = (page, from) => page.evaluate((from) => new Set(window.fpbjs.get('commandStack')._stack
  .slice(from + 1, window.fpbjs.get('commandStack')._stackIdx + 1).map((action) => action.id)).size, from);
const stackIndex = (page) => page.evaluate(() => window.fpbjs.get('commandStack')._stackIdx);

const limits = (page) => page.evaluate(() => {
  const state = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Rohstoff' && e.type !== 'label')[0];
  const list = state.businessObject.characteristics[0].descriptiveElement.validityLimits;
  return JSON.parse(JSON.stringify((Array.isArray(list) ? list : [list]).filter(Boolean)
    .map((l) => ({ limitType: l.limitType, from: l.from, to: l.to }))));
});

/** The test model with these limits at "Temperatur" of "Rohstoff" */
function withLimits(list) {
  const data = clone();
  for (const entry of data) {
    // the copy in the decomposition has no characteristics
    const state = (entry.elementDataInformation || []).find((d) => d.name === 'Rohstoff' && d.characteristics && d.characteristics.length);
    if (state) {
      state.characteristics[0].descriptiveElement.validityLimits = list.map((l) => Object.assign({ $type: 'fpbch:ValidityLimits' }, l));
    }
  }
  return data;
}

async function openTemperatur(page, data) {
  await openPanel(page, data);
  await select(page, 'Rohstoff');
  await page.locator('.fpb-characteristic-row').first().click();
}

test.describe('New properties panel, validity limits', () => {

  test('both regions can be set and cleared, one undo step each', async ({ page }) => {
    await openTemperatur(page);
    const before = await stackIndex(page);

    await field(page, 'characteristic-0-acceptance-from').fill('350');
    await expect.poll(() => limits(page)).toEqual([{ limitType: 'acceptance region', from: 350 }]);
    await field(page, 'characteristic-0-permitted-to').fill('360,5');
    await expect.poll(() => limits(page)).toEqual([
      { limitType: 'acceptance region', from: 350 },
      { limitType: 'permitted rejection region', to: 360.5 }
    ]);
    expect(await stepsSince(page, before)).toBe(2);

    await field(page, 'characteristic-0-acceptance-from').fill('');
    await expect.poll(() => limits(page)).toEqual([{ limitType: 'permitted rejection region', to: 360.5 }]);

    await undo(page);
    await expect.poll(() => limits(page)).toEqual([
      { limitType: 'acceptance region', from: 350 },
      { limitType: 'permitted rejection region', to: 360.5 }
    ]);
    await expect(field(page, 'characteristic-0-acceptance-from')).toHaveValue('350');
  });

  test('an old "acceptance" limit shows as acceptance region', async ({ page }) => {
    await openTemperatur(page, withLimits([{ limitType: 'acceptance', from: 350, to: 356 }]));
    await expect(field(page, 'characteristic-0-acceptance-from')).toHaveValue('350');
    await expect(field(page, 'characteristic-0-acceptance-to')).toHaveValue('356');
    await expect(page.locator('.fpb-other-limit')).toHaveCount(0);
  });

  test('a text in a limit is refused at the field', async ({ page }) => {
    await openTemperatur(page);
    await field(page, 'characteristic-0-acceptance-from').fill('warm');
    await expect(page.locator('[data-entry-id="characteristic-0-acceptance-from"]')).toContainText('A limit is a number.');
    await page.waitForTimeout(800);
    expect(await limits(page)).toEqual([{ limitType: '', from: 0, to: 0 }]);
  });

  test('other limits are shown as text and can be removed', async ({ page }) => {
    await openTemperatur(page, withLimits([{ limitType: 't', from: 1, to: 2 }]));
    const other = page.locator('.fpb-other-limit');
    await expect(other).toContainText('t');
    await expect(other).toContainText('1');
    await expect(other).toContainText('2');
    expect(await other.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('none');

    await other.getByRole('button', { name: 'Remove limit' }).click();
    await expect.poll(() => limits(page)).toEqual([]);
  });

  test('a single object instead of a list is read and becomes a list on the first edit', async ({ page }) => {
    await openPanel(page);
    await page.evaluate(() => {
      const state = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Rohstoff' && e.type !== 'label')[0];
      const factory = window.fpbjs.get('fpbFactory');
      state.businessObject.characteristics[0].descriptiveElement.validityLimits = factory.create('fpbch:ValidityLimits', { limitType: 'acceptance', from: 350, to: 356 });
    });
    await select(page, 'Rohstoff');
    await page.locator('.fpb-characteristic-row').first().click();
    await expect(field(page, 'characteristic-0-acceptance-to')).toHaveValue('356');

    await field(page, 'characteristic-0-acceptance-to').fill('357');
    await expect.poll(() => page.evaluate(() => {
      const state = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Rohstoff' && e.type !== 'label')[0];
      const list = state.businessObject.characteristics[0].descriptiveElement.validityLimits;
      return Array.isArray(list) && list.length === 1 && list[0].to;
    })).toBe(357);
  });

  test('in read-only mode limits are readonly and there is no remove', async ({ page }) => {
    await openTemperatur(page, withLimits([{ limitType: 'acceptance', from: 350, to: 356 }, { limitType: 't', from: 1, to: 2 }]));
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await expect(field(page, 'characteristic-0-acceptance-from')).toHaveAttribute('readonly', '');
    await expect(page.getByRole('button', { name: 'Remove limit' })).toHaveCount(0);
  });
});
