import fs from 'fs';
import path from 'path';
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { OPEN, openImportDialog, dropFile, pickFile, importButton } from './helpers/importDialog';
import { noteById } from './helpers/ui';
import { installFakeFileSystem, fileSystem } from './helpers/fileSystem';

/**
 * Opening a model (016e D2, V8): the dialog "Open" is a native dialog of the
 * modeler (files/OpenDialog.js). The older tests of choosing and reading
 * files are in import-dialog-files.spec.js.
 */

async function start(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1500, height: 900 });
  const importer = new ImportPage(page);
  await importer.goto();
  return { importer, errors };
}

const processCount = (page) => page.evaluate(() => window.fpbjs.getProcesses().filter((p) => p && p.process).length);
const projectName = (page) => page.evaluate(() => {
  const project = window.fpbjs.getProcesses().find((e) => e && e.$type === 'fpb:Project');
  return project ? project.name : null;
});

const MIXED = fs.readFileSync(path.join(__dirname, '..', 'unit', 'aml', 'oracle', 'inputs', 'generated', 'mixed.aml'), 'utf8');
const CANVAS = '#modeler-container .djs-container.djs-parent';

/** A second model, to tell it from the first */
function other() {
  const model = JSON.parse(JSON.stringify(basis));
  model[0].name = 'Zweites Projekt';
  return JSON.stringify(model);
}

/** Drops a file on the canvas; returns whether the page took the drop */
const dropOnCanvas = (page, content, name, type = 'application/json') => page.evaluate(({ selector, content, name, type }) => {
  const target = document.querySelector(selector);
  const transfer = new DataTransfer();
  transfer.items.add(new File([content], name, { type }));
  const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
  target.dispatchEvent(new DragEvent('dragenter', options));
  target.dispatchEvent(new DragEvent('dragover', options));
  const drop = new DragEvent('drop', options);
  target.dispatchEvent(drop);
  return drop.defaultPrevented;
}, { selector: CANVAS + ' > svg', content, name, type });

const imported = (page) => page.evaluate(() => new Promise((resolve) => {
  window.fpbjs.get('eventBus').once('import.done', () => resolve(true));
  setTimeout(() => resolve(false), 10000);
}));

test.describe('Open', () => {

  test('Open is a native modal dialog; Escape closes it and the focus returns to the Open button', async ({ page }) => {
    const { errors } = await start(page);
    await page.locator('#openFileButton').focus();
    await page.keyboard.press('Enter');

    const dialog = page.locator(OPEN);
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d) => d.tagName === 'DIALOG' && d.matches(':modal'))).toBe(true);
    const labelledBy = await dialog.getAttribute('aria-labelledby');
    await expect(page.locator('#' + labelledBy)).toHaveText('Open');
    await expect(dialog.getByRole('button', { name: 'Choose file' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#openFileButton')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('a file dropped anywhere on the card is taken', async ({ page }) => {
    const { importer } = await start(page);
    await openImportDialog(page);

    const taken = await page.evaluate((text) => {
      const title = document.querySelector('dialog.fpb-open-dialog[open] .fpb-dialog-title');
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], 'temperieren.json', { type: 'application/json' }));
      const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
      title.dispatchEvent(new DragEvent('dragover', options));
      const drop = new DragEvent('drop', options);
      title.dispatchEvent(drop);
      return drop.defaultPrevented;
    }, JSON.stringify(basis));

    expect(taken).toBe(true);
    await expect(page.locator(`${OPEN} .fpb-drop-zone-text`)).toHaveText('temperieren.json');
    await importButton(page).click();
    await expect(page.locator(OPEN)).toHaveCount(0);
    await page.waitForTimeout(importer.importDelay);
    expect(await processCount(page)).toBe(2);
  });

  test('the error of a file stays in the dialog until another file is chosen', async ({ page }) => {
    await start(page);
    await openImportDialog(page);

    await dropFile(page, 'kein Modell', 'notizen.txt');
    const error = page.locator(`${OPEN} .fpb-open-error`);
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toContainText('Invalid file type');
    await page.waitForTimeout(1000);
    await expect(error).toBeVisible();

    await pickFile(page, JSON.stringify(basis), 'temperieren.json');
    await expect(error).toHaveCount(0);
    await expect(importButton(page)).toBeEnabled();
  });

  test('Open closes when read-only mode starts', async ({ page }) => {
    await start(page);
    await openImportDialog(page);
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await expect(page.locator(OPEN)).toHaveCount(0);
    await expect(page.locator('#openFileButton')).toBeDisabled();
  });
});

