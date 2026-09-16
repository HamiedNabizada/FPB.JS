// tests/e2e/touch.spec.js
// Touch input on an emulated tablet and phone. Drags are sent as real touch
// sequences through the Chrome DevTools protocol; Playwright's own touchscreen
// only knows taps.
import { test, expect, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixture = path.join(__dirname, '..', 'unit', 'layout', 'fixtures', 'temperieren.json');

async function openModel(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
  await page.evaluate((json) => {
    window.fpbjs.get('eventBus').fire('FPBJS.import', { data: json });
  }, JSON.parse(fs.readFileSync(fixture, 'utf8')));
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.fpbjs.get('canvas').zoom('fit-viewport'));
  await page.waitForTimeout(300);
}

function touchDriver(page, context) {
  let cdp;
  const session = async () => cdp || (cdp = await context.newCDPSession(page));
  return {
    async drag([x1, y1], [x2, y2], steps = 12) {
      const client = await session();
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
      for (let i = 1; i <= steps; i++) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }]
        });
        await page.waitForTimeout(25);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(500);
    },
    async pinch([cx, cy], from, to, steps = 8) {
      const client = await session();
      const at = (d) => [{ x: cx - d, y: cy }, { x: cx + d, y: cy }];
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
      for (let i = 1; i <= steps; i++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(from + (to - from) * i / steps) });
        await page.waitForTimeout(25);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
    }
  };
}

const center = (box) => [box.x + box.width / 2, box.y + box.height / 2];

async function elementCenter(page, name) {
  const id = await page.evaluate((n) => window.fpbjs.get('elementRegistry')
    .filter((e) => e.businessObject && e.businessObject.name === n && e.type !== 'label')[0].id, name);
  return center(await page.locator(`[data-element-id="${id}"]`).first().boundingBox());
}

/** A screen point inside the SystemLimit with nothing but the SystemLimit under it. */
function freeSpot(page, minFy = 0.2) {
  return page.evaluate((minFy) => {
    const registry = window.fpbjs.get('elementRegistry');
    const systemLimit = registry.filter((e) => e.businessObject && e.businessObject.$type === 'fpb:SystemLimit')[0];
    const box = document.querySelector(`[data-element-id="${systemLimit.id}"]`).getBoundingClientRect();
    for (let fy = minFy; fy <= 0.85; fy += 0.1) {
      for (let fx = 0.1; fx <= 0.9; fx += 0.1) {
        const x = box.left + box.width * fx;
        const y = box.top + box.height * fy;
        const nodes = document.elementsFromPoint(x, y);
        const hit = nodes.map((n) => n.closest && n.closest('[data-element-id]')).find(Boolean);
        const covered = nodes.some((n) => n.closest && n.closest('.djs-palette, .side-panels, .djs-context-pad'));
        if (hit && hit.getAttribute('data-element-id') === systemLimit.id && !covered) {
          return [x, y];
        }
      }
    }
    return null;
  }, minFy);
}

const countElements = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry')
  .filter((e) => e.businessObject && e.type !== 'label').length);
const countConnections = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.waypoints).length);

