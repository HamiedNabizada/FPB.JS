// tests/e2e/sheets.spec.js
import { test, expect, devices } from './support/test';
import basis from './fixtures/temperieren.json';

/**
 * Sheets on narrow touch screens (016f E2): properties, layers and the model
 * check open as one sheet from the bottom over the whole width; the canvas
 * gives it its height, so nothing on the canvas lies on the sheet.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function load(page, withModel = true) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
  if (withModel) {
    await page.evaluate((data) => new Promise((resolve) => {
      window.fpbjs.get('eventBus').once('import.done', () => resolve());
      window.fpbjs.get('eventBus').fire('FPBJS.import', { data });
      setTimeout(resolve, 8000);
    }), clone());
    await page.evaluate(() => window.fpbjs.get('fpbNotifications').clear());
  }
  return errors;
}

const openSheet = (page, name = 'test', title = 'Test') =>
  page.evaluate(({ name, title }) => window.fpbjs.get('fpbSheets').open(name, { title }), { name, title });

const box = (page, selector) => page.evaluate((s) => {
  const e = document.querySelector(s);
  return e ? e.getBoundingClientRect().toJSON() : null;
}, selector);

const pageSize = (page) => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

const select = (page, name) => page.evaluate((name) => {
  const element = window.fpbjs.get('elementRegistry')
    .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0];
  window.fpbjs.get('selection').select(element);
}, name);

const propertiesSheet = (page) => page.locator('.fpb-sheet[data-sheet="properties"]');

/** A finding of the model check: Prüfen leaves its system limit (B2, an error) */
const makeFinding = (page) => page.evaluate(() => {
  const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Prüfen')[0];
  window.fpbjs.get('modeling').moveElements([operator], { x: 900, y: 0 });
});

