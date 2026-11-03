import fs from 'fs';
import path from 'path';
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

const group = (page, name) => page.locator('.fpb-toolbar .fpb-toolbar-group[data-group="' + name + '"]');

test.describe('Toolbar', () => {

  // 016e D2, V11; "AML file" only while an AML file is kept
  test('the file group holds New model, Open, Save, Export and AML file in this order', async ({ page }) => {
    await open(page);
    const ids = () => group(page, 'file').locator('button').evaluateAll((buttons) => buttons.map((b) => b.id));
    expect(await ids()).toEqual(['newModelButton', 'openFileButton', 'saveFileButton', 'exportButton']);

    const aml = fs.readFileSync(path.join(__dirname, '..', 'unit', 'aml', 'oracle', 'inputs', 'generated', 'mixed.aml'), 'utf8');
    await page.evaluate((text) => window.fpbjs.get('amlSupport').importAml(text, { fileName: 'Anlage.aml' }), aml);
    await expect(group(page, 'file').locator('#amlOverviewButton')).toBeVisible({ timeout: 15000 });
    expect(await ids()).toEqual(['newModelButton', 'openFileButton', 'saveFileButton', 'exportButton', 'amlOverviewButton']);
  });

  // 016f E1, V6: no React root in the toolbar container
  test('the toolbar is built without React', async ({ page }) => {
    await open(page);
    await expect(page.locator('#layer-container .fpb-toolbar')).toBeVisible();
    const react = await page.evaluate(() => {
      const container = document.getElementById('layer-container');
      return {
        global: typeof window.React,
        root: Object.keys(container).some((key) => key.startsWith('__reactContainer')),
        marked: document.querySelectorAll('[data-reactroot]').length
      };
    });
    expect(react).toEqual({ global: 'undefined', root: false, marked: 0 });
  });

  // 016f E1, V3 and plan decision 3: the tree stays, only hidden
  test('Layers keeps its tree when closed and opened again', async ({ page }) => {
    await open(page);
    const button = page.locator('#openLayerButton');
    const layers = page.locator('.fpb-layers');
    await button.click();
    await layers.locator('.fpb-layers-search').fill('Erh');
    await button.click();
    await expect(layers).toHaveAttribute('hidden', '');
    await button.click();
    await expect(layers).toBeVisible();
    await expect(layers.locator('.fpb-layers-search')).toHaveValue('Erh');

    // with the keyboard the focus stays on the button (WebKit does not focus a clicked button)
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(layers).toHaveAttribute('hidden', '');
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(layers).toBeVisible();
    await expect(button).toBeFocused();
  });

  // 016f E1, V2: the name beside the button, as the palette does it
  test('hovering a button shows its name beside it', async ({ page }) => {
    await open(page);
    const button = page.locator('#openSearchButton');
    const tip = page.locator('.fpb-toolbar-tip:visible');
    await button.hover();
    await expect(tip).toHaveText(/^Search all layers \((Ctrl|⌘)\+F\)$/, { timeout: 1000 });
    const tipBox = await tip.boundingBox();
    const buttonBox = await button.boundingBox();
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(buttonBox.x);
    expect(Math.abs((tipBox.y + tipBox.height / 2) - (buttonBox.y + buttonBox.height / 2))).toBeLessThanOrEqual(1);
    await page.mouse.move(5, 850);
    await expect(tip).toHaveCount(0);
  });

  test('the keyboard shows the name at once and Escape hides it', async ({ page }) => {
    await open(page);
    // the check list stays open while the focus is in the toolbar
    await page.locator('#openValidationButton').click();
    await expect(page.locator('.fpb-validation-panel.open')).toBeVisible();
    await page.mouse.move(5, 850);
    // whoever else listens gets Escape untouched (016g, gap of E1); the
    // window hears it after the document, where the tooltip listens
    await page.evaluate(() => {
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          window.__escapePrevented = event.defaultPrevented;
        }
      });
    });
    await page.locator('#saveFileButton').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#exportButton')).toBeFocused();
    const tip = page.locator('.fpb-toolbar-tip:visible');
    await expect(tip).toHaveText('Export', { timeout: 200 });
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    expect(await page.evaluate(() => window.__escapePrevented)).toBe(false);
    await expect(page.locator('#exportButton')).toBeFocused();
    await expect(page.locator('.fpb-validation-panel.open')).toBeVisible();
  });

  // 016g E2
  test('an open name follows a changed name of its button', async ({ page }) => {
    await open(page);
    const button = page.locator('#openValidationButton');
    await page.locator('#openLayerButton').focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    const tip = page.locator('.fpb-toolbar-tip:visible');
    await expect(tip).toHaveText(await button.getAttribute('aria-label'));
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Prüfen')[0];
      window.fpbjs.get('modeling').moveElements([operator], { x: 900, y: 0 });
    });
    await expect(button.locator('.fpb-validation-count')).toHaveText('1');
    await expect(tip).toHaveText(await button.getAttribute('aria-label'));
  });

  // 016g, gap of E1: the error boundary of the toolbar
  test('a toolbar that fails says so instead of vanishing', async ({ page }) => {
    await open(page);
    // the tree of Layers reads the layers while it is drawn; opening Layers
    // draws the toolbar again
    await page.evaluate(() => {
      window.fpbjs.get('fpbLayers').getTree = () => {
        throw new Error('broken tree');
      };
    });
    await page.locator('#openLayerButton').click();
    await expect(page.locator('#layer-container .fpb-toolbar-failed')).toHaveText('The toolbar stopped working. Details are in the console.');
  });

  test('a screen reader hears the name once', async ({ page }) => {
    await open(page);
    await page.locator('#exportButton').hover();
    await expect(page.locator('.fpb-toolbar-tip:visible')).toHaveText('Export');
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(1);
    await expect(page.locator('.fpb-toolbar-tip')).toHaveAttribute('aria-hidden', 'true');
    // the accessibility tree has the button and no text of the tooltip
    const tree = await page.locator('body').ariaSnapshot();
    expect(tree).toMatch(/button "Export"/);
    expect(tree).not.toMatch(/text: Export/);
  });

  // 016f E1: held before the toolbar left React, so the new one keeps it
  test('AML file appears when an AML file is opened and goes with New model', async ({ page }) => {
    await open(page);
    const button = group(page, 'file').locator('#amlOverviewButton');
    await expect(button).toHaveCount(0);
    const aml = fs.readFileSync(path.join(__dirname, '..', 'unit', 'aml', 'oracle', 'inputs', 'generated', 'mixed.aml'), 'utf8');
    await page.evaluate((text) => window.fpbjs.get('amlSupport').importAml(text, { fileName: 'Anlage.aml' }), aml);
    await expect(button).toBeVisible({ timeout: 15000 });
    await expect(button).toHaveAttribute('aria-label', 'AML file');
    await page.evaluate(() => window.fpbjs.newModel());
    await expect(button).toHaveCount(0);
  });

  // 016g B5
  test('the model check button is pressed while its list is open', async ({ page }) => {
    await open(page);
    const button = page.locator('#openValidationButton');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();
    await expect(page.locator('.fpb-validation-panel.open')).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.fpb-validation-panel .fpb-validation-close').click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  test('the check counter follows the model check', async ({ page }) => {
    await open(page);
    const counter = page.locator('#openValidationButton .fpb-validation-count');
    await expect(counter).toHaveCount(0);
    await expect(page.locator('#openValidationButton')).toHaveAttribute('aria-label', /^Model check \(VDI 3682\): /);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Prüfen')[0];
      window.fpbjs.get('modeling').moveElements([operator], { x: 900, y: 0 });
    });
    await expect(counter).toHaveText('1');
    await expect(counter).toHaveClass(/has-errors/);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    await expect(counter).toHaveCount(0);
  });

  test('the toolbar shows three groups and no options menu', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: /Show Options|Hide Options/ })).toHaveCount(0);
    await expect(group(page, 'file').getByRole('button', { name: 'New model' })).toBeVisible();
    await expect(group(page, 'file').locator('#openFileButton')).toBeVisible();
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
    await expect(layers.locator('.fpb-layers-node', { hasText: 'Erhitzen' })).toContainText('2 operators');
    await expect(layers.locator('.fpb-layers-project')).toContainText('FPBJS_Project');
  });

  test('the operator count in Layers is not cut off', async ({ page }) => {
    await open(page);
    await page.locator('#openLayerButton').click();
    const count = page.locator('.fpb-layers .fpb-layers-node-count').first();
    await expect(count).toBeVisible();
    const right = (await count.boundingBox()).x + (await count.boundingBox()).width;
    const tree = await page.locator('.fpb-layers .fpb-layers-tree').boundingBox();
    expect(right).toBeLessThanOrEqual(tree.x + tree.width);
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
