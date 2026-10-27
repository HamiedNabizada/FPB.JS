// tests/e2e/properties-panel-connections.spec.js
import { test, expect } from './support/test';
import { openPanel, header, undo } from './helpers/panel';

/**
 * New panel: connections (016 "Neu gegenüber heute", 016b V4). In the test
 * model two parallel flows and the usage of "Heizplatte" leave "Erhitzen".
 */

const selectConnection = (page, sourceName, type) => page.evaluate(({ sourceName, type }) => {
  const registry = window.fpbjs.get('elementRegistry');
  const connection = registry.filter((e) => e.type === type && e.source && e.source.businessObject.name === sourceName)[0];
  window.fpbjs.get('selection').select(connection);
  return connection.id;
}, { sourceName, type });

const typeOf = (page, id) => page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).type, id);

test.describe('New properties panel, connections', () => {

  test('a branching flow shows type, source, target and partners; the type changes the whole branching', async ({ page }) => {
    await openPanel(page);
    const id = await selectConnection(page, 'Erhitzen', 'fpb:ParallelFlow');
    await expect(header(page)).toContainText('Parallel flow');

    const group = page.locator('[data-group-id="group-connection"]');
    await expect(group.locator('[data-entry-id="connectionSource"]')).toContainText('Erhitzen');
    await expect(group.locator('[data-entry-id="connectionPartners"] button')).not.toHaveCount(0);

    await group.locator('select').selectOption('fpb:AlternativeFlow');
    await expect.poll(() => typeOf(page, id)).toBe('fpb:AlternativeFlow');
    await undo(page);
    await expect.poll(() => typeOf(page, id)).toBe('fpb:ParallelFlow');
  });

  test('a click on the source selects it', async ({ page }) => {
    await openPanel(page);
    await selectConnection(page, 'Erhitzen', 'fpb:ParallelFlow');
    await page.locator('[data-entry-id="connectionSource"] button').click();
    await expect(header(page)).toContainText('Process operator');
    await expect(header(page)).toContainText('Erhitzen');
  });

  test('a plain flow and a usage show their type without a choice', async ({ page }) => {
    await openPanel(page);
    await selectConnection(page, 'Erhitzen', 'fpb:Usage');
    const group = page.locator('[data-group-id="group-connection"]');
    await expect(group.locator('select')).toHaveCount(0);
    await expect(group).toContainText('Usage');
  });

  test('in read-only mode the type cannot be changed', async ({ page }) => {
    await openPanel(page);
    await selectConnection(page, 'Erhitzen', 'fpb:ParallelFlow');
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await expect(page.locator('[data-group-id="group-connection"] select')).toBeDisabled();
  });
});
