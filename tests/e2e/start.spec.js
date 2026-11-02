import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import { ModelerPage } from './pages/ModelerPage';
import basis from './fixtures/temperieren.json';
import { noteById } from './helpers/ui';
import { installFakeFileSystem, fileSystem, nextPick } from './helpers/fileSystem';
import { pickFile } from './helpers/importDialog';

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
const imported = (page) => page.evaluate(() => new Promise((resolve) => {
  window.fpbjs.get('eventBus').once('import.done', () => resolve(true));
  setTimeout(() => resolve(false), 15000);
}));
const example = (page, title) => page.locator(`${CARD} .fpb-start-example`, { hasText: title });

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

  test('the web app offers four examples and Temperieren opens', async ({ page }) => {
    const { errors } = await start(page);
    const examples = page.locator(`${CARD} .fpb-start-example`);
    await expect(examples).toHaveCount(4);
    await expect(examples.locator('.fpb-start-example-title')).toHaveText([
      'Temperieren', 'Showcase A: heat exchanger', 'Showcase B: pharma batch', 'Showcase C: assembly'
    ]);
    const done = imported(page);
    await example(page, 'Temperieren').click();
    expect(await done).toBe(true);
    const project = await page.evaluate(() => window.fpbjs.getProcesses().find((e) => e.$type === 'fpb:Project').name);
    expect(project).toBe('Temperieren');
    expect(await page.evaluate(() => window.fpbjs.getProcesses().filter((e) => e.process).length)).toBe(2);
    await expect(page.locator(CARD)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('Showcase B asks which process view to open', async ({ page }) => {
    await start(page);
    await example(page, 'Showcase B').click();
    const dialog = page.locator(OPEN);
    await expect(dialog.locator('.aml-hierarchies')).toBeVisible({ timeout: 15000 });
    await expect(dialog.locator('.fpb-drop-zone-text')).toHaveText('Showcase-B-PharmaChargeUndReinigung.aml');
    const done = imported(page);
    await dialog.locator('[data-answer="open"]').click();
    expect(await done).toBe(true);
  });

  // Review Focus 3
  test('an example that does not load says so and the card stays usable', async ({ page }) => {
    await start(page);
    await page.route('**/examples/temperieren.json', (route) => route.fulfill({ status: 404, body: 'not found' }));
    await example(page, 'Temperieren').click();
    const note = noteById(page, 'start.example');
    await expect(note).toHaveClass(/fpb-notification--error/);
    await expect(note).toContainText('The example could not be loaded');
    await expect(note).toContainText('Temperieren');
    await expect(page.locator(CARD)).toBeVisible();
    await expect(example(page, 'Temperieren')).toBeEnabled();
    expect(await processCount(page)).toBe(0);
  });

  test('Ctrl+S after an example asks for a place, it never writes into the example', async ({ page }) => {
    await installFakeFileSystem(page);
    await start(page);
    const done = imported(page);
    await example(page, 'Temperieren').click();
    expect(await done).toBe(true);
    await nextPick(page, 'mein-modell.json');
    await page.evaluate(() => window.fpbjs.get('canvas').focus());
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await fileSystem(page)).writes.length).toBe(1);
    const disk = await fileSystem(page);
    expect(disk.pickers).toEqual([expect.objectContaining({ kind: 'save', suggestedName: 'temperieren.json' })]);
    expect(disk.writes[0].name).toBe('mein-modell.json');
  });

  // final review 016e D3, I2: a low canvas has a palette in two columns
  test('on a low canvas the card leaves the palette in two columns free', async ({ page }) => {
    await start(page, { width: 618, height: 450 });
    await expect(page.locator('.djs-palette-two-column')).toHaveCount(1);
    const boxes = await page.evaluate(() => ({
      card: document.querySelector('.fpb-start-card').getBoundingClientRect().toJSON(),
      palette: document.querySelector('.djs-palette').getBoundingClientRect().toJSON()
    }));
    expect(boxes.card.left).toBeGreaterThanOrEqual(boxes.palette.right);
  });

  // final review 016e D3, I3
  test('the keyboard focus goes to the canvas when the card goes', async ({ page }) => {
    await start(page);
    const done = imported(page);
    await example(page, 'Temperieren').focus();
    await page.keyboard.press('Enter');
    expect(await done).toBe(true);
    await expect.poll(() => page.evaluate(() => window.fpbjs.get('canvas').isFocused())).toBe(true);

    await page.evaluate(() => window.fpbjs.newModel());
    await page.locator(`${CARD} .fpb-start-open`).focus();
    await page.keyboard.press('Enter');
    await pickFile(page, JSON.stringify(basis), 'temperieren.json');
    const again = imported(page);
    await page.locator(`${OPEN} [data-answer="open"]`).click();
    expect(await again).toBe(true);
    await expect.poll(() => page.evaluate(() => window.fpbjs.get('canvas').isFocused())).toBe(true);
  });

  // final review 016e D3, I4
  test('while an example loads the others wait, and an import meanwhile wins', async ({ page }) => {
    await start(page);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route('**/examples/Showcase-A-WaermetauscherMitRegelung.aml', async (route) => {
      await held;
      await route.continue();
    });
    await example(page, 'Showcase A').click();
    await expect(page.locator(`${CARD} .fpb-start-example[aria-disabled="true"]`)).toHaveCount(4);
    await example(page, 'Temperieren').click({ force: true });
    await page.waitForTimeout(500);
    expect(await processCount(page)).toBe(0);

    // the user opens something else before the example arrives
    await page.evaluate((model) => window.fpbjs.get('eventBus').fire('FPBJS.import', { data: model }), JSON.parse(JSON.stringify(basis)));
    await expect.poll(() => processCount(page)).toBeGreaterThan(0);
    release();
    await page.waitForTimeout(2000);
    const project = await page.evaluate(() => window.fpbjs.getProcesses().find((e) => e.$type === 'fpb:Project').name);
    expect(project).toBe('FPBJS_Project');
    await expect(page.locator(OPEN)).toHaveCount(0);
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
