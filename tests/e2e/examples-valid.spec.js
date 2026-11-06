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
