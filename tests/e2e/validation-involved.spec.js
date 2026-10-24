// tests/e2e/validation-involved.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * One finding shows every element it is about (024 point 6, 016b V8): the
 * element of the finding is selected, so the properties panel shows the
 * finding (V7), the other elements it is about are marked until the next
 * selection (decided by the user 2026-10-19). modeling.connect does not ask
 * the rules (diagram-js only calls createConnection), so it makes the
 * duplicate the canvas would refuse; such files come from imports.
 */

const MARK = 'fpb-finding-involved';
const marked = (page) => page.evaluate((mark) => window.fpbjs.get('elementRegistry')
  .filter((e) => window.fpbjs.get('canvas').hasMarker(e, mark)).map((e) => e.id).sort(), MARK);

test('choosing a duplicate connection selects it and marks the other one', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
  const ids = await page.evaluate(() => {
    const registry = window.fpbjs.get('elementRegistry');
    const flow = registry.filter((e) => e.type === 'fpb:Flow')[0];
    const twin = window.fpbjs.get('modeling').connect(flow.source, flow.target, { type: 'fpb:Flow' });
    window.fpbjs.get('fpbValidation').run();
    window.fpbjs.get('fpbValidation').openPanel();
    return { flow: flow.id, twin: twin.id };
  });
  await page.locator('.fpb-validation-item[data-rule="C5"]').first().click();

  // the finding is reported at the later connection, the first one is the other
  const selected = await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.id));
  expect(selected).toEqual([ids.twin]);
  expect(await marked(page)).toEqual([ids.flow]);
  await expect(page.locator('[data-group-id="group-findings"]')).toContainText('Duplicate connection');

  // the mark goes with the next selection
  await page.evaluate(() => window.fpbjs.get('selection').select([]));
  expect(await marked(page)).toEqual([]);
});

test('a finding with elements on another layer links that layer and selects them there (F8)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
  await page.evaluate(() => {
    const registry = window.fpbjs.get('elementRegistry');
    // the outputs of "Erhitzen" become alternative, its decomposition still produces them in parallel
    const out = registry.filter((e) => e.type === 'fpb:ParallelFlow' && e.source && e.source.businessObject.name === 'Erhitzen')[0];
    window.fpbjs.get('commandStack').execute('fpb.changeType', { element: out, newType: 'fpb:AlternativeFlow' });
    window.fpbjs.get('fpbValidation').run();
    window.fpbjs.get('fpbValidation').openPanel();
  });
  const link = page.locator('.fpb-validation-item[data-rule="F8"] .fpb-validation-elsewhere').first();
  await expect(link).toContainText('decomposition of Erhitzen');
  await link.click();

  const state = await page.evaluate(() => ({
    layer: window.fpbjs.get('canvas').getRootElement().businessObject.isDecomposedProcessOperator.name,
    selected: window.fpbjs.get('selection').get().map((e) => e.type)
  }));
  expect(state.layer).toBe('Erhitzen');
  expect(state.selected).toEqual(['fpb:ParallelFlow']);
  const others = await page.evaluate((mark) => window.fpbjs.get('elementRegistry')
    .filter((e) => window.fpbjs.get('canvas').hasMarker(e, mark)).map((e) => e.type), MARK);
  expect(others.length).toBeGreaterThan(0);
  expect(others.every((type) => type === 'fpb:ParallelFlow')).toBe(true);
});
