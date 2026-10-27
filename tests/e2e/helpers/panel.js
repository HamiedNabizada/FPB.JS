// tests/e2e/helpers/panel.js
import { ImportPage } from '../pages/ImportPage';
import basis from '../fixtures/temperieren.json';

/** Helpers for the properties panel (Preact, 016b) */

export const clone = () => JSON.parse(JSON.stringify(basis));

export async function openPanel(page, data = clone()) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(data);
  const toggle = page.locator('#propertiesPanelToggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await page.locator('.fpb-properties.open').waitFor();
  return importer;
}

export const select = (page, name) => page.evaluate((name) => {
  const element = window.fpbjs.get('elementRegistry')
    .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0];
  window.fpbjs.get('selection').select(element);
}, name);

export const field = (page, id) => page.locator(`#bio-properties-panel-${id}`);
export const header = (page) => page.locator('.fpb-panel-header');
export const stackSize = (page) => page.evaluate(() => window.fpbjs.get('commandStack')._stackIdx + 1);
export const undo = (page) => page.evaluate(() => window.fpbjs.get('commandStack').undo());

/** Plain copy of the business object of the element with that name */
export const businessObject = (page, name) => page.evaluate((name) => {
  const element = window.fpbjs.get('elementRegistry')
    .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0];
  const bo = element.businessObject;
  return JSON.parse(JSON.stringify({ name: bo.name, identification: bo.identification, characteristics: bo.characteristics }));
}, name);