/** Drag the head of the sheet with the mouse: pointer events, as a finger gives them */
async function dragHead(page, toY) {
  const head = await box(page, '.fpb-sheet-head');
  const x = head.left + 40;
  const y = head.top + head.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, (y + toY) / 2, { steps: 4 });
  await page.mouse.move(x, toY, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

for (const [label, device] of [['phone', devices['Pixel 5']], ['tablet', devices['iPad (gen 7)']]]) {

  // defaultBrowserType may not be set inside a describe group
  const { defaultBrowserType, ...deviceOptions } = device;

  test.describe(`Sheets on a ${label}`, () => {
    test.use(deviceOptions);

    test('a sheet opens from the bottom over the whole width, at half the height', async ({ page }) => {
      const errors = await load(page);
      await openSheet(page);
      const sheet = page.locator('.fpb-sheet');
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('.fpb-sheet-title')).toHaveText('Test');
      const size = await pageSize(page);
      const b = await box(page, '.fpb-sheet');
      expect(b.left).toBe(0);
      expect(Math.round(b.width)).toBe(size.width);
      expect(Math.round(b.bottom)).toBe(size.height);
      expect(Math.abs(b.height - size.height / 2)).toBeLessThanOrEqual(2);
      expect(errors).toEqual([]);
    });

    test('the canvas gives the sheet its height, nothing lies on the sheet', async ({ page }) => {
      await load(page);
      await page.evaluate(() => window.fpbjs.get('fpbNotifications').show({ key: 'sheet', type: 'warning', title: 'A message', message: 'Above the sheet.' }));
      await openSheet(page);
      await expect(page.locator('.fpb-sheet')).toBeVisible();
      await page.waitForTimeout(400);
      const top = (await box(page, '.fpb-sheet')).top;
      for (const selector of ['#modeler-container', '.djs-palette', '.fpb-breadcrumbs', '.side-panels', '.fpb-notification', '.djs-minimap']) {
        const b = await box(page, selector);
        expect(b, selector).not.toBeNull();
        expect(b.bottom, selector).toBeLessThanOrEqual(top + 1);
      }
      // also what overflows its box: every point of the head belongs to the sheet
      const hits = await page.evaluate(() => {
        const head = document.querySelector('.fpb-sheet-head').getBoundingClientRect();
        return [8, head.width / 2, head.width - 22].map((x) => {
          const hit = document.elementFromPoint(x, head.top + head.height / 2);
          return !!(hit && hit.closest('.fpb-sheet'));
        });
      });
      expect(hits).toEqual([true, true, true]);
      const groups = await page.evaluate(() => Array.from(document.querySelectorAll('.fpb-toolbar-group')).map((g) => g.getBoundingClientRect().bottom));
      groups.forEach((bottom) => expect(bottom).toBeLessThanOrEqual(top + 1));
    });

    test('dragging the head makes the sheet taller up to just below the top, dragging it down closes it', async ({ page, browserName }) => {
      // Playwright's Firefox with touch emulation sends no pointer events for
      // the mouse (only mousedown and mousemove); Firefox on Android does
      test.skip(browserName === 'firefox', 'no pointer events from the mouse under touch emulation');
      await load(page);
      await openSheet(page);
      await expect(page.locator('.fpb-sheet')).toBeVisible();
      const size = await pageSize(page);
      await dragHead(page, 10);
      expect(Math.abs((await box(page, '.fpb-sheet')).top - 56)).toBeLessThanOrEqual(2);
      await dragHead(page, size.height - 40);
      await expect(page.locator('.fpb-sheet')).toHaveCount(0);
      expect(await page.evaluate(() => window.fpbjs.get('fpbSheets').current())).toBeNull();
      // the canvas has the whole height again
      expect(Math.round((await box(page, '#modeler-container')).bottom)).toBe(size.height);
    });

    test('Escape and the cross close the sheet', async ({ page }) => {
      await load(page);
      await openSheet(page);
      await page.locator('.fpb-sheet-close').focus();
      await page.keyboard.press('Escape');
      await expect(page.locator('.fpb-sheet')).toHaveCount(0);
      await openSheet(page);
      await page.locator('.fpb-sheet-close').click();
      await expect(page.locator('.fpb-sheet')).toHaveCount(0);
    });

    // V11, plan decision 7
    test('Properties in the toolbar opens the panel as a sheet', async ({ page }) => {
      const errors = await load(page);
      const button = page.locator('#propertiesSheetButton');
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await button.tap();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const sheet = propertiesSheet(page);
      await expect(sheet.locator('.fpb-sheet-title')).toHaveText('Properties');
      await expect(sheet.locator('.fpb-panel-header')).toBeVisible();
      // the panel at the side shows nothing meanwhile
      await expect(page.locator('#propertiesPanelToggle')).toHaveCount(0);
      expect(await page.evaluate(() => document.getElementById('properties-container').children.length)).toBe(0);
      await expect(page.locator('#properties-container')).toBeHidden();
      await button.tap();
      await expect(sheet).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    // V10
    test('a tap on an element above the sheet shows it in the sheet', async ({ page }) => {
      await load(page);
      await page.locator('#propertiesSheetButton').tap();
      await expect(propertiesSheet(page)).toBeVisible();
      await page.waitForTimeout(400);
      await page.evaluate(() => window.fpbjs.get('canvas').zoom('fit-viewport'));
      const target = await page.evaluate(() => {
        const element = window.fpbjs.get('elementRegistry')
          .filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
        const r = document.querySelector('[data-element-id="' + element.id + '"] .djs-visual').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      expect(target.y).toBeLessThan((await box(page, '.fpb-sheet')).top);
      await page.touchscreen.tap(target.x, target.y);
      await expect(propertiesSheet(page).locator('.fpb-panel-header-name')).toHaveText('Erhitzen');
    });

    // review focus 1: the on-screen keyboard makes the page lower
    test('a field in the sheet stays in view when the page gets lower', async ({ page }) => {
      await load(page);
      await select(page, 'Erhitzen');
      await page.locator('#propertiesSheetButton').tap();
      const name = propertiesSheet(page).locator('#bio-properties-panel-shortName');
      await expect(name).toBeVisible();
      await name.focus();
      const size = await pageSize(page);
      const lower = Math.round(size.height * 0.55);
      await page.setViewportSize({ width: size.width, height: lower });
      await page.waitForTimeout(300);
      const field = await name.boundingBox();
      expect(field.y).toBeGreaterThanOrEqual(0);
      expect(field.y + field.height).toBeLessThanOrEqual(lower);
      await expect(name).toBeFocused();
    });

    // V9: the layers as a sheet
    test('Layers opens the tree as a sheet and a tap switches the layer', async ({ page }) => {
      await load(page);
      const button = page.locator('#openLayerButton');
      await button.tap();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const sheet = page.locator('.fpb-sheet[data-sheet="layers"]');
      await expect(sheet.locator('.fpb-sheet-title')).toHaveText('Layers');
      await expect(sheet.locator('.fpb-layers-tree')).toBeVisible();
      await expect(sheet.locator('.fpb-layers-project')).toContainText('FPBJS_Project');
      // no card in the toolbar
      await expect(page.locator('#layer-container .fpb-layers')).toHaveCount(0);
      await sheet.getByRole('treeitem', { name: 'Erhitzen', exact: true }).locator(':scope > .fpb-layers-node').tap();
      await expect(page.locator('.fpb-breadcrumbs')).toContainText('Erhitzen');
      await button.tap();
      await expect(sheet).toHaveCount(0);
    });

    test('only one sheet is open at a time', async ({ page }) => {
      await load(page);
      await page.locator('#propertiesSheetButton').tap();
      await expect(page.locator('.fpb-sheet')).toHaveCount(1);
      await page.locator('#openLayerButton').tap();
      await expect(page.locator('.fpb-sheet')).toHaveCount(1);
      await expect(page.locator('.fpb-sheet-title')).toHaveText('Layers');
      await expect(page.locator('#propertiesSheetButton')).toHaveAttribute('aria-pressed', 'false');
      await page.locator('#openValidationButton').tap();
      await expect(page.locator('.fpb-sheet')).toHaveCount(1);
      await expect(page.locator('.fpb-sheet-title')).toHaveText('Model check (VDI 3682)');
      await expect(page.locator('#openLayerButton')).toHaveAttribute('aria-pressed', 'false');
    });

    test('the model check opens as a sheet, also from Show findings', async ({ page }) => {
      await load(page);
      await makeFinding(page);
      await page.locator('#openValidationButton').tap();
      const sheet = page.locator('.fpb-sheet[data-sheet="check"]');
      await expect(sheet.locator('.fpb-sheet-title')).toHaveText('Model check (VDI 3682)');
      await expect(sheet.locator('.fpb-validation-list li').first()).toBeVisible();
      // the list brings no second head into the sheet
      await expect(sheet.locator('.fpb-validation-header')).toBeHidden();
      await page.locator('#openValidationButton').tap();
      await expect(sheet).toHaveCount(0);
      await expect(page.locator('.fpb-validation-panel.open')).toHaveCount(0);
      // the button "Show findings" of an import message calls openPanel
      await page.evaluate(() => window.fpbjs.get('fpbValidation').openPanel());
      await expect(sheet).toBeVisible();
    });

    // review focus 3
    test('a finding in the sheet opens the properties at its findings', async ({ page }) => {
      await load(page);
      await makeFinding(page);
      await page.locator('#openValidationButton').tap();
      const item = page.locator('.fpb-sheet[data-sheet="check"] .fpb-validation-list li').first();
      await expect(item).toBeVisible();
      await item.tap();
      await expect(propertiesSheet(page)).toBeVisible();
      await expect(propertiesSheet(page).locator('.fpb-panel-header-name')).toHaveText('Prüfen');
      await expect(propertiesSheet(page).locator('[data-group-id="group-findings"]')).toBeVisible();
    });

    test('a lower page keeps the sheet inside it', async ({ page }) => {
      await load(page);
      await openSheet(page);
      await dragHead(page, 10);
      const size = await pageSize(page);
      await page.setViewportSize({ width: size.width, height: Math.round(size.height / 2) });
      await page.waitForTimeout(300);
      const b = await box(page, '.fpb-sheet');
      expect(b.top).toBeGreaterThanOrEqual(56 - 1);
      expect(Math.round(b.bottom)).toBe(Math.round(size.height / 2));
    });
  });
}

test.describe('Sheets and the rest of the modeler', () => {
  const { defaultBrowserType: a, ...phone } = devices['Pixel 5'];
  const { defaultBrowserType: b, ...tablet } = devices['iPad (gen 7)'];

  // review focus 4
  test('read-only: the sheet shows the properties, nothing is editable', async ({ browser }) => {
    const context = await browser.newContext(phone);
    const page = await context.newPage();
    await load(page);
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await select(page, 'Erhitzen');
    await page.locator('#propertiesSheetButton').tap();
    await expect(propertiesSheet(page).locator('#bio-properties-panel-longName')).toHaveAttribute('readonly', '');
    await context.close();
  });

  // review focus 5
  test('the sheet follows light and dark', async ({ browser }) => {
    const context = await browser.newContext({ ...phone, colorScheme: 'dark' });
    const page = await context.newPage();
    await load(page);
    await page.locator('#propertiesSheetButton').tap();
    const colours = await page.evaluate(() => {
      const sheet = document.querySelector('.fpb-sheet');
      const title = document.querySelector('.fpb-sheet-title');
      const probe = document.createElement('span');
      probe.style.color = 'var(--fpb-surface)';
      sheet.appendChild(probe);
      const surface = getComputedStyle(probe).color;
      probe.remove();
      const channels = (value) => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const luminance = ([r, g, b]) => {
        const c = (v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
      };
      const background = getComputedStyle(sheet).backgroundColor;
      const a = luminance(channels(getComputedStyle(title).color));
      const b = luminance(channels(background));
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        background,
        surface,
        dark: luminance(channels(background)) < 0.2,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      };
    });
    expect(colours.theme).toBe('dark');
    expect(colours.background).toBe(colours.surface);
    expect(colours.dark).toBe(true);
    expect(colours.ratio).toBeGreaterThanOrEqual(4.5);
    await context.close();
  });

  // review focus 2, plan decision 9
  test('turning to landscape closes the sheet and the panel is back at the side', async ({ browser }) => {
    const context = await browser.newContext(tablet);
    const page = await context.newPage();
    await load(page);
    await page.locator('#propertiesSheetButton').tap();
    await expect(propertiesSheet(page)).toBeVisible();
    await page.setViewportSize({ width: 1080, height: 810 });
    await expect(page.locator('.fpb-sheet')).toHaveCount(0);
    await expect(page.locator('#propertiesSheetButton')).toHaveCount(0);
    const toggle = page.locator('#propertiesPanelToggle');
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.tap();
    }
    await expect(page.locator('#properties-container .fpb-panel-header')).toBeVisible();
    await page.waitForTimeout(400);
    expect(Math.round((await box(page, '#modeler-container')).bottom)).toBe(810);
    await context.close();
  });
});

test.describe('No sheets', () => {

  test('desktop and a tablet in landscape have no sheets', async ({ browser }) => {
    const desktop = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await load(desktop, false);
    await openSheet(desktop);
    expect(await desktop.evaluate(() => window.fpbjs.get('fpbSheets').isActive())).toBe(false);
    await expect(desktop.locator('.fpb-sheet')).toHaveCount(0);
    await desktop.close();

    const { defaultBrowserType, ...ipad } = devices['iPad (gen 7) landscape'];
    const context = await browser.newContext(ipad);
    const tablet = await context.newPage();
    await load(tablet, false);
    await openSheet(tablet);
    expect(await tablet.evaluate(() => window.fpbjs.get('fpbSheets').isActive())).toBe(false);
    await expect(tablet.locator('.fpb-sheet')).toHaveCount(0);
    await context.close();
  });
});
