// tests/e2e/settings.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E tests for the display settings: light/dark theme (ThemeToggle, app.js,
 * SystemLimitDropFeedbackBlocker), the colour scheme switch in the options
 * menu (ColorSchemeToggle, ColorSchemeService) and the grid (GridService).
 *
 * Theme and colour scheme are remembered per browser in localStorage
 * ('fpb-theme', 'fpb-color-scheme'). The grid has no user setting: GridService
 * switches grid and snapping on at start, SettingsService is not called by
 * anything, so there is no grid size or on/off switch to test from the UI.
 *
 * app.js stores 'light' on the first start, so the ThemeToggle listener for a
 * change of the system setting only acts once the stored value is gone; the
 * test for it removes the value on purpose.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function laden(page) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return { importer, fehler };
}

async function optionenOeffnen(page) {
  const knopf = page.getByRole('button', { name: 'Show Options' });
  await knopf.click();
  await expect(page.getByRole('button', { name: 'Hide Options' })).toBeVisible();
}

const themeKnopf = (page) => page.locator('.layerPanel button[aria-label^="Switch to"]');

const zustand = (page) => page.evaluate(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  gespeichert: localStorage.getItem('fpb-theme'),
}));

async function neuLaden(page) {
  await page.reload();
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
  await page.waitForSelector('.djs-palette [data-group=tools]', { timeout: 20000 });
}

const textFarbe = (page) => page.evaluate(() => {
  const t = document.querySelector('.djs-container .djs-element text');
  return getComputedStyle(t).fill;
});

test.describe('Theme', () => {

  test('first start is light and stores the choice', async ({ page }) => {
    await laden(page);
    expect(await zustand(page)).toEqual({ theme: 'light', gespeichert: 'light' });
    await optionenOeffnen(page);
    await expect(themeKnopf(page)).toHaveAttribute('aria-label', 'Switch to Dark Mode');
  });

  test('the toggle switches to dark, colours the canvas and survives a reload', async ({ page }) => {
    const { fehler } = await laden(page);
    const hellText = await textFarbe(page);
    const hellHintergrund = await page.evaluate(() => getComputedStyle(document.querySelector('.djs-container svg')).backgroundColor);

    await optionenOeffnen(page);
    await themeKnopf(page).click();

    expect(await zustand(page)).toEqual({ theme: 'dark', gespeichert: 'dark' });
    await expect(themeKnopf(page)).toHaveAttribute('aria-label', 'Switch to Light Mode');
    expect(await textFarbe(page)).toBe('rgb(255, 255, 255)');
    expect(hellText).toBe('rgb(0, 0, 0)');
    const dunkelHintergrund = await page.evaluate(() => getComputedStyle(document.querySelector('.djs-container svg')).backgroundColor);
    expect(dunkelHintergrund).not.toBe(hellHintergrund);

    await neuLaden(page);
    expect(await zustand(page)).toEqual({ theme: 'dark', gespeichert: 'dark' });
    await optionenOeffnen(page);
    await expect(themeKnopf(page)).toHaveAttribute('aria-label', 'Switch to Light Mode');

    // and back
    await themeKnopf(page).click();
    expect(await zustand(page)).toEqual({ theme: 'light', gespeichert: 'light' });
    await neuLaden(page);
    expect(await zustand(page)).toEqual({ theme: 'light', gespeichert: 'light' });
    expect(fehler).toEqual([]);
  });

  test('the theme is not part of the model', async ({ page }) => {
    await laden(page);
    const vorher = await page.evaluate(() => JSON.stringify(window.fpbjs.getProcesses().map((p) => p.process && p.process.id)));
    const stapel = await page.evaluate(() => window.fpbjs.get('commandStack')._stackIdx);
    await optionenOeffnen(page);
    await themeKnopf(page).click();
    expect(await page.evaluate(() => window.fpbjs.get('commandStack')._stackIdx)).toBe(stapel);
    expect(await page.evaluate(() => JSON.stringify(window.fpbjs.getProcesses().map((p) => p.process && p.process.id)))).toBe(vorher);
  });

  test('without a saved choice the toggle follows the system setting', async ({ page }) => {
    await laden(page);
    await optionenOeffnen(page);
    await page.evaluate(() => localStorage.removeItem('fpb-theme'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    expect((await zustand(page)).theme).toBe('dark');
    await expect(themeKnopf(page)).toHaveAttribute('aria-label', 'Switch to Light Mode');
  });

  test('with a saved choice a change of the system setting is ignored', async ({ page }) => {
    await laden(page);
    await optionenOeffnen(page);
    expect((await zustand(page)).gespeichert).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    expect(await zustand(page)).toEqual({ theme: 'light', gespeichert: 'light' });
  });

  test('in dark mode white fills set on canvas elements are painted dark', async ({ page }) => {
    await laden(page);
    await optionenOeffnen(page);
    await themeKnopf(page).click();
    const fill = await page.evaluate(async () => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      const visual = document.querySelector(`[data-element-id="${operator.id}"] .djs-hit`) ||
        document.querySelector(`[data-element-id="${operator.id}"] .djs-visual > *`);
      visual.setAttribute('style', 'fill: white');
      await new Promise((r) => setTimeout(r, 50));
      return visual.style.getPropertyValue('fill');
    });
    expect(fill).toBe('rgb(45, 45, 45)');
  });

  test('in light mode, also after dark mode was on, white fills stay white', async ({ page }) => {
    await laden(page);
    const weissSetzen = () => page.evaluate(async () => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      const visual = document.querySelector(`[data-element-id="${operator.id}"] .djs-visual > *`);
      visual.setAttribute('style', 'fill: white');
      await new Promise((r) => setTimeout(r, 50));
      const wert = visual.style.getPropertyValue('fill');
      visual.removeAttribute('style');
      return wert;
    });
    expect(await weissSetzen()).toBe('white');

    await optionenOeffnen(page);
    await themeKnopf(page).click();
    expect(await weissSetzen()).toBe('rgb(45, 45, 45)');
    await themeKnopf(page).click();
    expect((await zustand(page)).theme).toBe('light');
    expect(await weissSetzen()).toBe('white');
  });
});

