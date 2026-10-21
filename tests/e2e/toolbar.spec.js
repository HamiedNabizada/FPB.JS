import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Toolbar in three groups and the layers card (016c decisions 11, 12, T7a):
 * no options menu any more; the layers open in the toolbar column, which
 * stays within 320 px (the AML editor plugin limits it).
 */

async function open(page) {
  await page.setViewportSize({ width: 1500, height: 900 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
}

const group = (page, name) => page.locator('.layerPanel .fpb-toolbar-group[data-group="' + name + '"]');

test.describe('Toolbar', () => {

  test('the toolbar shows three groups and no options menu', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: /Show Options|Hide Options/ })).toHaveCount(0);
    await expect(group(page, 'file').getByRole('button', { name: 'New model' })).toBeVisible();
    await expect(group(page, 'file').locator('#importOptionsButton')).toBeVisible();
    await expect(group(page, 'work').locator('#openLayerButton')).toBeVisible();
    await expect(group(page, 'work').locator('#openValidationButton')).toBeVisible();
    await expect(group(page, 'work').getByRole('button', { name: 'Search all layers' })).toBeVisible();
    await expect(group(page, 'view').getByRole('button', { name: /Switch to (Dark|Light) Mode/ })).toBeVisible();
    await expect(group(page, 'view').getByRole('button', { name: 'Show information and help' })).toBeVisible();
  });

  test('Layers marks the current layer and counts the operators of a decomposition', async ({ page }) => {
    await open(page);
    const button = page.locator('#openLayerButton');
    await expect(button).toHaveAttribute('aria-label', 'Show layers');
    await button.click();
    await expect(button).toHaveAttribute('aria-label', 'Hide layers');
    await expect(button).toHaveAttribute('aria-pressed', 'true');

    const layers = page.locator('.fpb-layers');
    await expect(layers).toContainText('Layers');
    await expect(layers.locator('[aria-current="true"]')).toBeVisible();
    await expect(layers.locator('.arborist-node', { hasText: 'Erhitzen' })).toContainText('2 operators');
    await expect(layers.locator('.fpb-layers-project')).toContainText('FPBJS_Project');
  });

  test('the toolbar column with Layers open stays within 320 px', async ({ page }) => {
    await open(page);
    await page.locator('#openLayerButton').click();
    await expect(page.locator('.fpb-layers')).toBeVisible();
    expect((await page.locator('#layer-container').boundingBox()).width).toBeLessThanOrEqual(320);
  });

  test('a long layer name does not widen Layers', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('modeling').updateLabel(operator, 'E'.repeat(60));
    });
    await page.locator('#openLayerButton').click();
    const layers = page.locator('.fpb-layers');
    await expect(layers).toBeVisible();
    expect(await layers.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect((await page.locator('#layer-container').boundingBox()).width).toBeLessThanOrEqual(320);
  });
});
