import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * The view of each layer (016d V3): a layer left and visited again shows
 * the same section and zoom; the first visit fits the layer. Kept in memory
 * only; an import forgets it, and switches marked fpbTransient (the PDF
 * export walks every layer) change nothing.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const ROOT = '55b4780e-6896-4e92-b184-858cf0cb5b32';
const CHILD = '9ca400c0-a373-48c0-9f13-37ce196cee29';

async function laden(page, size = { width: 1600, height: 1000 }) {
  await page.setViewportSize(size);
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

const view = (page) => page.evaluate(() => {
  const box = window.fpbjs.get('canvas').viewbox();
  return { x: box.x, y: box.y, scale: box.scale };
});

/** Switch through the modeling, as the tree, the breadcrumbs and the keys do */
const switchTo = (page, id, hints) => page.evaluate(({ id, hints }) => {
  const shapes = [];
  const queue = [window.fpbjs.getProjectDefinition().entryPoint];
  while (queue.length) {
    const shape = queue.shift();
    shapes.push(shape);
    (shape.businessObject.consistsOfProcesses || []).forEach((child) => queue.push(child));
  }
  window.fpbjs.get('modeling').switchProcess(shapes.find((s) => s.id === id), hints);
}, { id, hints });

const setView = (page, x, y, scale) => page.evaluate(({ x, y, scale }) => {
  const canvas = window.fpbjs.get('canvas');
  const outer = canvas.viewbox().outer;
  canvas.viewbox({ x, y, width: outer.width / scale, height: outer.height / scale });
}, { x, y, scale });

/** Every element of the layer lies in the visible section */
const allVisible = (page) => page.evaluate(() => {
  const canvas = window.fpbjs.get('canvas');
  const box = canvas.viewbox();
  const root = canvas.getRootElement();
  return window.fpbjs.get('elementRegistry').filter((e) => e !== root && e.type !== 'label' && !e.waypoints)
    .every((e) => e.x >= box.x - 1 && e.y >= box.y - 1 && e.x + e.width <= box.x + box.width + 1 && e.y + e.height <= box.y + box.height + 1);
});

const close = (a, b) => {
  expect(a.x).toBeCloseTo(b.x, 1);
  expect(a.y).toBeCloseTo(b.y, 1);
  expect(a.scale).toBeCloseTo(b.scale, 2);
};

test.describe('View of each layer', () => {

  test('returning to a layer shows it as it was left', async ({ page }) => {
    await laden(page);
    await setView(page, 120, -40, 1.5);
    const left = await view(page);
    await switchTo(page, CHILD);
    await switchTo(page, ROOT);
    close(await view(page), left);
  });

  // a small window: at zoom 1 from the origin the layer would not fit
  const SMALL = { width: 900, height: 600 };

  test('the first visit to a layer fits it', async ({ page }) => {
    await laden(page, SMALL);
    await setView(page, 900, 900, 2);
    await switchTo(page, CHILD);
    expect((await view(page)).scale).toBeLessThanOrEqual(1);
    expect(await allVisible(page)).toBe(true);
  });

  test('a switch marked fpbTransient remembers nothing and leaves the view', async ({ page }) => {
    await laden(page, SMALL);
    await setView(page, 120, -40, 1.5);
    const left = await view(page);
    await switchTo(page, CHILD, { fpbTransient: true });
    await setView(page, 900, 900, 2);
    await switchTo(page, ROOT, { fpbTransient: true });
    close(await view(page), left);

    // the child was only passed through: a real visit fits it
    await switchTo(page, CHILD);
    expect(await allVisible(page)).toBe(true);
  });

  // Review Focus 1
  test('a new import forgets the views', async ({ page }) => {
    const importer = await laden(page, SMALL);
    await switchTo(page, CHILD);
    await setView(page, 900, 900, 2);
    await switchTo(page, ROOT);
    await importer.import(clone());
    await switchTo(page, CHILD);
    expect(await allVisible(page)).toBe(true);
  });

  // Review Focus 3
  test('a resized window between leaving and returning keeps origin and zoom', async ({ page }) => {
    await laden(page);
    await setView(page, 120, -40, 1.5);
    const left = await view(page);
    await switchTo(page, CHILD);
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(300);
    await switchTo(page, ROOT);
    close(await view(page), left);
  });
});