test.describe('System limit in dark mode', () => {

  const slFuellung = (page) => page.evaluate(() => {
    const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
    const rect = document.querySelector(`[data-element-id="${sl.id}"] .djs-visual rect`);
    return { attr: rect.getAttribute('fill'), computed: getComputedStyle(rect).fill };
  });

  const weissMalen = (page) => page.evaluate(async () => {
    const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
    const rect = document.querySelector(`[data-element-id="${sl.id}"] .djs-visual rect`);
    rect.setAttribute('fill', 'white');
    await new Promise((r) => setTimeout(r, 50));
  });

  test('a white fill on the system limit is removed again in dark mode', async ({ page }) => {
    await laden(page);
    await optionenOeffnen(page);
    await themeKnopf(page).click();
    await weissMalen(page);
    expect((await slFuellung(page)).attr).toBe('none');
  });

  test('in light mode the blocker leaves the system limit alone', async ({ page }) => {
    await laden(page);
    await weissMalen(page);
    expect((await slFuellung(page)).attr).toBe('white');
  });

  test('moving an operator inside the system limit in dark mode keeps it transparent', async ({ page }) => {
    const { fehler } = await laden(page);
    await optionenOeffnen(page);
    await themeKnopf(page).click();

    const start = await page.evaluate(() => {
      const op = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Prüfen' && e.type !== 'label')[0];
      const r = document.querySelector(`[data-element-id="${op.id}"]`).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 20, start.y + 10, { steps: 5 });
    // while hovering the system limit as drop target
    await page.waitForTimeout(100);
    const waehrend = await slFuellung(page);
    await page.mouse.move(start.x + 40, start.y + 20, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    // drop feedback must not flash white on the dark canvas
    expect(waehrend.computed).not.toBe('rgb(255, 255, 255)');
    expect(waehrend.attr).not.toBe('white');
    expect((await slFuellung(page)).computed).toBe('none');
    // the move was a real one
    expect(await page.evaluate(() => window.fpbjs.get('commandStack').canUndo())).toBe(true);
    // a redraw of the system limit (shape.changed) keeps it transparent too
    await page.evaluate(async () => {
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      window.fpbjs.get('eventBus').fire('element.changed', { element: sl });
      await new Promise((r) => setTimeout(r, 50));
    });
    expect((await slFuellung(page)).computed).toBe('none');
    expect(fehler).toEqual([]);
  });
});

test.describe('Colour scheme switch', () => {

  test('switching on and off again by button redraws the elements and remembers the last choice', async ({ page }) => {
    await laden(page);
    const fuellung = () => page.evaluate(() => {
      const op = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      return getComputedStyle(document.querySelector(`[data-element-id="${op.id}"] .djs-visual > *`)).fill;
    });
    const standard = await fuellung();
    await optionenOeffnen(page);
    const knopf = page.locator('#colorSchemeButton');
    await expect(knopf).toHaveAttribute('aria-pressed', 'false');
    await expect(knopf).toHaveAttribute('aria-label', 'Colours for colour vision deficiency');

    await knopf.click();
    await expect(knopf).toHaveAttribute('aria-pressed', 'true');
    await expect(knopf).toHaveAttribute('aria-label', 'Back to the colours of VDI 3682');
    expect(await fuellung()).not.toBe(standard);
    expect(await page.evaluate(() => localStorage.getItem('fpb-color-scheme'))).toBe('accessible');

    await knopf.click();
    await expect(knopf).toHaveAttribute('aria-pressed', 'false');
    expect(await fuellung()).toBe(standard);
    expect(await page.evaluate(() => localStorage.getItem('fpb-color-scheme'))).toBe('standard');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-colors'))).toBe('standard');

    await neuLaden(page);
    expect(await page.evaluate(() => window.fpbjs.get('colorSchemeService').get())).toBe('standard');
  });

  test('the button follows a switch made through the API', async ({ page }) => {
    await laden(page);
    await optionenOeffnen(page);
    await page.evaluate(() => window.fpbjs.get('colorSchemeService').set('accessible'));
    await expect(page.locator('#colorSchemeButton')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.fpbjs.get('colorSchemeService').getSchemes())).toEqual(expect.arrayContaining(['standard', 'accessible']));
  });

  test('a layer drawn after the switch and a new element get the chosen colours', async ({ page }) => {
    const { importer, fehler } = await laden(page);
    const fuellung = (name) => page.evaluate((name) => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === name && x.type !== 'label')[0];
      return getComputedStyle(document.querySelector(`[data-element-id="${e.id}"] .djs-visual > *`)).fill;
    }, name);
    await optionenOeffnen(page);
    await page.locator('#colorSchemeButton').click();
    await expect(page.locator('#colorSchemeButton')).toHaveAttribute('aria-pressed', 'true');
    // accessible scheme: operator #4DFF97, product #E50026
    expect(await fuellung('Erhitzen')).toBe('rgb(77, 255, 151)');
    expect(await fuellung('Rohstoff')).toBe('rgb(229, 0, 38)');

    // the child layer was not on the canvas when the scheme changed
    await importer.switchToChildLayer();
    expect(await fuellung('Vorwärmen')).toBe('rgb(77, 255, 151)');
    expect(await fuellung('Produkt_\nVorgewärmt')).toBe('rgb(229, 0, 38)');

    // an element created afterwards
    await page.evaluate(() => {
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:ProcessOperator' });
      const neu = window.fpbjs.get('modeling').createShape(shape, { x: sl.x + 560, y: sl.y + 400 }, sl);
      window.fpbjs.get('modeling').updateLabel(neu, 'Nachher');
    });
    expect(await fuellung('Nachher')).toBe('rgb(77, 255, 151)');
    expect(fehler).toEqual([]);
  });

  test('theme and colour scheme combine and both survive a reload', async ({ page }) => {
    await laden(page);
    await optionenOeffnen(page);
    await themeKnopf(page).click();
    await page.locator('#colorSchemeButton').click();
    await neuLaden(page);
    expect(await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      colors: document.documentElement.getAttribute('data-colors'),
    }))).toEqual({ theme: 'dark', colors: 'accessible' });
  });
});

