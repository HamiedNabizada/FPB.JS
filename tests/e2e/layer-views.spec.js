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

  // 016g C2: the importer refuses the content, the model and its views stay
  test('a failed import keeps the remembered views', async ({ page }) => {
    await laden(page);
    await setView(page, 120, -40, 1.5);
    const left = await view(page);
    await switchTo(page, CHILD);
    const failed = await page.evaluate(() => new Promise((resolve) => {
      const bus = window.fpbjs.get('eventBus');
      bus.once('import.error', () => resolve(true));
      bus.fire('FPBJS.import', { data: {} });
      setTimeout(() => resolve(false), 5000);
    }));
    expect(failed).toBe(true);
    await switchTo(page, ROOT);
    close(await view(page), left);
  });

  // 016g, review focus 1 of C: the import comes while deep in a decomposition
  test('a new import while deep in a decomposition forgets the views and fits the new model', async ({ page }) => {
    const importer = await laden(page, SMALL);
    await switchTo(page, CHILD);
    await setView(page, 900, 900, 2);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Vorwärmen' && e.type !== 'label')[0];
      window.fpbjs.get('modeling').decomposeProcessOperator(operator);
    });
    await expect.poll(() => page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id)).not.toBe(CHILD);
    await importer.import(clone());
    await expect.poll(() => page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id)).toBe(ROOT);
    expect(await allVisible(page)).toBe(true);
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

  // the decompose and compose buttons of the context pad are ways into and
  // out of a layer as well
  const root = (page) => page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);
  const decompose = (page, name) => page.evaluate((name) => {
    const operator = window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0];
    window.fpbjs.get('modeling').decomposeProcessOperator(operator);
  }, name);
  const compose = (page) => page.evaluate(() => {
    const systemLimit = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
    window.fpbjs.get('modeling').composeProcess(systemLimit);
  });

  test('the decompose button fits an existing decomposition at the first visit and the parent stays as it was left', async ({ page }) => {
    await laden(page, SMALL);
    await setView(page, 120, -40, 1.5);
    const left = await view(page);
    await decompose(page, 'Erhitzen');
    expect(await root(page)).toBe(CHILD);
    expect(await allVisible(page)).toBe(true);
    await switchTo(page, ROOT);
    close(await view(page), left);
  });

  test('composing returns to the parent as it was left and the child keeps its view', async ({ page }) => {
    await laden(page);
    await setView(page, 120, -40, 1.5);
    const parent = await view(page);
    await switchTo(page, CHILD);
    await setView(page, 300, 300, 0.7);
    const child = await view(page);
    await compose(page);
    expect(await root(page)).toBe(ROOT);
    close(await view(page), parent);
    await switchTo(page, CHILD);
    close(await view(page), child);
  });

  // the one navigation hint (V4) lies where the new layer is seen; since
  // 016e D1 in the message stack
  const hintInside = async (page) => {
    const hint = page.locator('.fpb-notification', { hasText: 'Switching between processes is purely for navigation purposes.' });
    await expect(hint.first()).toBeVisible();
    return page.evaluate(() => {
      const tip = document.querySelector('.fpb-notification[data-id="feedback.navigation"]').getBoundingClientRect();
      const box = document.querySelector('.djs-container.djs-parent').getBoundingClientRect();
      return tip.left >= box.left && tip.top >= box.top && tip.right <= box.right && tip.bottom <= box.bottom;
    });
  };

  test('the navigation hint lies in the visible part of the new layer after a zoomed and scrolled layer', async ({ page }) => {
    await laden(page);
    await setView(page, 1500, 900, 2);
    await switchTo(page, CHILD);
    expect(await hintInside(page)).toBe(true);
  });

  test('the navigation hint lies in the visible part of the new layer at the first switch after the import', async ({ page }) => {
    await laden(page);
    await switchTo(page, CHILD);
    expect(await hintInside(page)).toBe(true);
  });
});
