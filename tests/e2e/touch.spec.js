// tests/e2e/touch.spec.js
// Touch input on an emulated tablet and phone. Drags are sent as real touch
// sequences through the Chrome DevTools protocol; Playwright's own touchscreen
// only knows taps.
import { test, expect, devices } from './support/test';
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

/**
 * Finger moves. Chromium gets real input events through CDP. Firefox and
 * WebKit have no CDP; there the page receives TouchEvents built in the page,
 * sent to the element under the first finger as a browser would.
 */
function touchDriver(page, context) {
  const chromium = context.browser().browserType().name() === 'chromium';
  let cdp;
  const session = async () => cdp || (cdp = await context.newCDPSession(page));

  // Builds and dispatches the TouchEvents of `steps` in the page, in order
  const dispatchInPage = (steps) => page.evaluate((steps) => steps.forEach(({ type, points }) => {
    const domType = { touchStart: 'touchstart', touchMove: 'touchmove', touchEnd: 'touchend' }[type];
    if (type === 'touchStart') {
      window.__touchTarget = document.elementFromPoint(points[0].x, points[0].y);
    }
    const target = window.__touchTarget || document.body;
    const touchAt = (p, i) => {
      const init = { identifier: i, target, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y, screenX: p.x, screenY: p.y };
      try {
        return new Touch(init);
      } catch (e) {
        // WebKit has no Touch constructor
        return init;
      }
    };
    const touches = points.map(touchAt);
    const last = window.__lastTouches || touches;
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      touches,
      targetTouches: touches,
      changedTouches: type === 'touchEnd' ? last : touches
    };
    let event;
    try {
      event = new TouchEvent(domType, init);
    } catch (e) {
      // WebKit (Safari) has no TouchEvent constructor either: the legacy way
      event = document.createEvent('TouchEvent');
      event.initEvent(domType, true, true);
      ['touches', 'targetTouches', 'changedTouches'].forEach((name) => {
        Object.defineProperty(event, name, { value: init[name] });
      });
    }
    target.dispatchEvent(event);
    window.__lastTouches = type === 'touchEnd' ? null : touches;
    if (type === 'touchEnd') {
      window.__touchTarget = null;
    }
  }), steps);

  const send = async (type, points) => {
    if (chromium) {
      const client = await session();
      await client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      return;
    }
    await dispatchInPage([{ type, points }]);
  };

  return {
    // Two taps at one spot. Separate calls from the test leave the time
    // between the taps to the load on the test machine; under a full parallel
    // run it went past the app's 350 ms. So all four events go out at once:
    // CDP delivers a session's commands in order, the page dispatches them in
    // one evaluate.
    async doubleTap([x, y]) {
      const steps = [
        { type: 'touchStart', points: [{ x, y }] }, { type: 'touchEnd', points: [] },
        { type: 'touchStart', points: [{ x, y }] }, { type: 'touchEnd', points: [] }
      ];
      if (chromium) {
        const client = await session();
        await Promise.all(steps.map(({ type, points }) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points })));
        return;
      }
      await dispatchInPage(steps);
    },
    async drag([x1, y1], [x2, y2], steps = 12) {
      await send('touchStart', [{ x: x1, y: y1 }]);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }]);
        await page.waitForTimeout(25);
      }
      await send('touchEnd', []);
      await page.waitForTimeout(500);
    },
    async pinch([cx, cy], from, to, steps = 8) {
      const at = (d) => [{ x: cx - d, y: cy }, { x: cx + d, y: cy }];
      await send('touchStart', at(from));
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', at(from + (to - from) * i / steps));
        await page.waitForTimeout(25);
      }
      await send('touchEnd', []);
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

    test('read-only: a finger moves no element and opens no context pad, but pans and zooms', async ({ page, context }) => {
      await openModel(page);
      await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
      const touch = touchDriver(page, context);

      const position = () => page.evaluate(() => {
        const e = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Warmprodukt')[0];
        return [e.x, e.y];
      });
      const before = await position();
      const [x, y] = await elementCenter(page, 'Warmprodukt');
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.fpbjs.get('contextPad').isOpen())).toBe(false);
      await touch.drag([x, y], [x + 60, y + 40]);
      expect(await position()).toEqual(before);

      const viewbox = () => page.evaluate(() => { const v = window.fpbjs.get('canvas').viewbox(); return [v.x, v.y]; });
      const canvas = await page.locator('.djs-container').first().boundingBox();
      const viewBefore = await viewbox();
      await touch.drag([canvas.x + 120, canvas.y + canvas.height - 80], [canvas.x + 220, canvas.y + canvas.height - 180]);
      expect(await viewbox()).not.toEqual(viewBefore);

      const zoomBefore = await page.evaluate(() => window.fpbjs.get('canvas').zoom());
      await touch.pinch([canvas.x + canvas.width / 2, canvas.y + canvas.height / 2], 40, 120);
      expect(await page.evaluate(() => window.fpbjs.get('canvas').zoom())).toBeGreaterThan(zoomBefore * 1.3);
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

      // Two fresh states as targets, in the lower part: the context pad of
      // Erhitzen opens below it and would otherwise cover them.
      const paletteEntry = center(await page.locator('.djs-palette [data-action="fpb-product"]').boundingBox());
      await touch.drag(paletteEntry, await freeSpot(page, 0.7), 14);
      await touch.drag(paletteEntry, await freeSpot(page, 0.7), 14);
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

    test('opens the label editor with a double tap', async ({ page, context }) => {
      await openModel(page);
      const touch = touchDriver(page, context);
      await touch.doubleTap(await elementCenter(page, 'Gutprodukt'));
      await expect(page.locator('.djs-direct-editing-content')).toHaveCount(1, { timeout: 2000 });
    });

    // the breadcrumbs (016d) lie on the canvas; a finger starting on them
    // must not take hold of the element beneath
    test('a swipe that starts on the breadcrumbs moves no element', async ({ page, context }) => {
      await openModel(page);
      const touch = touchDriver(page, context);
      await page.evaluate(() => {
        const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        window.fpbjs.get('modeling').decomposeProcessOperator(operator);
      });
      const card = page.locator('nav.fpb-breadcrumbs');
      await expect(card).toBeVisible();
      const [cx, cy] = center(await card.boundingBox());

      // bring an operator of the new layer under the card (boundary states
      // could not move anyway)
      const id = await page.evaluate(({ cx, cy }) => {
        const canvas = window.fpbjs.get('canvas');
        const element = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        const rect = window.fpbjs.get('elementRegistry').getGraphics(element).getBoundingClientRect();
        canvas.scroll({ dx: cx - (rect.left + rect.width / 2), dy: cy - (rect.top + rect.height / 2) });
        return element.id;
      }, { cx, cy });
      const position = () => page.evaluate((id) => {
        const e = window.fpbjs.get('elementRegistry').get(id);
        return [e.x, e.y];
      }, id);
      const before = await position();
      await page.evaluate(() => {
        window.__moves = 0;
        window.fpbjs.get('eventBus').on('shape.move.start', () => window.__moves++);
      });
      await touch.drag([cx, cy], [cx + 80, cy + 60]);
      expect(await page.evaluate(() => window.__moves)).toBe(0);
      expect(await position()).toEqual(before);
    });

    // final review 016e D3, I1: on touch devices the side panels float over
    // the canvas (index.html)
    test('the start card keeps clear of the toolbar that floats over the canvas', async ({ page }) => {
      await page.goto('/');
      await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
      await expect(page.locator('.fpb-start-card')).toBeVisible();
      const boxes = await page.evaluate(() => ({
        card: document.querySelector('.fpb-start-card').getBoundingClientRect().toJSON(),
        panels: document.querySelector('.side-panels').getBoundingClientRect().toJSON()
      }));
      expect(boxes.card.right).toBeLessThanOrEqual(boxes.panels.left);
    });

    // the start card (016e D3) lies on the canvas as well
    test('a tap on Open a file in the start card opens the dialog', async ({ page }) => {
      await page.goto('/');
      await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
      const button = page.locator('.fpb-start .fpb-start-open');
      await expect(button).toBeVisible();
      await page.touchscreen.tap(...center(await button.boundingBox()));
      await expect(page.locator('dialog.fpb-open-dialog[open]')).toBeVisible();
    });

    // the message stack (016e T7) lies on the canvas as well
    test('a swipe that starts on a message moves no element', async ({ page, context }) => {
      await openModel(page);
      const touch = touchDriver(page, context);
      await page.evaluate(() => window.fpbjs.get('fpbNotifications').show({
        key: 'touch', type: 'warning', title: 'A message to swipe on', message: 'It stays until dismissed.'
      }));
      const card = page.locator('.fpb-notification[data-id="touch"]');
      await expect(card).toBeVisible();
      const [cx, cy] = center(await card.boundingBox());

      const id = await page.evaluate(({ cx, cy }) => {
        const canvas = window.fpbjs.get('canvas');
        const element = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        const rect = window.fpbjs.get('elementRegistry').getGraphics(element).getBoundingClientRect();
        canvas.scroll({ dx: cx - (rect.left + rect.width / 2), dy: cy - (rect.top + rect.height / 2) });
        return element.id;
      }, { cx, cy });
      const position = () => page.evaluate((id) => {
        const e = window.fpbjs.get('elementRegistry').get(id);
        return [e.x, e.y];
      }, id);
      const before = await position();
      await page.evaluate(() => {
        window.__moves = 0;
        window.fpbjs.get('eventBus').on('shape.move.start', () => window.__moves++);
      });
      await touch.drag([cx, cy], [cx - 80, cy - 60]);
      expect(await page.evaluate(() => window.__moves)).toBe(0);
      expect(await position()).toEqual(before);
    });
  });
}