test.describe('Grid', () => {

  test('the grid is shown on the canvas from the start', async ({ page }) => {
    await laden(page);
    const grid = await page.evaluate(() => ({
      sichtbar: window.fpbjs.get('grid').isVisible(),
      muster: !!document.querySelector('.djs-container pattern[id*="djs-grid-pattern"]'),
      snapping: window.fpbjs.get('gridSnapping').isActive(),
    }));
    expect(grid).toEqual({ sichtbar: true, muster: true, snapping: true });
  });

  test('a shape created from the palette snaps its center to the grid', async ({ page }) => {
    await laden(page);
    const sl = await page.evaluate(() => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.type === 'fpb:SystemLimit')[0];
      const r = document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await page.locator('.djs-palette .entry[data-action="fpb-processoperator"]').click();
    // an odd pixel position on a free spot at the left inside the system limit
    await page.mouse.move(sl.x + sl.width * 0.12 + 3, sl.y + sl.height * 0.5 + 7, { steps: 4 });
    await page.mouse.click(sl.x + sl.width * 0.12 + 3, sl.y + sl.height * 0.5 + 7);
    await page.waitForTimeout(300);

    const neu = await page.evaluate(() => {
      const ops = window.fpbjs.get('elementRegistry').filter((x) => x.type === 'fpb:ProcessOperator');
      const e = ops[ops.length - 1];
      return { mx: e.x + e.width / 2, my: e.y + e.height / 2, name: e.businessObject.name };
    });
    expect(neu.mx % 10).toBe(0);
    expect(neu.my % 10).toBe(0);
  });

  test('dragging an element by odd distances keeps it on the grid', async ({ page }) => {
    await laden(page);
    const lage = () => page.evaluate(() => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === 'Heizplatte' && x.type !== 'label')[0];
      const r = document.querySelector(`[data-element-id="${e.id}"]`).getBoundingClientRect();
      return { mx: e.x + e.width / 2, my: e.y + e.height / 2, sx: r.x + r.width / 2, sy: r.y + r.height / 2 };
    });
    for (const [dx, dy] of [[33, 17], [-47, 64], [12, -9]]) {
      const vorher = await lage();
      await page.mouse.move(vorher.sx, vorher.sy);
      await page.mouse.down();
      await page.mouse.move(vorher.sx + dx / 2, vorher.sy + dy / 2, { steps: 4 });
      await page.mouse.move(vorher.sx + dx, vorher.sy + dy, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      const nachher = await lage();
      expect(nachher.mx).not.toBe(vorher.mx);
      expect(nachher.mx % 10).toBe(0);
      expect(nachher.my % 10).toBe(0);
      // the snapped move stays within one grid step of the mouse
      expect(Math.abs(nachher.mx - vorher.mx - dx)).toBeLessThanOrEqual(10);
      expect(Math.abs(nachher.my - vorher.my - dy)).toBeLessThanOrEqual(10);
    }
  });

  test('grid and snapping are on again after a reload', async ({ page }) => {
    await laden(page);
    await page.evaluate(() => window.fpbjs.get('grid').toggle(false));
    await neuLaden(page);
    expect(await page.evaluate(() => window.fpbjs.get('grid').isVisible())).toBe(true);
  });
});
