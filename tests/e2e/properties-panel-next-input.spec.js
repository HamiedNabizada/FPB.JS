import { test, expect } from './support/test';
import { openPanel, select, field, businessObject, clone } from './helpers/panelNext';

/**
 * New panel: input still waiting for the debounce when the user moves on
 * (final review of 016b B1). It belongs to the element and characteristic it
 * was typed in, and the field keeps what the user typed.
 */

const group = (page) => page.locator('[data-group-id="group-characteristics"]');
const rows = (page) => group(page).locator('.fpb-characteristics-list li');
const add = (page) => group(page).getByRole('button', { name: 'Add characteristic' }).first();
const longName = async (page, name) => (await businessObject(page, name)).identification.longName || '';
const characteristics = async (page, name) => (await businessObject(page, name)).characteristics || [];

const idOf = (page, name) => page.evaluate((name) => window.fpbjs.get('elementRegistry')
  .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0].id, name);

/** The test model with a characteristic "Druck" (2 bar) on `name` */
function withCharacteristic(data, name) {
  for (const entry of data) {
    const operator = (entry.elementDataInformation || []).find((d) => d.name === name);
    if (operator) {
      operator.characteristics = [{
        $type: 'fpbch:Characteristics',
        category: { $type: 'fpb:Identification', uniqueIdent: operator.id + '_c1', shortName: 'C_1', longName: 'Druck' },
        descriptiveElement: { $type: 'fpbch:DescriptiveElement', setpointValue: { $type: 'fpbch:ValueWithUnit', value: 2, unit: 'bar' } },
        relationalElement: { $type: 'fpbch:RelationalElement' }
      }];
    }
  }
  return data;
}

test.describe('New properties panel, pending input', () => {

  test('text typed for one element stays there when another one is clicked on the canvas', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Erhitzen');
    await field(page, 'longName').click();
    await page.keyboard.type('NurErhitzen');
    await page.locator(`.djs-element[data-element-id="${await idOf(page, 'Prüfen')}"]`).click({ force: true });

    await expect.poll(() => longName(page, 'Erhitzen')).toBe('NurErhitzen');
    await page.waitForTimeout(1000);
    expect(await longName(page, 'Prüfen')).toBe('');
  });

  test('text typed for one element stays there when the selection changes while the field keeps focus', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Erhitzen');
    await field(page, 'longName').click();
    await page.keyboard.type('NurErhitzen');
    await select(page, 'Prüfen');

    await expect.poll(() => longName(page, 'Erhitzen')).toBe('NurErhitzen');
    await page.waitForTimeout(1000);
    expect(await longName(page, 'Prüfen')).toBe('');
  });

  test('a pause after the decimal separator keeps the number the user types', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    await field(page, 'characteristic-0-setpoint').fill('');
    await field(page, 'characteristic-0-setpoint').click();
    await page.keyboard.type('1,');
    await page.waitForTimeout(1200);
    await page.keyboard.type('5');

    await expect.poll(async () => (await characteristics(page, 'Rohstoff'))[0].descriptiveElement.setpointValue.value).toBe(1.5);
    await expect(field(page, 'characteristic-0-setpoint')).toHaveValue('1,5');
  });

  test('"+" right after typing keeps the text and adds the characteristic', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    await field(page, 'characteristic-0-setpointUnit').fill('X');
    await add(page).click();

    await expect(rows(page)).toHaveCount(2);
    await page.waitForTimeout(1000);
    const list = await characteristics(page, 'Rohstoff');
    expect(list.length).toBe(2);
    expect(list[0].descriptiveElement.setpointValue.unit).toBe('X');
  });

  test('remove right after typing removes the characteristic', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openPanel(page);
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    // typing and the click in one go, without the field losing focus first
    await page.evaluate(() => new Promise((resolve) => {
      const input = document.querySelector('#bio-properties-panel-characteristic-0-setpointUnit');
      input.value = 'X';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        [...document.querySelectorAll('button')].find((b) => b.textContent === 'Remove characteristic').click();
        resolve();
      }, 150);
    }));

    await page.waitForTimeout(1000);
    expect(await characteristics(page, 'Rohstoff')).toEqual([]);
    await expect(rows(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('text typed in a characteristic stays there when another element with characteristics is selected', async ({ page }) => {
    await openPanel(page, withCharacteristic(clone(), 'Erhitzen'));
    await select(page, 'Rohstoff');
    await rows(page).first().getByRole('button').click();
    await field(page, 'characteristic-0-setpointUnit').fill('NurRohstoff');
    await select(page, 'Erhitzen');

    await expect.poll(async () => (await characteristics(page, 'Rohstoff'))[0].descriptiveElement.setpointValue.unit).toBe('NurRohstoff');
    await page.waitForTimeout(1000);
    expect((await characteristics(page, 'Erhitzen'))[0].descriptiveElement.setpointValue.unit).toBe('bar');
  });
});
