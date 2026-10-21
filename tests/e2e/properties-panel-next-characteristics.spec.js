// tests/e2e/properties-panel-next-characteristics.spec.js
import { test, expect } from './support/test';
import { openPanel, select, field, stackSize, undo, businessObject, clone } from './helpers/panelNext';

/** New panel: characteristics as a table with a detail area (016 E7, 016b V1) */

const group = (page) => page.locator('[data-group-id="group-characteristics"]');
const rows = (page) => group(page).locator('.fpb-characteristics-list li');
const add = (page) => group(page).getByRole('button', { name: 'Add characteristic' }).first();

test.describe('New properties panel, characteristics', () => {

  test('lists the characteristics of the element in a table', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Temperatur');
  });

  test('a row shows name, setpoint with unit and the first actual value', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    const row = rows(page).first().locator('.fpb-characteristic-row');
    await expect(row.locator('.fpb-characteristic-row-name')).toContainText('Temperatur');
    await expect(row.locator('.fpb-characteristic-row-summary')).toHaveText('20 °C · 0');
  });

  test('a long text setpoint does not push the name out of the row', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    await field(page, 'characteristic-0-setpoint').fill('about room temperature as long as the air stays dry');
    const row = rows(page).first().locator('.fpb-characteristic-row');
    await expect(row.locator('.fpb-characteristic-row-summary')).toContainText('about room');
    const box = await row.evaluate((r) => {
      const of = (selector) => r.querySelector(selector).getBoundingClientRect();
      return { row: r.getBoundingClientRect().right, name: of('.fpb-characteristic-row-name').width, summary: of('.fpb-characteristic-row-summary').right };
    });
    expect(box.name).toBeGreaterThanOrEqual(80);
    expect(box.summary).toBeLessThanOrEqual(box.row);
  });

  test('the three tabs show the parts of Blatt 2 and the chosen one stays', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    // Descriptive is open first
    await expect(page.getByRole('tab', { name: 'Descriptive' })).toHaveAttribute('aria-selected', 'true');
    await expect(field(page, 'characteristic-0-setpoint')).toBeVisible();

    await page.getByRole('tab', { name: 'Category' }).click();
    await expect(field(page, 'characteristic-0-categoryLongName')).toBeVisible();
    await expect(field(page, 'characteristic-0-setpoint')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Relational' }).click();
    await expect(field(page, 'characteristic-0-view')).toBeVisible();

    await select(page, 'Erhitzen');
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    await expect(page.getByRole('tab', { name: 'Relational' })).toHaveAttribute('aria-selected', 'true');
    await expect(field(page, 'characteristic-0-view')).toBeVisible();
  });

  test('the arrow keys choose the next tab and move the focus with it', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    await page.getByRole('tab', { name: 'Descriptive' }).focus();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Relational' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Relational' })).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Category' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Relational' })).toBeFocused();
  });

  test('"+" adds C_n as one undo step and opens its detail', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Erhitzen');
    const before = await stackSize(page);

    await expect(group(page).locator('.fpb-characteristics-empty')).toHaveText('No characteristics yet. Add characteristic');
    await add(page).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('C_1');
    await expect(page.locator('.fpb-characteristic-detail')).toBeVisible();
    expect(await stackSize(page)).toBe(before + 1);

    await undo(page);
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator('.fpb-characteristic-detail')).toHaveCount(0);
  });

  test('setpoint takes a number with comma and a text (Blatt 2 §5.2)', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Erhitzen');
    await add(page).click();

    await field(page, 'characteristic-0-setpoint').fill('353,15');
    await expect.poll(async () => (await businessObject(page, 'Erhitzen')).characteristics[0].descriptiveElement.setpointValue.value).toBe(353.15);
    await expect(rows(page).first()).toContainText('353.15');

    await field(page, 'characteristic-0-setpoint').fill('flüssig');
    await expect.poll(async () => (await businessObject(page, 'Erhitzen')).characteristics[0].descriptiveElement.setpointValue.value).toBe('flüssig');
  });

  test('a row opens the detail of its characteristic, again closes it', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    await expect(page.locator('.fpb-characteristic-detail')).toBeVisible();
    await rows(page).first().getByRole('button').click();
    await expect(page.locator('.fpb-characteristic-detail')).toHaveCount(0);
  });

  test('remove takes the characteristic out, undo brings it back', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    await page.getByRole('button', { name: 'Remove characteristic' }).click();
    await expect(rows(page)).toHaveCount(0);

    await undo(page);
    await expect(rows(page)).toHaveCount(1);
  });

  // Review Focus 1
  test('the detail closes when undo takes away the open characteristic', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Erhitzen');
    await add(page).click();
    await add(page).click();
    await rows(page).nth(1).getByRole('button').click();

    await undo(page);
    await expect(rows(page)).toHaveCount(1);
    await expect(page.locator('.fpb-characteristic-detail')).toHaveCount(0);
  });

  // Review Focus 2
  test('text typed just before choosing another characteristic stays in the first one', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Erhitzen');
    await add(page).click();
    await add(page).click();
    await rows(page).nth(0).getByRole('button').click();

    await field(page, 'characteristic-0-setpointUnit').fill('K');
    await rows(page).nth(1).getByRole('button').click();
    await expect.poll(async () => {
      const list = (await businessObject(page, 'Erhitzen')).characteristics;
      return [list[0].descriptiveElement.setpointValue.unit, list[1].descriptiveElement.setpointValue.unit];
    }).toEqual(['K', '']);
  });

  test('in read-only mode there is neither "+" nor remove', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await expect(add(page)).toHaveCount(0);
    await rows(page).first().getByRole('button').click();
    await expect(page.getByRole('button', { name: 'Remove characteristic' })).toHaveCount(0);
    await expect(field(page, 'characteristic-0-setpoint')).toHaveAttribute('readonly', '');
  });

  const withValues = () => {
    const data = clone();
    const entry = data.find((e) => e.process && e.elementDataInformation.some((d) => d.name === 'Erhitzen'));
    const op = entry.elementDataInformation.find((d) => d.name === 'Erhitzen');
    op.characteristics = [{
      $type: 'fpbch:Characteristics',
      category: { $type: 'fpb:Identification', uniqueIdent: op.id + '_c1', shortName: 'C_1', longName: 'Temperatur' },
      descriptiveElement: {
        $type: 'fpbch:DescriptiveElement',
        setpointValue: { $type: 'fpbch:ValueWithUnit', value: 353, unit: 'K' },
        validityLimits: [
          { $type: 'fpbch:ValidityLimits', limitType: '', from: 0, to: 0 },
          { $type: 'fpbch:ValidityLimits', limitType: 'acceptance', from: 350, to: 356 }
        ],
        actualValues: [
          { $type: 'fpbch:ValueWithUnit', value: 352, unit: 'K' },
          { $type: 'fpbch:ValueWithUnit', value: 354, unit: 'K' }
        ]
      },
      relationalElement: { $type: 'fpbch:RelationalElement' }
    }];
    return data;
  };

  test('older limits go to their region, every actual value has its fields (016c)', async ({ page }) => {
    await openPanel(page, withValues());
    await select(page, 'Erhitzen');
    await expect(rows(page).first()).toContainText('352 (+1)');
    await rows(page).first().getByRole('button').click();

    // "acceptance" is the acceptance region; the empty default limit of older versions is left out
    await expect(field(page, 'characteristic-0-acceptance-from')).toHaveValue('350');
    await expect(field(page, 'characteristic-0-acceptance-to')).toHaveValue('356');
    await expect(page.locator('.fpb-other-limit')).toHaveCount(0);
    await expect(field(page, 'characteristic-0-actual-1-value')).toHaveValue('354');
    await expect(field(page, 'characteristic-0-actual-1-unit')).toHaveValue('K');
  });
});
