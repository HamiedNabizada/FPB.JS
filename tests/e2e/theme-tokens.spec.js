import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * One set of design values for the whole interface (016c T1, T6, T7b): the
 * colours of light and dark, IBM Plex in the interface, Arial on the canvas,
 * and Bootstrap 5 shipped with the app.
 */

async function open(page) {
  await page.setViewportSize({ width: 1500, height: 900 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
}

/** Text and the surface it stands on, by variable */
const PAIRS = [
  ['--fpb-text', '--fpb-surface'],
  ['--fpb-text-muted', '--fpb-surface'],
  ['--fpb-text-subtle', '--fpb-surface-muted'],
  ['--fpb-accent', '--fpb-surface'],
  ['--fpb-warning-text', '--fpb-warning-surface'],
  ['--fpb-error-text', '--fpb-error-surface'],
  ['--fpb-info-text', '--fpb-info-surface'],
  ['--fpb-text', '--fpb-ground']
];

/** WCAG 2.1 contrast of each pair under the given theme, colours resolved by the browser */
const contrasts = (page, theme) => page.evaluate(({ pairs, theme }) => {
  document.documentElement.setAttribute('data-theme', theme);
  // a fresh element per colour: re-reading one element after changing its
  // style returned the colour from before
  const rgb = (variable) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(' + variable + ')';
    document.body.appendChild(probe);
    const match = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
    probe.remove();
    return match ? match.slice(0, 3).map(Number) : null;
  };
  const luminance = ([r, g, b]) => {
    const channel = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const defined = (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim() !== '';
  const result = pairs.map(([text, surface]) => {
    if (!defined(text) || !defined(surface)) {
      return { text, surface, ratio: 0 };
    }
    const a = luminance(rgb(text));
    const b = luminance(rgb(surface));
    return { text, surface, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
  return result;
}, { pairs: PAIRS, theme });

test.describe('Design values', () => {

  test('the interface uses IBM Plex Sans, the canvas labels stay Arial', async ({ page }) => {
    await open(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('13px "IBM Plex Sans"'))).toBe(true);
    expect(await page.locator('.fpb-toolbar').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('IBM Plex Sans');
    expect(await page.locator('.djs-label').first().evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Arial');
  });

  for (const theme of ['light', 'dark']) {
    test(`every text colour reaches 4.5:1 on its surface (${theme})`, async ({ page }) => {
      await open(page);
      for (const pair of await contrasts(page, theme)) {
        expect(pair.ratio, pair.text + ' on ' + pair.surface).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  test('Bootstrap 5 comes with the app, nothing from a CDN', async ({ page }) => {
    await open(page);
    expect(await page.locator('link[href*="bootstrapcdn"]').count()).toBe(0);
    // only Bootstrap 5 has this variable; the toolbar has no .btn since 016f E1
    const bootstrap = await page.evaluate(() => Array.from(document.styleSheets).some((sheet) => {
      try {
        return Array.from(sheet.cssRules).some((rule) => rule.cssText.includes('--bs-btn-padding-x'));
      } catch (e) {
        return false;
      }
    }));
    expect(bootstrap).toBe(true);
  });
});
