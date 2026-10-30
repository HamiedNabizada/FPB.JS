import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import { noteById } from './helpers/ui';
import basis from './fixtures/temperieren.json';

/**
 * The message stack (016e V1): every message that belongs to no element is
 * a card at the bottom right of the canvas. Errors, warnings and messages
 * with buttons stay until dismissed, plain information goes by itself but
 * not while the pointer rests on it; the same key replaces a message, at
 * most five are shown.
 */

async function laden(page, size = { width: 1500, height: 900 }) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize(size);
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
  return { fehler };
}

const show = (page, options) => page.evaluate((options) => {
  window.fpbjs.get('fpbNotifications').show(options);
}, options);

const rect = (locator) => locator.evaluate((e) => {
  const r = e.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
});

const view = (page) => page.evaluate(() => {
  const box = window.fpbjs.get('canvas').viewbox();
  return { x: box.x, y: box.y, scale: box.scale };
});

test.describe('Message stack', () => {

  test('a message shows type, title, text, items and technical details', async ({ page }) => {
    const { fehler } = await laden(page);
    await show(page, {
      key: 'probe', type: 'error', title: 'Broken', message: 'Something failed',
      details: 'the stack', items: [{ message: 'first item', hint: 'do this' }]
    });
    const card = noteById(page, 'probe');
    await expect(card).toHaveClass(/fpb-notification--error/);
    await expect(card).toHaveAttribute('role', 'alert');
    await expect(card.locator('.fpb-notification-title')).toHaveText('Broken');
    await expect(card.locator('.fpb-notification-message')).toHaveText('Something failed');
    await expect(card.locator('.fpb-notification-items li')).toHaveCount(1);
    await expect(card.locator('.fpb-notification-hint')).toHaveText('do this');

    const details = card.locator('.fpb-notification-body > details.fpb-notification-details');
    await expect(details.locator('pre')).toBeHidden();
    await details.locator('summary').click();
    await expect(details.locator('pre')).toHaveText('the stack');

    // the stack lies in the canvas and speaks to screen readers
    const stack = page.locator('.djs-container section.fpb-notifications');
    await expect(stack).toHaveAttribute('aria-live', 'polite');
    await expect(stack).toHaveAttribute('aria-label', 'Messages');
    expect(fehler).toEqual([]);
  });

  // the clock is moved by the test, so a slow browser does not decide
  test('an info message goes by itself after 8 seconds, but not while the pointer rests on it', async ({ page }) => {
    await page.clock.install();
    await laden(page);
    await show(page, { key: 'short', type: 'info', title: 'Short' });
    await page.clock.fastForward(7000);
    await expect(noteById(page, 'short')).toBeVisible();
    await page.clock.fastForward(1500);
    await expect(noteById(page, 'short')).toHaveCount(0);

    await show(page, { key: 'rest', type: 'info', title: 'Resting' });
    const card = noteById(page, 'rest');
    await card.hover();
    await page.clock.fastForward(20000);
    await expect(card).toBeVisible();
    await page.mouse.move(700, 450);
    await page.clock.fastForward(8500);
    await expect(card).toHaveCount(0);
  });

  test('the same key replaces the message instead of stacking it', async ({ page }) => {
    await laden(page);
    await show(page, { key: 'same', type: 'warning', title: 'First' });
    await show(page, { key: 'same', type: 'warning', title: 'Second' });
    await expect(page.locator('.fpb-notification')).toHaveCount(1);
    await expect(noteById(page, 'same').locator('.fpb-notification-title')).toHaveText('Second');
  });

  test('at most five messages, the oldest goes', async ({ page }) => {
    await laden(page);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await show(page, { key: 'n' + n, type: 'warning', title: 'Message ' + n });
    }
    await expect(page.locator('.fpb-notification')).toHaveCount(5);
    await expect(noteById(page, 'n1')).toHaveCount(0);
    await expect(noteById(page, 'n6')).toBeVisible();
  });

  test('an action runs and Dismiss closes', async ({ page }) => {
    await laden(page);
    await page.evaluate(() => {
      window.__runs = 0;
      window.fpbjs.get('fpbNotifications').show({
        key: 'act', type: 'info', title: 'With buttons',
        actions: [
          { label: 'Go', run: () => { window.__runs++; } },
          { label: 'Go and close', run: () => { window.__runs++; }, dismiss: true }
        ]
      });
    });
    const card = noteById(page, 'act');
    await card.getByRole('button', { name: 'Go', exact: true }).click();
    expect(await page.evaluate(() => window.__runs)).toBe(1);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Dismiss' }).click();
    await expect(card).toHaveCount(0);

    await page.evaluate(() => window.fpbjs.get('fpbNotifications').show({
      key: 'act2', type: 'info', title: 'Again',
      actions: [{ label: 'Go and close', run: () => { window.__runs++; }, dismiss: true }]
    }));
    await noteById(page, 'act2').getByRole('button', { name: 'Go and close' }).click();
    await expect(noteById(page, 'act2')).toHaveCount(0);
    expect(await page.evaluate(() => window.__runs)).toBe(2);
  });

  test('a message with a name from the model shows it as text', async ({ page }) => {
    await laden(page);
    const name = '<img src=x onerror="window.__injected=true">';
    await show(page, { key: 'xss', type: 'warning', title: name, message: name, items: [{ message: name }] });
    const card = noteById(page, 'xss');
    await expect(card.locator('.fpb-notification-title')).toHaveText(name);
    expect(await card.locator('img').count()).toBe(0);
    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  });

  test('the wheel over a message does not move the canvas', async ({ page }) => {
    await laden(page);
    await show(page, { key: 'wheel', type: 'warning', title: 'Wheel', message: 'Scroll over me' });
    const box = await rect(noteById(page, 'wheel'));
    const before = await view(page);
    await page.mouse.move((box.left + box.right) / 2, (box.top + box.bottom) / 2);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
    expect(await view(page)).toEqual(before);

    // counter-check: the same wheel over the canvas moves it
    await page.mouse.move(600, 400);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => view(page)).not.toEqual(before);
  });

  // Review Focus 3
  test('an open model check list is not covered', async ({ page }) => {
    await laden(page);
    await page.evaluate(() => window.fpbjs.get('fpbValidation').openPanel());
    await show(page, { key: 'beside', type: 'warning', title: 'Beside the list' });
    const panel = await rect(page.locator('.fpb-validation-panel.open'));
    const stack = await rect(page.locator('section.fpb-notifications'));
    expect(stack.right).toBeLessThanOrEqual(panel.left);
  });

  // Review Focus 5
  test('on a narrow canvas the stack fits and leaves the palette free', async ({ page }) => {
    await laden(page, { width: 390, height: 800 });
    await show(page, { key: 'narrow', type: 'warning', title: 'A message with a longer title on a phone', message: 'Some text.' });
    const card = await rect(noteById(page, 'narrow'));
    const container = await rect(page.locator('.djs-container').first());
    const palette = await rect(page.locator('.djs-palette'));
    expect(card.left).toBeGreaterThanOrEqual(palette.right);
    expect(card.right).toBeLessThanOrEqual(container.right);
    expect(card.bottom).toBeLessThanOrEqual(container.bottom);
  });

  // final review 016e D1: narrow canvas with the list open, and a long
  // report under the breadcrumbs and beside the minimap
  test('on a narrow canvas a message stays in view while the model check list is open', async ({ page }) => {
    await laden(page, { width: 390, height: 800 });
    await page.evaluate(() => window.fpbjs.get('fpbValidation').openPanel());
    await show(page, { key: 'narrow-list', type: 'warning', title: 'Seen with the list open' });
    const card = await rect(noteById(page, 'narrow-list'));
    const container = await rect(page.locator('.djs-container').first());
    expect(card.left).toBeGreaterThanOrEqual(container.left);
    expect(card.right).toBeLessThanOrEqual(container.right);
    expect(card.right - card.left).toBeGreaterThan(100);
  });

  test('on a narrow canvas a long report leaves breadcrumbs and minimap free', async ({ page }) => {
    await laden(page, { width: 390, height: 800 });
    await page.evaluate(() => {
      const shapes = [];
      const queue = [window.fpbjs.getProjectDefinition().entryPoint];
      while (queue.length) {
        const shape = queue.shift();
        shapes.push(shape);
        (shape.businessObject.consistsOfProcesses || []).forEach((child) => queue.push(child));
      }
      window.fpbjs.get('modeling').switchProcess(shapes[1]);
    });
    await expect(page.locator('nav.fpb-breadcrumbs')).toBeVisible();
    await page.evaluate(() => window.fpbjs.get('fpbNotifications').clear());
    const items = Array.from({ length: 40 }, (_, i) => ({ message: 'A note about element number ' + i + ' of the file' }));
    await show(page, { key: 'long', type: 'warning', title: 'A long report', items });
    const card = await rect(noteById(page, 'long'));
    const crumbs = await rect(page.locator('nav.fpb-breadcrumbs'));
    const minimap = await rect(page.locator('.djs-minimap'));
    expect(card.top).toBeGreaterThanOrEqual(crumbs.bottom);
    expect(card.bottom <= minimap.top || card.left >= minimap.right).toBe(true);
  });
});
