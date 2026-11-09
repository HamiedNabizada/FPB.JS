// tests/e2e/import-runs.spec.js
import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';
import { ModelBuilder } from './helpers/modelBuilder';

/**
 * Every import is a run of its own (032a V2): an import that a newer one
 * replaced tells the screen nothing any more, and each run keeps its own
 * warnings. Before, the older import switched to the entry layer of its
 * model after the newer one had replaced it, announced processes twice and
 * lost its warnings to the newer import.
 */

const fixture = path.join(__dirname, 'fixtures', 'temperieren.json');
const first = () => JSON.parse(fs.readFileSync(fixture, 'utf8'));

/** A second model with one process, so the two are easy to tell apart */
function second() {
  const m = new ModelBuilder('Zweites Modell');
  const p = m.process();
  const a = p.state('fpb:Product', 'A', { x: 150, y: 75 });
  const op = p.operator('Op', { x: 300, y: 250 });
  p.flow(a, op);
  return m.build();
}

/** The first model without layout: its import carries warnings */
function bare() {
  const data = first();
  data.forEach((entry) => {
    if (entry.process) {
      delete entry.elementVisualInformation;
    }
  });
  return data;
}

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
}

test.describe('Import runs', () => {

  test('two imports in one go: one import.done, the canvas and the layer panel show the second model', async ({ page }) => {
    await open(page);
    const b = second();
    const seen = await page.evaluate(([a, b]) => new Promise((resolve) => {
      const bus = window.fpbjs.get('eventBus');
      const seen = { done: 0, newProcess: [] };
      bus.on('import.done', () => { seen.done++; });
      bus.on('layerPanel.newProcess', (e) => { seen.newProcess.push(e.newProcess.id); });
      bus.fire('FPBJS.import', { data: a });
      bus.fire('FPBJS.import', { data: b });
      setTimeout(() => resolve({ ...seen, root: window.fpbjs.get('canvas').getRootElement().id }), 1500);
    }), [first(), b]);

    const processes = b.filter((entry) => entry.process).map((entry) => entry.process.id);
    expect(seen.done).toBe(1);
    expect(seen.newProcess).toEqual(processes);
    expect(seen.root).toBe(b[0].entryPoint);
  });

  test('a failing second import leaves the first one to finish with its own warnings', async ({ page }) => {
    await open(page);
    const result = await page.evaluate((a) => new Promise((resolve) => {
      const bus = window.fpbjs.get('eventBus');
      const importer = window.fpbjs.get('jsonImporter');
      const log = [];
      bus.on('import.error', (e) => { log.push(['error', e.run]); });
      bus.on('import.report', (e) => { log.push(['report', e.run, e.warnings.length]); });
      bus.on('import.done', (e) => { log.push(['done', e.run]); });
      bus.fire('FPBJS.import', { data: a });
      const r1 = importer.getLastRun();
      bus.fire('FPBJS.import', { data: {} });
      const r2 = importer.getLastRun();
      const settled = Promise.all([
        importer.whenSettled(r1).then((res) => res.warnings.length, (e) => 'rejected ' + e.code),
        importer.whenSettled(r2).then(() => 'resolved', (e) => e.name + ' ' + e.code)
      ]);
      settled.then((answers) => resolve({
        log, r1, r2, answers, root: window.fpbjs.get('canvas').getRootElement().id
      }));
    }), bare());

    expect(result.r2).toBe(result.r1 + 1);
    expect(result.log).toEqual([
      ['error', result.r2],
      ['report', result.r1, 2],
      ['done', result.r1]
    ]);
    expect(result.answers).toEqual([2, 'FpbImportError INVALID_DATA_STRUCTURE']);
    expect(result.root).toBe(first()[0].entryPoint);
  });

  test('whenSettled resolves with the warnings of its run and rejects a superseded run with SUPERSEDED', async ({ page }) => {
    await open(page);
    const answers = await page.evaluate(([a, b]) => {
      const bus = window.fpbjs.get('eventBus');
      const importer = window.fpbjs.get('jsonImporter');
      bus.fire('FPBJS.import', { data: a });
      const r1 = importer.getLastRun();
      bus.fire('FPBJS.import', { data: b });
      const r2 = importer.getLastRun();
      return Promise.all([
        importer.whenSettled(r1).then(() => 'resolved', (e) => e.code),
        importer.whenSettled(r2).then((res) => res.warnings.length, (e) => 'rejected ' + e.code),
        // asked again after the run is over: the same answer at once
        importer.whenSettled(r2)
          .then(() => importer.whenSettled(r2))
          .then((res) => res.warnings.length, (e) => 'rejected ' + e.code)
      ]);
    }, [bare(), second()]);

    expect(answers).toEqual(['SUPERSEDED', 0, 0]);
  });

});
