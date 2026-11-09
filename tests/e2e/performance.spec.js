// tests/e2e/performance.spec.js
import { test, expect } from './support/test';
import { openLibraryPage, createModeler, libraryBuilt } from './library/libPage';
import { generateLargeModel } from '../fixtures/generate/largeModel';

/**
 * Performance budget for large models (032a V9, R11 of 030). A generated model
 * of 20 layers with 301 states and operators each (about 12 000 elements with
 * the flows) goes through import, layer switch, an edit, the model check and
 * the exports; each step has a limit. The limits are three times the slowest
 * of three measurements (alone and under load with 8 workers), at least
 * 200 ms: a slowdown by an order of magnitude fails, load does not.
 *
 * Built library first: `npm run build:lib`.
 */

// Measured 2026-11-09, Chromium, ms. Alone: import 1878 and 1536, two layer
// switches 756 and 640, edit 176 and 161, check 151 and 156, toJSON 122 and
// 85, toXML 1377 and 1103. Under load (8 workers, 8 runs), slowest: import
// 3368, switches 1710, edit 329, check 326, toJSON 216, toXML 2007.
// Not measured in CI yet: raise a limit there only with new numbers.
const BUDGET = {
  import: 10200,
  switchLayer: 5200,
  edit: 1000,
  check: 1000,
  toJSON: 700,
  toXML: 6100
};

test.beforeAll(() => {
  expect(libraryBuilt(), 'dist/fpbjs.js is missing, run `npm run build:lib` first').toBe(true);
});

/** Import the data and measure each step in the page */
function measure(page, data) {
  return page.evaluate(async (model) => {
    const fpb = window.fpb;
    const time = async (work) => {
      const start = performance.now();
      await work();
      return Math.round(performance.now() - start);
    };
    const result = {};
    result.import = await time(() => fpb.importJSON(model));
    const processes = model.filter((entry) => entry.process).map((entry) => entry.process.id);
    const deepest = processes[processes.length - 1];
    result.switchLayer = await time(async () => {
      fpb.switchProcess(deepest);
      fpb.switchProcess(processes[0]);
    });
    result.edit = await time(() => new Promise((resolve) => {
      const off = fpb.on('model.changed', () => {
        off();
        resolve();
      });
      const operator = fpb.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[1];
      fpb.get('modeling').moveElements([operator], { x: 0, y: 10 });
    }));
    result.check = await time(() => fpb.get('fpbValidation').run());
    result.toJSON = await time(() => fpb.toJSON());
    result.toXML = await time(() => fpb.toXML());
    result.findings = fpb.getFindings().filter((f) => f.severity !== 'info').length;
    return result;
  }, data);
}

test.describe('Performance budget', () => {

  test('a generated model of 3 layers imports without errors and warnings of the model check', async ({ page }) => {
    await openLibraryPage(page);
    await createModeler(page);
    const data = generateLargeModel({ layers: 3, perLayer: 31 });
    const result = await page.evaluate((model) => window.fpb.importJSON(model).then((r) => ({
      warnings: r.warnings.map((w) => w.message),
      findings: r.findings.filter((f) => f.severity !== 'info').map((f) => `${f.rule}: ${f.message}`)
    })), data);

    expect(result).toEqual({ warnings: [], findings: [] });
  });

  test('budget for 20 layers of 300 elements', async ({ page }, testInfo) => {
    test.setTimeout(240000);
    await openLibraryPage(page);
    await createModeler(page);
    const data = generateLargeModel({ layers: 20, perLayer: 301 });
    const result = await measure(page, data);
    await testInfo.attach('measured', { body: JSON.stringify(result), contentType: 'application/json' });
    console.log('performance budget, measured ms:', JSON.stringify(result));

    expect(result.findings).toBe(0);
    Object.keys(BUDGET).forEach((step) => {
      expect(result[step], step).toBeLessThan(BUDGET[step]);
    });
  });
});
