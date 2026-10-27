// tests/e2e/read-only.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Read-only mode (read-only/ReadOnly.js on canvasLock of
 * @bpmn-io/diagram-js-canvas-lock): the user can look, zoom, switch layers,
 * search and export, but not change the model. The API stays writable.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const CHILD = '9ca400c0-a373-48c0-9f13-37ce196cee29';

async function laden(page) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return { importer, fehler };
}

const lesemodus = (page, an) => page.evaluate((an) => window.fpbjs.get('readOnly').set(an), an);

/** Everything the user could change: bounds, names, count, undo position */
const stand = (page) => page.evaluate(() => {
  const elements = window.fpbjs.get('elementRegistry').getAll()
    .filter((e) => e.type !== 'label')
    .map((e) => [e.id, e.x, e.y, e.width, e.height, e.businessObject && e.businessObject.name].join('|'))
    .sort();
  return { elements, stack: window.fpbjs.get('commandStack')._stackIdx };
});

const element = (page, name) => page.evaluate((name) => window.fpbjs.get('elementRegistry')
  .filter((e) => e.businessObject && e.businessObject.name === name && e.type !== 'label')[0].id, name);

async function mitte(page, name) {
  const id = await element(page, name);
  const box = await page.locator(`.djs-element[data-element-id="${id}"] .djs-visual`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function ziehen(page, von, dx, dy) {
  await page.mouse.move(von.x, von.y);
  await page.mouse.down();
  await page.mouse.move(von.x + dx / 2, von.y + dy / 2, { steps: 5 });
  await page.mouse.move(von.x + dx, von.y + dy, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

/** The toolbar has no options menu any more (016c); kept as a no-op for the tests */
async function optionenOeffnen(page) {
  await expect(page.locator('.layerPanel .fpb-toolbar-group').first()).toBeVisible();
}

test.describe('Read-only mode', () => {

  test('is off by default and fires readOnly.changed when switched', async ({ page }) => {
    const { fehler } = await laden(page);

    const ablauf = await page.evaluate(() => {
      const readOnly = window.fpbjs.get('readOnly');
      const events = [];
      window.fpbjs.get('eventBus').on('readOnly.changed', (e) => { events.push(e.readOnly); });
      const vorher = readOnly.isEnabled();
      readOnly.set(true);
      const an = readOnly.isEnabled();
      readOnly.set(true);
      readOnly.set(false);
      return { vorher, an, nachher: readOnly.isEnabled(), events };
    });

    expect(ablauf).toEqual({ vorher: false, an: true, nachher: false, events: [true, false] });
    expect(fehler).toEqual([]);
  });

  test('a click selects, but opens no context pad; dragging moves nothing', async ({ page }) => {
    const { fehler } = await laden(page);
    await lesemodus(page, true);
    const vorher = await stand(page);

    const p = await mitte(page, 'Warmprodukt');
    await page.mouse.click(p.x, p.y);
    const id = await element(page, 'Warmprodukt');
    expect(await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.id))).toEqual([id]);
    expect(await page.evaluate(() => window.fpbjs.get('contextPad').isOpen())).toBe(false);

    await ziehen(page, p, 120, 60);
    const q = await mitte(page, 'Erhitzen');
    await ziehen(page, q, -80, 90);

    expect(await stand(page)).toEqual(vorher);
    expect(fehler).toEqual([]);
  });

  test('a double click starts no renaming', async ({ page }) => {
    await laden(page);
    await lesemodus(page, true);
    const vorher = await stand(page);

    const p = await mitte(page, 'Erhitzen');
    await page.mouse.dblclick(p.x, p.y);
    await page.waitForTimeout(200);

    expect(await page.evaluate(() => window.fpbjs.get('directEditing').isActive())).toBe(false);
    await page.keyboard.type('Neu');
    await page.keyboard.press('Enter');
    expect(await stand(page)).toEqual(vorher);
  });

  test('delete, undo, paste and the alignment keys change nothing', async ({ page }) => {
    const { fehler } = await laden(page);

    // a change before, so undo would have something to take back
    await page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const state = registry.filter((e) => e.businessObject && e.businessObject.name === 'Ausschuss' && e.type !== 'label')[0];
      window.fpbjs.get('modeling').moveElements([state], { x: 0, y: 20 });
    });
    await lesemodus(page, true);
    const vorher = await stand(page);

    const a = await mitte(page, 'Warmprodukt');
    await page.mouse.click(a.x, a.y);
    const b = await mitte(page, 'Ausschuss');
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Shift');
    await page.evaluate(() => window.fpbjs.get('canvas').focus());

    for (const key of ['Control+c', 'Delete', 'Backspace', 'Control+v', 'Control+Shift+l', 'Control+Shift+t', 'Control+z', 'Control+y', 'ArrowRight']) {
      await page.keyboard.press(key);
    }
    await page.waitForTimeout(200);

    expect(await stand(page)).toEqual(vorher);
    expect(await page.evaluate(() => document.querySelectorAll('.modal.show').length)).toBe(0);
    expect(fehler).toEqual([]);
  });

  test('the palette is dimmed and its entries create nothing, also from the keyboard', async ({ page }) => {
    await laden(page);
    await lesemodus(page, true);
    const vorher = await stand(page);

    const eintrag = page.locator('.djs-palette .entry[data-action="fpb-product"]');
    expect(await eintrag.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');

    await eintrag.focus();
    await page.keyboard.press('Enter');
    const p = await mitte(page, 'Aufheizen mit Prüfung');
    await page.mouse.move(p.x + 40, p.y + 40, { steps: 3 });
    await page.mouse.click(p.x + 40, p.y + 40);
    await page.waitForTimeout(200);

    expect(await stand(page)).toEqual(vorher);
  });

  test('New model and Import are off, the export stays', async ({ page }) => {
    const { fehler } = await laden(page);
    await lesemodus(page, true);
    await optionenOeffnen(page);

    await expect(page.locator('#importOptionsButton')).toBeDisabled();
    if (await page.locator('#newModelButton').count()) {
      await expect(page.locator('#newModelButton')).toBeDisabled();
    }

    await page.getByRole('button', { name: 'Export Options' }).click();
    await expect(page.locator('.modal.show #formatJSON')).toBeVisible();
    await page.getByRole('button', { name: 'Close export options' }).click();

    await lesemodus(page, false);
    await expect(page.locator('#importOptionsButton')).toBeEnabled();
    expect(fehler).toEqual([]);
  });

  test('looking around stays: zoom keys, the process tree, the search', async ({ page }) => {
    const { fehler } = await laden(page);
    await lesemodus(page, true);
    await page.evaluate(() => window.fpbjs.get('canvas').focus());

    const zoom = await page.evaluate(() => window.fpbjs.get('canvas').zoom());
    await page.keyboard.press('Control+Equal');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.fpbjs.get('canvas').zoom())).toBeGreaterThan(zoom);

    await page.locator('#openLayerButton').click();
    await page.getByRole('treeitem', { name: 'Erhitzen', exact: true }).locator(':scope > .fpb-layers-node').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id)).toBe(CHILD);

    await page.evaluate(() => window.fpbjs.get('canvas').focus());
    await page.keyboard.press('Control+f');
    await expect(page.getByRole('textbox', { name: 'Search all layers' })).toBeVisible();

    expect(await page.evaluate(() => window.fpbjs.get('readOnly').isEnabled())).toBe(true);
    expect(fehler).toEqual([]);
  });

  test('switching it on closes an open context pad', async ({ page }) => {
    await laden(page);
    const p = await mitte(page, 'Warmprodukt');
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => window.fpbjs.get('contextPad').isOpen())).toBe(true);

    await lesemodus(page, true);
    expect(await page.evaluate(() => window.fpbjs.get('contextPad').isOpen())).toBe(false);
  });

  test('switched off, editing works again', async ({ page }) => {
    await laden(page);
    await lesemodus(page, true);
    await lesemodus(page, false);
    const vorher = await stand(page);

    const p = await mitte(page, 'Warmprodukt');
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => window.fpbjs.get('contextPad').isOpen())).toBe(true);
    await ziehen(page, p, 0, 40);

    expect(await stand(page)).not.toEqual(vorher);
  });

  test('the API still changes the model', async ({ page }) => {
    await laden(page);
    await lesemodus(page, true);
    const id = await element(page, 'Warmprodukt');

    const y = await page.evaluate((id) => {
      const shape = window.fpbjs.get('elementRegistry').get(id);
      const before = shape.y;
      window.fpbjs.get('modeling').moveElements([shape], { x: 0, y: 30 });
      return shape.y - before;
    }, id);

    expect(y).toBe(30);
  });
});
