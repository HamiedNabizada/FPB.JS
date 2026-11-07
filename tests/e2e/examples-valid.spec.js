import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';

import { ImportPage } from './pages/ImportPage';

/**
 * The example models of the start card (016e D3) are what a newcomer sees
 * first: they open without an error or a warning of the model check (031,
 * the user: "Fehlerhafte Modelle können doch keine Beispielmodelle sein").
 * Notes stay allowed: a model before its release has no version or revision
 * (D8). Every FPD hierarchy of an AML example counts.
 */

const DIR = path.join(__dirname, '..', '..', 'app', 'examples');

const problems = (page) => page.evaluate(() => window.fpbjs.get('fpbValidation').run()
  .filter((i) => i.severity !== 'info')
  .map((i) => i.rule + ' ' + i.message));

test.describe('Example models (031)', () => {
  test('Temperieren opens without errors and warnings', async ({ page }) => {
    const importer = new ImportPage(page);
    await importer.goto();
    await importer.import(JSON.parse(fs.readFileSync(path.join(DIR, 'temperieren.json'), 'utf8')));
    expect(await problems(page)).toEqual([]);
  });

  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.aml')).sort()) {
    test(file + ' opens without errors and warnings in every process view', async ({ page }) => {
      await new ImportPage(page).goto();
      const text = fs.readFileSync(path.join(DIR, file), 'utf8');
      const found = await page.evaluate((t) => window.fpbjs.get('amlSupport').inspect(t), text);
      expect(found.length).toBeGreaterThan(0);
      const all = {};
      for (const ih of found) {
        // an empty model first: a view that does not import must not inherit the findings of the one before
        await page.evaluate(() => window.fpbjs.newModel());
        await page.evaluate(async ({ t, id }) => {
          const done = new Promise((resolve) => { window.fpbjs.get('eventBus').once('import.done', resolve); setTimeout(resolve, 8000); });
          await window.fpbjs.get('amlSupport').importAml(t, { hierarchyId: id });
          await done;
        }, { t: text, id: ih.id });
        all[ih.name] = await problems(page);
      }
      expect(all).toEqual(Object.fromEntries(found.map((ih) => [ih.name, []])));
    });
  }
});

/**
 * The examples carry their layout (Testrunde 2026-11-07, the user: "Mit
 * fertigem Layout"): they open as they were arranged, without the note that
 * FPB.js arranged them. The generator in the mapper (ShowcaseTests.cs) writes
 * no layout; `UPDATE_EXAMPLE_LAYOUT=1` lets FPB.js arrange every process view
 * and writes it into the file through the AML export, which keeps the rest.
 */
test.describe('Example models carry their layout', () => {
  const UPDATE = !!process.env.UPDATE_EXAMPLE_LAYOUT;

  const openView = (page, text, id) => page.evaluate(async ({ t, id }) => {
    const bus = window.fpbjs.get('eventBus');
    const notes = [];
    const listen = (event) => notes.push(...event.warnings.map((w) => w.message));
    bus.on('import.report', listen);
    const done = new Promise((resolve) => { bus.once('import.done', resolve); setTimeout(resolve, 8000); });
    await window.fpbjs.get('amlSupport').importAml(t, { hierarchyId: id });
    await done;
    bus.off('import.report', listen);
    return notes.filter((n) => /layout/i.test(n));
  }, { t: text, id });

  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.aml')).sort()) {
    test(file + ' opens without arranging anything', async ({ page }) => {
      await new ImportPage(page).goto();
      let text = fs.readFileSync(path.join(DIR, file), 'utf8');
      const found = await page.evaluate((t) => window.fpbjs.get('amlSupport').inspect(t), text);
      const notes = {};
      for (const ih of found) {
        await page.evaluate(() => window.fpbjs.newModel());
        notes[ih.name] = await openView(page, text, ih.id);
        if (UPDATE) {
          text = await page.evaluate(async () => (await window.fpbjs.get('amlSupport').exportAml()).text);
        }
      }
      if (UPDATE) {
        fs.writeFileSync(path.join(DIR, file), text.split(/\r?\n/).join('\r\n'));
        return;
      }
      expect(notes).toEqual(Object.fromEntries(found.map((ih) => [ih.name, []])));
    });
  }
});
