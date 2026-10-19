// tests/e2e/properties-panel-next-process.spec.js
import { test, expect } from './support/test';
import { openPanel, field, undo } from './helpers/panelNext';

/**
 * New panel with nothing selected: project and process (016b V5). In the test
 * model the top level has the operators "Erhitzen" and "Prüfen", the
 * decomposition of "Erhitzen" has "Vorwärmen" and "Fertigheizen".
 */

const project = (page) => page.evaluate(() => {
  const p = window.fpbjs.getProjectDefinition();
  return { name: p.name, targetNamespace: p.targetNamespace };
});
const count = (page, key) => page.locator(`[data-entry-id="process-${key}"] .fpb-fixed-value`);

test.describe('New properties panel, nothing selected', () => {

  test('project name and namespace can be edited and undone', async ({ page }) => {
    await openPanel(page);
    const before = await project(page);
    await expect(field(page, 'projectName')).toHaveValue(before.name);

    await field(page, 'projectName').fill('Anlage Nord');
    await expect.poll(async () => (await project(page)).name).toBe('Anlage Nord');
    await undo(page);
    await expect.poll(async () => (await project(page)).name).toBe(before.name);
    await expect(field(page, 'projectName')).toHaveValue(before.name);
  });

  test('the process group counts the elements of the layer and follows changes', async ({ page }) => {
    await openPanel(page);
    await expect(count(page, 'operators')).toHaveText('2');
    await page.evaluate(() => {
      const op = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Prüfen' && e.type !== 'label')[0];
      window.fpbjs.get('fpbDelete').remove([op]);
      window.fpbjs.get('selection').select([]);
    });
    await expect(count(page, 'operators')).toHaveText('1');
  });

  // Review Focus 5
  test('a decomposed layer shows its numbers and leads back to the parent layer', async ({ page }) => {
    await openPanel(page);
    await page.evaluate(() => {
      const op = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('modeling').switchProcess(op.businessObject.decomposedView);
    });
    await expect(page.locator('.bio-properties-panel-header')).toContainText('Decomposition of Erhitzen');
    await expect(count(page, 'operators')).toHaveText('2');

    await page.getByRole('button', { name: 'Open parent layer' }).click();
    await expect(page.locator('.bio-properties-panel-header')).toContainText('Top level');
  });
});
