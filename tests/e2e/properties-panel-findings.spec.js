// tests/e2e/properties-panel-findings.spec.js
import { test, expect } from './support/test';
import { openPanel, select } from './helpers/panel';

/** New panel: findings of the model check at the element and its fields (016b V7) */

// A new product without a name inside the system limit: D4 (no name) and G4 (not connected)
const unnamedState = (page) => page.evaluate(() => {
  const registry = window.fpbjs.get('elementRegistry');
  const systemLimit = registry.filter((e) => e.type === 'fpb:SystemLimit')[0];
  const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Product' });
  const state = window.fpbjs.get('modeling').createShape(shape, { x: systemLimit.x + 60, y: systemLimit.y + systemLimit.height / 2 }, systemLimit);
  window.fpbjs.get('fpbValidation').run();
  window.fpbjs.get('selection').select(state);
  return state.id;
});
const findingsWith = (page, text) => page.locator('[data-group-id="group-findings"]', { hasText: text });

test.describe('New properties panel, findings', () => {

  test('an element with findings shows them on top, a missing name also at the name field', async ({ page }) => {
    await openPanel(page);
    await unnamedState(page);
    const group = page.locator('[data-group-id="group-findings"]');
    await expect(group).toContainText('D4');
    await expect(page.locator('[data-entry-id="shortName"] .fpb-field-finding-info')).toBeVisible();
  });

  test('a finding is a tinted card without a coloured stripe at the side (016c)', async ({ page }) => {
    await openPanel(page);
    await unnamedState(page);
    const finding = page.locator('[data-group-id="group-findings"] .fpb-finding').first();
    await expect(finding).toBeVisible();
    expect(await finding.evaluate((e) => parseFloat(getComputedStyle(e).borderLeftWidth))).toBeLessThanOrEqual(1);
    expect(await finding.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('an element without findings has no findings group', async ({ page }) => {
    await openPanel(page);
    await select(page, 'Erhitzen');
    await expect(page.locator('[data-group-id="group-findings"]')).toHaveCount(0);
  });

  test('choosing a finding in the model check list opens the hidden panel at it', async ({ page }) => {
    await openPanel(page);
    await page.locator('#propertiesPanelToggle').click();
    await unnamedState(page);
    await page.evaluate(() => window.fpbjs.get('fpbValidation').openPanel());
    await page.locator('.fpb-validation-item[data-rule="D4"]').first().click();
    await expect(page.locator('.fpb-properties-body')).toBeVisible();
    await expect(page.locator('[data-group-id="group-findings"]')).toContainText('D4');
  });

  // Review Focus 5
  test('after a layer switch the findings of the new layer show', async ({ page }) => {
    await openPanel(page);
    await unnamedState(page);
    await expect(findingsWith(page, 'D4')).toHaveCount(1);
    await page.evaluate(() => {
      const op = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('modeling').switchProcess(op.businessObject.decomposedView);
    });
    await expect(page.locator('.bio-properties-panel-header')).toContainText('Decomposition of Erhitzen');
    await expect(findingsWith(page, 'D4')).toHaveCount(0);
  });
});
