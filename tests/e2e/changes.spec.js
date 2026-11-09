// tests/e2e/changes.spec.js
import { test, expect } from './support/test';
import { load, switchTo, answer, IDS } from './helpers/layerCheck';
import { openPanel, select, field } from './helpers/panel';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * fpbChanges (032a V4, V5): model.changed after every edit that changes the
 * model, not for views (layer switch, opening a decomposition), imports or New
 * model; isDirty and markSaved shared by hosts, the web app and the backup.
 */

async function record(page) {
  await page.evaluate(() => {
    const bus = window.fpbjs.get('eventBus');
    window.__changes = { changed: 0, dirty: [] };
    bus.on('model.changed', () => { window.__changes.changed++; });
    bus.on('model.dirtyChanged', (e) => { window.__changes.dirty.push(e.dirty); });
  });
}

const changed = (page) => page.evaluate(() => window.__changes.changed);
const dirty = (page) => page.evaluate(() => window.fpbjs.get('fpbChanges').isDirty());
const settle = (page) => page.waitForTimeout(200);

const CANVAS = '#modeler-container .djs-container.djs-parent > svg';

function other() {
  const model = JSON.parse(JSON.stringify(basis));
  model[0].name = 'Zweites Projekt';
  return JSON.stringify(model);
}

const dropOnCanvas = (page, content, name) => page.evaluate(({ selector, content, name }) => {
  const target = document.querySelector(selector);
  const transfer = new DataTransfer();
  transfer.items.add(new File([content], name, { type: 'application/json' }));
  const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
  target.dispatchEvent(new DragEvent('dragenter', options));
  target.dispatchEvent(new DragEvent('dragover', options));
  target.dispatchEvent(new DragEvent('drop', options));
}, { selector: CANVAS, content, name });

const projectName = (page) => page.evaluate(() => {
  const project = window.fpbjs.getProcesses().find((e) => e && e.$type === 'fpb:Project');
  return project ? project.name : null;
});

test.describe('Changes', () => {

  test('model.changed on create, move, undo, redo and removing a decomposition; not on switching layers or opening one', async ({ page }) => {
    await load(page);
    await record(page);

    await switchTo(page, IDS.child);
    await switchTo(page, IDS.root);
    await settle(page);
    expect(await changed(page)).toBe(0);

    await page.evaluate(() => {
      const root = window.fpbjs.get('canvas').getRootElement();
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:TechnicalResource' });
      window.fpbjs.get('modeling').createShape(shape, { x: 1200, y: 300 }, root);
    });
    await settle(page);
    expect(await changed(page)).toBe(1);

    await page.evaluate((id) => {
      window.fpbjs.get('modeling').moveElements([window.fpbjs.get('elementRegistry').get(id)], { x: 10, y: 0 });
    }, IDS.pruefen);
    await settle(page);
    expect(await changed(page)).toBe(2);

    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    await settle(page);
    await page.evaluate(() => window.fpbjs.get('commandStack').redo());
    await settle(page);
    expect(await changed(page)).toBe(4);

    await switchTo(page, IDS.child);
    await page.evaluate(() => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      window.fpbjs.get('rules').allowed('elements.delete', { elements: [sl] });
    });
    await answer(page, 'confirm');
    await settle(page);
    expect(await changed(page)).toBe(5);
  });

  test('model.changed after a rename in the panel', async ({ page }) => {
    await openPanel(page);
    await record(page);
    await select(page, 'Erhitzen');
    const name = field(page, 'shortName');
    await name.click();
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await expect.poll(() => changed(page)).toBeGreaterThan(0);
  });

  test('no model.changed for an import or New model', async ({ page }) => {
    await load(page);
    await record(page);
    const importer = new ImportPage(page);
    await importer.import(JSON.parse(JSON.stringify(basis)));
    await page.evaluate(() => window.fpbjs.newModel());
    await settle(page);

    expect(await changed(page)).toBe(0);
    expect(await dirty(page)).toBe(false);
  });

  test('isDirty: false after import, true after an edit, false after markSaved', async ({ page }) => {
    await load(page);
    await record(page);
    expect(await dirty(page)).toBe(false);

    await page.evaluate((id) => {
      window.fpbjs.get('modeling').moveElements([window.fpbjs.get('elementRegistry').get(id)], { x: 10, y: 0 });
    }, IDS.pruefen);
    expect(await dirty(page)).toBe(true);

    await page.evaluate(() => window.fpbjs.get('fpbChanges').markSaved());
    expect(await dirty(page)).toBe(false);
    await settle(page);
    expect(await page.evaluate(() => window.__changes.dirty)).toEqual([true, false]);
  });

  test('isDirty is false on the empty start', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    expect(await dirty(page)).toBe(false);
  });

  test('isDirty is true after restoring a backup', async ({ page }) => {
    await load(page);
    // the backup fires its import with restored: true
    await page.evaluate((model) => new Promise((resolve) => {
      const bus = window.fpbjs.get('eventBus');
      bus.once('import.done', () => resolve());
      bus.fire('FPBJS.import', { data: model, amlSource: null, restored: true });
    }), JSON.parse(JSON.stringify(basis)));

    expect(await dirty(page)).toBe(true);
  });

  test('Open asks nothing after markSaved (with the browser backup)', async ({ page }) => {
    await load(page);
    await page.evaluate((id) => {
      window.fpbjs.get('modeling').moveElements([window.fpbjs.get('elementRegistry').get(id)], { x: 10, y: 0 });
    }, IDS.pruefen);
    await page.evaluate(() => window.fpbjs.get('fpbChanges').markSaved());

    const done = page.evaluate(() => new Promise((resolve) => {
      window.fpbjs.get('eventBus').once('import.done', () => resolve(true));
      setTimeout(() => resolve(false), 10000);
    }));
    await dropOnCanvas(page, other(), 'zweites.json');

    expect(await done).toBe(true);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(await projectName(page)).toBe('Zweites Projekt');
  });

  test('aligning state copies (F9) fires model.changed', async ({ page }) => {
    await load(page);
    await record(page);
    // the copies of Rohstoff differ in the fixture (long name, version on the
    // child layer): aligning them to the child's values is an edit
    await page.evaluate(({ id, child }) => {
      window.fpbjs.get('modeling').alignStateCopies(id, window.__lr.process(child));
    }, { id: IDS.rohstoff, child: IDS.child });
    await settle(page);
    expect(await changed(page)).toBe(1);

    // aligned now: doing it again changes nothing
    await page.evaluate(({ id, child }) => {
      window.fpbjs.get('modeling').alignStateCopies(id, window.__lr.process(child));
    }, { id: IDS.rohstoff, child: IDS.child });
    await settle(page);
    expect(await changed(page)).toBe(1);
  });

});
