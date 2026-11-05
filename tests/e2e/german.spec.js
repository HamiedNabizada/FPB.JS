// tests/e2e/german.spec.js
import { test, expect } from './support/test';
import { libraryBuilt } from './library/libPage';
import { SURFACES, IDS, prepare, unmarked, texts, modelData, clone, settle, without } from './helpers/language';

/**
 * German in FPB.js (016h F1, Tests), against the library bundle:
 * - nothing hard-coded in English: with a translate that marks every text,
 *   each surface shows nothing unmarked but model data;
 * - switching equals starting in German: a surface shows the same texts
 *   after setLanguage('de') as after a start with language: 'de'.
 *
 * Build first: `npm run build:lib`.
 */

test.beforeAll(() => {
  expect(libraryBuilt(), 'dist/fpbjs.js is missing, run `npm run build:lib` first').toBe(true);
});

const dataOf = (surface) => modelData(Array.isArray(surface.model) ? surface.model : clone());

test.describe('Nothing hard-coded in English', () => {
  for (const surface of SURFACES) {
    test(surface.name, async ({ page }) => {
      const { errors } = await prepare(page, surface, { marked: true });
      await surface.open(page);
      await settle(page);
      const data = dataOf(surface).concat(surface.data || [], surface.pageData ? await surface.pageData(page) : [])
        .sort((a, b) => b.length - a.length);
      const found = [];
      const check = async () => {
        found.push(...await without(page, surface.exclude, () => unmarked(page, data, surface.scope)));
      };
      if (surface.each) {
        await surface.each(page, check);
      } else {
        await check();
      }
      expect(found).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('Switching equals starting in German', () => {
  for (const surface of SURFACES.filter((s) => !s.noSwitch)) {
    test(surface.name, async ({ page }) => {
      const collect = async () => {
        const all = [];
        if (surface.each) {
          await surface.each(page, async () => {
            all.push(...await without(page, surface.exclude, () => texts(page, surface.scope)));
          });
        } else {
          all.push(...await without(page, surface.exclude, () => texts(page, surface.scope)));
        }
        return all;
      };

      await prepare(page, surface, { language: 'en' });
      await surface.open(page);
      await page.evaluate(() => window.fpb.setLanguage('de'));
      await settle(page);
      if (surface.closesOnSwitch) {
        await surface.open(page);
        await settle(page);
      }
      const switched = await collect();

      await prepare(page, surface, { language: 'de' });
      await surface.open(page);
      await settle(page);
      const started = await collect();

      expect(switched).toEqual(started);
    });
  }
});

test.describe('Switching', () => {

  test('switching closes an open context pad and menu, undo stays', async ({ page }) => {
    await prepare(page, { name: 'switching' }, { language: 'en' });
    await page.evaluate((id) => {
      const registry = window.fpb.get('elementRegistry');
      window.fpb.get('modeling').moveElements([registry.get(id)], { x: 10, y: 0 });
    }, IDS.operator);
    await page.evaluate((id) => window.fpb.select(id), IDS.product);
    await page.locator('.djs-context-pad [data-action="change_type"]').click();
    await expect(page.locator('.djs-popup')).toBeVisible();
    await page.evaluate(() => window.fpb.setLanguage('de'));
    await settle(page);
    await expect(page.locator('.djs-popup')).toHaveCount(0);
    await expect(page.locator('.djs-context-pad.open')).toHaveCount(0);
    expect(await page.evaluate(() => window.fpb.get('commandStack').canUndo())).toBe(true);
  });
});