test.describe('Open with the keyboard and by dropping on the canvas', () => {

  test('a JSON file dropped on the canvas opens', async ({ page }) => {
    const { errors } = await start(page);
    const done = imported(page);
    expect(await dropOnCanvas(page, JSON.stringify(basis), 'temperieren.json')).toBe(true);
    expect(await done).toBe(true);
    expect(await processCount(page)).toBe(2);
    expect(errors).toEqual([]);
  });

  test('a dragged file shows where it can be dropped and the hint goes when it leaves', async ({ page }) => {
    await start(page);
    const container = page.locator(CANVAS);
    await page.evaluate((selector) => {
      const target = document.querySelector(selector + ' > svg');
      const transfer = new DataTransfer();
      transfer.items.add(new File(['[]'], 'x.json'));
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, CANVAS);
    await expect(container).toHaveClass(/fpb-drop-active/);
    await expect(container.locator('.fpb-drop-hint')).toHaveText('Drop the file to open it');

    await page.evaluate((selector) => {
      const target = document.querySelector(selector + ' > svg');
      target.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body, dataTransfer: new DataTransfer() }));
    }, CANVAS);
    await expect(container).not.toHaveClass(/fpb-drop-active/);
    await expect(container.locator('.fpb-drop-hint')).toHaveCount(0);
  });

  // Review Focus 5
  test('an image or an empty file dropped on the canvas is refused with a message and the model stays', async ({ page }) => {
    const { importer } = await start(page);
    await importer.import(JSON.parse(JSON.stringify(basis)));

    expect(await dropOnCanvas(page, 'PNG', 'bild.png', 'image/png')).toBe(true);
    await expect(noteById(page, 'import.error')).toContainText('Invalid file type');

    expect(await dropOnCanvas(page, '', 'leer.json')).toBe(true);
    await expect(noteById(page, 'import.error')).toContainText('Invalid file format');
    await page.waitForTimeout(300);
    expect(await projectName(page)).toBe('FPBJS_Project');
    expect(await processCount(page)).toBe(2);
  });

  // Review Focus 5
  test('in read-only mode a dropped file is refused', async ({ page }) => {
    const { importer } = await start(page);
    await importer.import(JSON.parse(JSON.stringify(basis)));
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));

    expect(await dropOnCanvas(page, other(), 'zweites.json')).toBe(true);
    await expect(noteById(page, 'files.readOnly')).toContainText('Opening a file is not possible in read-only mode.');
    await page.waitForTimeout(300);
    expect(await projectName(page)).toBe('FPBJS_Project');
  });

  test('a dropped AML file with two process views opens the dialog to choose', async ({ page }) => {
    await start(page);
    expect(await dropOnCanvas(page, MIXED, 'Anlage.aml', 'application/xml')).toBe(true);
    const dialog = page.locator(OPEN);
    await expect(dialog.locator('.aml-hierarchies')).toBeVisible({ timeout: 15000 });
    await expect(dialog.locator('.fpb-drop-zone-text')).toHaveText('Anlage.aml');
    await dialog.locator('.aml-hierarchies').getByLabel('FPBJS_Project').check();
    const done = imported(page);
    await importButton(page).click();
    expect(await done).toBe(true);
  });

  // final review 016e D2, I2
  test('right after the page loads, before any click, Ctrl+O opens the dialog', async ({ page }) => {
    await start(page);
    await page.keyboard.press('Control+o');
    await expect(page.locator(OPEN)).toBeVisible();
  });

  // final review 016e D2, I3: a browser drops nothing where the drop is
  // refused, so the reason shows while the file is dragged
  test('in read-only mode a file dragged over the canvas says why it cannot be dropped', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    const dropEffect = await page.evaluate((selector) => {
      const target = document.querySelector(selector + ' > svg');
      const transfer = new DataTransfer();
      transfer.items.add(new File(['[]'], 'x.json'));
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer });
      target.dispatchEvent(over);
      return transfer.dropEffect;
    }, CANVAS);
    expect(dropEffect).toBe('none');
    const hint = page.locator(`${CANVAS} .fpb-drop-hint`);
    await expect(hint).toHaveClass(/is-refused/);
    await expect(hint).toHaveText('Opening a file is not possible in read-only mode.');
  });

  test('Ctrl+O opens the dialog; in read-only mode it says why not', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.fpbjs.get('canvas').focus());
    await page.keyboard.press('Control+o');
    await expect(page.locator(OPEN)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(OPEN)).toHaveCount(0);

    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await page.evaluate(() => window.fpbjs.get('canvas').focus());
    await page.keyboard.press('Control+o');
    await expect(noteById(page, 'files.readOnly')).toBeVisible();
    await expect(page.locator(OPEN)).toHaveCount(0);
  });

  test('opening over unsaved work asks first, Cancel keeps the model', async ({ page }) => {
    const { importer } = await start(page);
    await importer.import(JSON.parse(JSON.stringify(basis)));
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('modeling').moveElements([operator], { x: 20, y: 0 });
    });
    const question = page.getByRole('alertdialog');

    // dropped on the canvas
    await dropOnCanvas(page, other(), 'zweites.json');
    await expect(question).toContainText('Open another model?');
    await question.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(300);
    expect(await projectName(page)).toBe('FPBJS_Project');

    // through the dialog: the question comes over it, Cancel goes back to it
    await openImportDialog(page);
    await pickFile(page, other(), 'zweites.json');
    await importButton(page).click();
    await expect(question).toBeVisible();
    await question.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator(OPEN)).toBeVisible();
    await importButton(page).click();
    const done = imported(page);
    await question.getByRole('button', { name: 'Open file' }).click();
    expect(await done).toBe(true);
    await expect(page.locator(OPEN)).toHaveCount(0);
    expect(await projectName(page)).toBe('Zweites Projekt');
  });

  // 016g A7
  test('dropping several files opens the first and says so', async ({ page }) => {
    await start(page);
    const done = imported(page);
    await page.evaluate(({ selector, first, second }) => {
      const target = document.querySelector(selector);
      const transfer = new DataTransfer();
      transfer.items.add(new File([first], 'first.json', { type: 'application/json' }));
      transfer.items.add(new File([second], 'second.json', { type: 'application/json' }));
      const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
      target.dispatchEvent(new DragEvent('dragover', options));
      target.dispatchEvent(new DragEvent('drop', options));
    }, { selector: CANVAS + ' > svg', first: other(), second: JSON.stringify(basis) });
    expect(await done).toBe(true);
    expect(await projectName(page)).toBe('Zweites Projekt');
    await expect(noteById(page, 'files.onlyFirst')).toContainText('Only first.json was opened. FPB.js opens one file at a time.');
  });

  test('dropping several files on the dialog Open takes the first and says so', async ({ page }) => {
    await start(page);
    await openImportDialog(page);
    await page.evaluate(({ first, second }) => {
      const title = document.querySelector('dialog.fpb-open-dialog[open] .fpb-dialog-title');
      const transfer = new DataTransfer();
      transfer.items.add(new File([first], 'first.json', { type: 'application/json' }));
      transfer.items.add(new File([second], 'second.json', { type: 'application/json' }));
      const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
      title.dispatchEvent(new DragEvent('dragover', options));
      title.dispatchEvent(new DragEvent('drop', options));
    }, { first: other(), second: JSON.stringify(basis) });
    await expect(page.locator(`${OPEN} .fpb-drop-zone-text`)).toHaveText('first.json');
    await expect(noteById(page, 'files.onlyFirst')).toContainText('Only first.json was opened. FPB.js opens one file at a time.');
  });

  // 016g A2
  test('a file dropped on the dialog Open is the one Ctrl+S saves into', async ({ page }) => {
    await installFakeFileSystem(page);
    await start(page);
    await openImportDialog(page);
    await page.evaluate((text) => {
      const title = document.querySelector('dialog.fpb-open-dialog[open] .fpb-dialog-title');
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], 'abgelegt.json', { type: 'application/json' }));
      const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
      title.dispatchEvent(new DragEvent('dragover', options));
      title.dispatchEvent(new DragEvent('drop', options));
    }, other());
    await expect(page.locator(`${OPEN} .fpb-drop-zone-text`)).toHaveText('abgelegt.json');
    const done = imported(page);
    await importButton(page).click();
    expect(await done).toBe(true);

    await page.evaluate(() => window.fpbjs.get('canvas').focus());
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await fileSystem(page)).writes.length).toBe(1);
    const disk = await fileSystem(page);
    expect(disk.writes[0].name).toBe('abgelegt.json');
    expect(disk.pickers).toEqual([]);
  });

  test('a file dropped on the canvas in Chrome is saved back into it', async ({ page }) => {
    await installFakeFileSystem(page);
    await start(page);
    const done = imported(page);
    await dropOnCanvas(page, JSON.stringify(basis), 'abgelegt.json');
    expect(await done).toBe(true);

    await page.evaluate(() => window.fpbjs.get('canvas').focus());
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await fileSystem(page)).writes.length).toBe(1);
    const disk = await fileSystem(page);
    expect(disk.writes[0].name).toBe('abgelegt.json');
    expect(disk.asked).toBe(1);
    expect(disk.pickers).toEqual([]);
  });
});
