import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Breadcrumbs of the layers on the canvas (016d V1): the path from the top
 * layer (named after the project) to the current one; earlier layers are
 * buttons, the current one is text. The test model has the top layer
 * "FPBJS_Project" and the decomposition of "Erhitzen".
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const ROOT = '55b4780e-6896-4e92-b184-858cf0cb5b32';

async function laden(page) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return { importer, fehler };
}

const crumbs = (page) => page.locator('nav.fpb-breadcrumbs');
const current = (page) => crumbs(page).locator('.fpb-breadcrumb-current');
const crumb = (page, name) => crumbs(page).getByRole('button', { name, exact: true });
const ebene = (page) => page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);

/** Decompose the operator `name` on the current layer; the new layer becomes current */
const decompose = (page, name) => page.evaluate((name) => {
  const operator = window.fpbjs.get('elementRegistry')
    .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0];
  window.fpbjs.get('modeling').decomposeProcessOperator(operator);
}, name);

test.describe('Breadcrumbs', () => {

  test('the path shows where the canvas is and a crumb opens its layer', async ({ page }) => {
    const { importer, fehler } = await laden(page);
    await importer.switchToChildLayer();
    await expect(crumb(page, 'FPBJS_Project')).toBeVisible();
    await expect(current(page)).toHaveText('Erhitzen');

    await crumb(page, 'FPBJS_Project').click();
    await expect.poll(() => ebene(page)).toBe(ROOT);
    await expect(current(page)).toHaveText('FPBJS_Project');
    await expect(crumbs(page).getByRole('button')).toHaveCount(0);
    expect(fehler).toEqual([]);
  });

  test('the current layer is text with aria-current, not a button', async ({ page }) => {
    const { importer } = await laden(page);
    await importer.switchToChildLayer();
    await expect(current(page)).toHaveAttribute('aria-current', 'page');
    await expect(crumb(page, 'Erhitzen')).toHaveCount(0);
    await expect(crumbs(page)).toHaveAttribute('aria-label', 'Layer path');
  });

  test('a switch through a crumb ends the undo history like the tree', async ({ page }) => {
    const { importer } = await laden(page);
    await importer.switchToChildLayer();
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('modeling').moveElements([operator], { x: 10, y: 0 });
    });
    expect(await page.evaluate(() => window.fpbjs.get('commandStack').canUndo())).toBe(true);
    await crumb(page, 'FPBJS_Project').click();
    await expect.poll(() => ebene(page)).toBe(ROOT);
    expect(await page.evaluate(() => window.fpbjs.get('commandStack').canUndo())).toBe(false);
  });

  test('with a single layer there are no breadcrumbs', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const importer = new ImportPage(page);
    await importer.goto();
    await expect(crumbs(page)).toBeHidden();

    // the test model without its decomposition: one layer
    const data = clone().filter((entry) => !(entry.process && entry.process.isDecomposedProcessOperator));
    data.forEach((entry) => {
      if (entry.process) {
        entry.process.consistsOfProcesses = [];
      }
      (entry.elementDataInformation || []).forEach((element) => delete element.decomposedView);
    });
    await importer.import(data);
    await expect.poll(() => ebene(page)).toBe(ROOT);
    await expect(crumbs(page)).toBeHidden();
  });

  test('a renamed operator shows its new name in the path', async ({ page }) => {
    const { importer } = await laden(page);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('modeling').updateLabel(operator, 'Aufheizen');
    });
    await importer.switchToChildLayer();
    await expect(current(page)).toHaveText('Aufheizen');
  });

  // Review Focus 2
  test('removing a decomposition takes it out of the path', async ({ page }) => {
    const { importer, fehler } = await laden(page);
    await importer.switchToChildLayer();
    await expect(current(page)).toHaveText('Erhitzen');
    await page.evaluate(() => {
      const systemLimit = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      window.fpbjs.get('fpbDelete').remove([systemLimit]);
    });
    await page.locator('.modal.show [data-answer="confirm"]').click();
    await expect.poll(() => ebene(page)).toBe(ROOT);
    await expect(crumbs(page)).toBeHidden();
    expect(fehler).toEqual([]);
  });

  // Review Focus 1
  test('a new import while deep in a decomposition shows the new model', async ({ page }) => {
    const { importer, fehler } = await laden(page);
    await importer.switchToChildLayer();
    await decompose(page, 'Vorwärmen');
    await expect(current(page)).toHaveText('Vorwärmen');

    await importer.import(clone());
    await expect.poll(() => ebene(page)).toBe(ROOT);
    await expect(current(page)).toHaveText('FPBJS_Project');
    await expect(crumbs(page).getByRole('button')).toHaveCount(0);
    expect(fehler).toEqual([]);
  });

  test('crumbs work in read-only mode', async ({ page }) => {
    const { importer } = await laden(page);
    await importer.switchToChildLayer();
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await crumb(page, 'FPBJS_Project').click();
    await expect.poll(() => ebene(page)).toBe(ROOT);
  });

  // Review Focus 4
  test('a deep path with long names stays on one line, right of the palette and at most half the canvas wide', async ({ page }) => {
    const { importer } = await laden(page);
    const long = (letter) => letter.repeat(60);
    const rename = (name, next) => page.evaluate(({ name, next }) => {
      const element = window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0];
      window.fpbjs.get('modeling').updateLabel(element, next);
    }, { name, next });

    await rename('Erhitzen', long('E'));
    await importer.switchToChildLayer();
    await rename('Vorwärmen', long('V'));
    await decompose(page, long('V'));
    // a new operator in the third layer, decomposed in turn: four layers
    await page.evaluate((name) => {
      const registry = window.fpbjs.get('elementRegistry');
      const systemLimit = registry.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const operator = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:ProcessOperator' });
      const created = window.fpbjs.get('modeling').createShape(operator,
        { x: systemLimit.x + systemLimit.width / 2, y: systemLimit.y + systemLimit.height / 2 }, systemLimit);
      window.fpbjs.get('modeling').updateLabel(created, name);
      window.fpbjs.get('modeling').decomposeProcessOperator(created);
    }, long('N'));

    await expect(current(page)).toHaveAttribute('title', long('N'));
    const box = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      return { nav: rect('nav.fpb-breadcrumbs'), palette: rect('.djs-palette'), canvas: rect('.djs-container.djs-parent') };
    });
    expect(box.nav.height).toBeLessThanOrEqual(40);
    expect(box.nav.left).toBeGreaterThanOrEqual(box.palette.right);
    expect(box.nav.width).toBeLessThanOrEqual(box.canvas.width / 2);
  });
});
