import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import { ModelerPage } from './pages/ModelerPage';
import basis from './fixtures/temperieren.json';

/**
 * The start card on an empty canvas (016e D3, V12): how to begin, drawn,
 * opened or from an example. It goes with the first element or an import.
 */

const CARD = '.fpb-start';
const OPEN = 'dialog.fpb-open-dialog[open]';

async function start(page, size = { width: 1400, height: 900 }) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize(size);
  const importer = new ImportPage(page);
  await importer.goto();
  return { importer, errors };
}

const processCount = (page) => page.evaluate(() => (window.fpbjs.getProcesses() || []).length);

test.describe('Start card', () => {

  test('an empty canvas shows how to begin, and the card goes with the first element', async ({ page }) => {
    const { errors } = await start(page);
    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('aria-label', 'Start a model');
    await expect(card.locator('.fpb-start-title')).toHaveText('Start a model');
    await expect(card.locator('.fpb-start-draw')).toHaveText('Draw it with the tools on the left, beginning with a system limit.');
    await expect(card.locator('.fpb-start-open')).toContainText('Open a file');
    await expect(card.locator('.fpb-start-drop')).toHaveText('or drop a file here');

    await new ModelerPage(page).createSystemLimit({ x: 200, y: 150 });
    await expect.poll(() => processCount(page)).toBeGreaterThan(0);
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the card goes with an import and comes back with New model', async ({ page }) => {
    const { importer } = await start(page);
    await expect(page.locator(CARD)).toBeVisible();
    await importer.import(JSON.parse(JSON.stringify(basis)));
    await expect(page.locator(CARD)).toHaveCount(0);
    await page.evaluate(() => window.fpbjs.newModel());
    await expect(page.locator(CARD)).toBeVisible();
  });

  test('Open a file opens the dialog and the link opens the notation', async ({ page }) => {
    await start(page);
    await page.locator(`${CARD} .fpb-start-open`).click();
    await expect(page.locator(OPEN)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator(`${CARD} .fpb-start-notation`).click();
    const info = page.locator('dialog.fpb-info-dialog[open]');
    await expect(info.getByRole('tab', { name: 'Notation' })).toHaveAttribute('aria-selected', 'true');
  });

  // Review Focus 2
  test('the first element can be placed where the card stands', async ({ page }) => {
    await start(page);
    const box = await page.locator(`${CARD} .fpb-start-card`).boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.getByRole('button', { name: 'Add System Limit', exact: true }).click();
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => processCount(page)).toBeGreaterThan(0);
    const placed = await page.evaluate(({ x, y }) => {
      const limit = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      const r = window.fpbjs.get('elementRegistry').getGraphics(limit).getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }, point);
    expect(placed).toBe(true);
  });

  // Review Focus 5
  test('in read-only mode an empty canvas shows no card', async ({ page }) => {
    await start(page);
    await expect(page.locator(CARD)).toBeVisible();
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await expect(page.locator(CARD)).toHaveCount(0);
    await page.evaluate(() => window.fpbjs.get('readOnly').set(false));
    await expect(page.locator(CARD)).toBeVisible();
  });

  // Review Focus 4
  test('on a narrow canvas the card fits and leaves the palette free', async ({ page }) => {
    await start(page, { width: 390, height: 800 });
    const card = page.locator(`${CARD} .fpb-start-card`);
    await expect(card).toBeVisible();
    const boxes = await page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect().toJSON();
      return {
        card: rect(document.querySelector('.fpb-start-card')),
        container: rect(document.querySelector('#modeler-container .djs-container.djs-parent')),
        palette: rect(document.querySelector('.djs-palette'))
      };
    });
    expect(boxes.card.left).toBeGreaterThanOrEqual(boxes.palette.right);
    expect(boxes.card.right).toBeLessThanOrEqual(boxes.container.right);
    expect(boxes.card.top).toBeGreaterThanOrEqual(boxes.container.top);
    expect(boxes.card.bottom).toBeLessThanOrEqual(boxes.container.bottom);
    await page.locator(`${CARD} .fpb-start-open`).click();
    await expect(page.locator(OPEN)).toBeVisible();
  });
});