for (const [label, device] of [['tablet', devices['iPad (gen 7)']], ['phone', devices['iPhone 13']]]) {

  // defaultBrowserType may not be set inside a describe group.
  const { defaultBrowserType, ...deviceOptions } = device;

  test.describe(`Touch on ${label}`, () => {
    test.use(deviceOptions);

    test('uses the device width and enlarges context pad entries', async ({ page }) => {
      await openModel(page);
      const width = await page.evaluate(() => window.innerWidth);
      expect(width).toBe(device.viewport.width);

      await page.touchscreen.tap(...await elementCenter(page, 'Warmprodukt'));
      await page.waitForTimeout(500);
      const selected = await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.businessObject.name));
      expect(selected).toEqual(['Warmprodukt']);
      const entry = await page.locator('.djs-context-pad.open .entry').first().boundingBox();
      expect(entry.width).toBeGreaterThanOrEqual(40);
      expect(entry.height).toBeGreaterThanOrEqual(40);
    });

    test('drags an element, pans with one finger and zooms with two', async ({ page, context }) => {
      await openModel(page);
      const touch = touchDriver(page, context);

      const position = () => page.evaluate(() => {
        const e = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Warmprodukt')[0];
        return [e.x, e.y];
      });
      const before = await position();
      const [x, y] = await elementCenter(page, 'Warmprodukt');
      await touch.drag([x, y], [x + 60, y + 40]);
      const after = await position();
      expect(after[0]).toBeGreaterThan(before[0]);
      expect(after[1]).toBeGreaterThan(before[1]);

      const viewbox = () => page.evaluate(() => { const v = window.fpbjs.get('canvas').viewbox(); return [v.x, v.y]; });
      const canvas = await page.locator('.djs-container').first().boundingBox();
      const viewBefore = await viewbox();
      await touch.drag([canvas.x + 120, canvas.y + canvas.height - 80], [canvas.x + 220, canvas.y + canvas.height - 180]);
      const viewAfter = await viewbox();
      expect(viewAfter).not.toEqual(viewBefore);

      const zoomBefore = await page.evaluate(() => window.fpbjs.get('canvas').zoom());
      await touch.pinch([canvas.x + canvas.width / 2, canvas.y + canvas.height / 2], 40, 120);
      const zoomAfter = await page.evaluate(() => window.fpbjs.get('canvas').zoom());
      expect(zoomAfter).toBeGreaterThan(zoomBefore * 1.3);
    });

    test('creates elements from the palette by dragging and by tapping twice', async ({ page, context }) => {
      await openModel(page);
      const touch = touchDriver(page, context);

      const before = await countElements(page);
      const entry = center(await page.locator('.djs-palette [data-action="fpb-product"]').boundingBox());
      await touch.drag(entry, await freeSpot(page), 14);
      expect(await countElements(page)).toBe(before + 1);

      await page.touchscreen.tap(...center(await page.locator('.djs-palette [data-action="fpb-energy"]').boundingBox()));
      await page.waitForTimeout(300);
      await page.touchscreen.tap(...await freeSpot(page));
      await page.waitForTimeout(600);
      expect(await countElements(page)).toBe(before + 2);
    });

    test('connects through the context pad by dragging and by tapping', async ({ page, context }) => {
      await openModel(page);
      const touch = touchDriver(page, context);

      // Two fresh states below Erhitzen as targets.
      const paletteEntry = center(await page.locator('.djs-palette [data-action="fpb-product"]').boundingBox());
      await touch.drag(paletteEntry, await freeSpot(page, 0.5), 14);
      await touch.drag(paletteEntry, await freeSpot(page, 0.5), 14);
      const targets = await page.evaluate(() => window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.businessObject.$type === 'fpb:Product' && e.type !== 'label'
          && !(e.incoming || []).length && !(e.outgoing || []).length)
        .map((e) => e.id));
      expect(targets.length).toBe(2);
      const targetCenter = async (id) => center(await page.locator(`[data-element-id="${id}"]`).first().boundingBox());

      const openPad = async () => {
        await page.touchscreen.tap(...await elementCenter(page, 'Erhitzen'));
        await page.waitForTimeout(500);
        return center(await page.locator('.djs-context-pad.open .entry[data-action="connect"]').first().boundingBox());
      };

      const before = await countConnections(page);
      await touch.drag(await openPad(), await targetCenter(targets[0]), 14);
      expect(await countConnections(page)).toBe(before + 1);

      await page.touchscreen.tap(...await openPad());
      await page.waitForTimeout(300);
      await page.touchscreen.tap(...await targetCenter(targets[1]));
      await page.waitForTimeout(600);
      expect(await countConnections(page)).toBe(before + 2);
    });

    test('opens the label editor with a double tap', async ({ page }) => {
      await openModel(page);
      const [x, y] = await elementCenter(page, 'Gutprodukt');
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(80);
      await page.touchscreen.tap(x, y);
      await expect(page.locator('.djs-direct-editing-content')).toHaveCount(1, { timeout: 2000 });
    });
  });
}
