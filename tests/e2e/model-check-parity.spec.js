import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';

import { ImportPage } from './pages/ImportPage';

/**
 * 031 V8: the model check of FPB.js and the OCL rules of the plugin give the
 * same verdict on the same files. Each file of tests/fixtures/model-check has
 * its expected verdict; the plugin checks OCL against the same files
 * (ModelCheckParityTests.cs). Compared are the rules the case names, as pairs
 * of rule and element: D1 and D8 for every element they involve, A2 to A4 by
 * the id of the process in FPB.js.
 */

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'tests', 'fixtures', 'model-check');
const CASES = fs.readdirSync(DIR).filter((f) => f.endsWith('.expected.json')).sort();

const key = (f) => f.rule + ' ' + (f.process !== undefined ? 'process:' + f.process : f.element);

async function verdict(page, text, hierarchy, rules) {
  return page.evaluate(async ({ text, hierarchy, rules }) => {
    const aml = window.fpbjs.get('amlSupport');
    const found = await aml.inspect(text);
    const ih = found.find((h) => h.name === hierarchy);
    await aml.importAml(text, { hierarchyId: ih && ih.id });
    const out = [];
    window.fpbjs.get('fpbValidation').run().filter((i) => rules.includes(i.rule)).forEach((i) => {
      if (['A2', 'A3', 'A4'].includes(i.rule)) {
        out.push({ rule: i.rule, process: i.process.id });
      } else if (i.rule === 'D1' || i.rule === 'D8') {
        i.involved.forEach((x) => out.push({ rule: i.rule, element: x.id }));
      } else {
        out.push({ rule: i.rule, element: i.elementId });
      }
    });
    return out;
  }, { text, hierarchy, rules });
}

test.describe('Model check equal to OCL (031)', () => {
  for (const file of CASES) {
    test(file.replace('.expected.json', ''), async ({ page }) => {
      const expected = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
      const text = fs.readFileSync(path.join(ROOT, expected.aml), 'utf8');
      await new ImportPage(page).goto();
      const got = await verdict(page, text, expected.hierarchy, expected.rules);
      expect([...new Set(got.map(key))].sort()).toEqual(expected.findings.map(key).sort());
    });
  }
});
