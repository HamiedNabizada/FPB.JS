// tests/e2e/import-dialog-files.spec.js
import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';
import { ImportPage } from './pages/ImportPage';
import { ModelBuilder } from './helpers/modelBuilder';
import { openImportDialog, dropFile, pickFile, pressImport, importButton } from './helpers/importDialog';

/**
 * The import dialog (ImportModal.js) beyond drag and drop of a good file:
 * file picker, wrong extensions and contents, format detection by content,
 * size limit, unreadable files, a failing hand-over, cancel, the drag
 * highlight, and a later import replacing the model.
 */

const LABEL = '.modal.show .fileLabel';
const DEFAULT_TEXT = 'Import a local stored FPB.js JSON file or XML file, or drop it here';

function model(prefix, name) {
  const m = new ModelBuilder(name);
  const p = m.process(`${prefix}-root`, `${prefix} Grenze`);
  const a = p.product('Ein', { x: 300, y: 75 });
  const op = p.operator('Tun', { x: 250, y: 250 });
  const b = p.product('Aus', { x: 300, y: 575 });
  p.flow(a, op);
  p.flow(op, b);
  return m.build();
}

const state = (page) => page.evaluate(() => {
  const entries = window.fpbjs.getProcesses();
  const project = entries.find((e) => e && e.$type === 'fpb:Project');
  return {
    project: project ? project.name : null,
    processes: entries.filter((e) => e && e.process).map((e) => e.process.id),
    root: window.fpbjs.get('canvas').getRootElement().id,
  };
});

async function start(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  return importer;
}

async function expectError(page, title, detail) {
  const alert = page.locator('.alert-danger');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(title);
  if (detail) {
    await alert.locator('summary').click();
    await expect(alert).toContainText(detail);
  }
}

test.describe('Import dialog - choosing files', () => {

  test('a JSON file chosen with the file picker is imported', async ({ page }) => {
    await start(page);
    await openImportDialog(page);
    await expect(page.locator(LABEL)).toHaveText(DEFAULT_TEXT);
    await expect(importButton(page)).toBeDisabled();

    await pickFile(page, JSON.stringify(model('pick', 'Gewaehlt')), 'gewaehlt.json');

    await expect(page.locator(LABEL)).toHaveText('gewaehlt.json');
    const outcome = await pressImport(page);
    expect(outcome).toEqual({ done: 1, errors: [], warnings: [] });
    await expect(page.locator('.modal.show')).toHaveCount(0);
    expect(await state(page)).toEqual({ project: 'Gewaehlt', processes: ['pick-root'], root: 'pick-root' });
  });

  test('an XML file chosen with the file picker is imported', async ({ page }) => {
    await start(page);
    await openImportDialog(page);

    await pickFile(page, fs.readFileSync(path.join(__dirname, 'fixtures', 'import', 'handgeschrieben.xml'), 'utf8'), 'modell.XML', 'text/xml');

    const outcome = await pressImport(page);
    expect(outcome.errors).toEqual([]);
    expect(await state(page)).toEqual({ project: 'Handgeschrieben', processes: ['P1'], root: 'P1' });
  });

  test('a file with a wrong extension is refused through the picker as well', async ({ page }) => {
    await start(page);
    await openImportDialog(page);

    await pickFile(page, JSON.stringify(model('x', 'X')), 'modell.txt', 'text/plain');

    await expectError(page, 'Invalid file type', 'Please select a valid JSON (.json) or XML (.xml) file');
    await expect(page.locator(LABEL)).toHaveText(DEFAULT_TEXT);
    await expect(importButton(page)).toBeDisabled();
  });

  test('a file over 50 MB is refused', async ({ page }) => {
    await start(page);
    await openImportDialog(page);

    await page.evaluate(() => {
      const target = document.querySelector('.modal.show .fileLabel').closest('.modal-body');
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'riesig.json', { type: 'application/json' }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });

    await expectError(page, 'File too large', 'Maximum file size is 50MB');
    await expect(page.locator(LABEL)).toHaveText(DEFAULT_TEXT);
    await expect(importButton(page)).toBeDisabled();
  });

  test('a .json file that is no JSON is refused and cannot be imported', async ({ page }) => {
    await start(page);
    const before = await state(page);
    await openImportDialog(page);

    await dropFile(page, '{ "kaputt": ', 'kaputt.json');

    await expectError(page, 'Invalid file format', 'File format not recognized');
    // the button stays usable, but there is nothing to import
    await importButton(page).click();
    await expectError(page, 'No file selected', 'Please select a valid JSON file');
    await expect(page.locator('.modal.show')).toHaveCount(1);
    expect(await state(page)).toEqual(before);
  });

  test('JSON that is not an FPB.JS model reaches the importer and is rejected there', async ({ page }) => {
    await start(page);
    await openImportDialog(page);
    await dropFile(page, JSON.stringify([{ name: 'irgendwas' }, 1, 2]), 'fremd.json');
    await expect(page.locator(LABEL)).toHaveText('fremd.json');

    const outcome = await pressImport(page);

    expect(outcome.done).toBe(0);
    expect(outcome.errors[0]).toEqual(expect.objectContaining({ errorType: 'MISSING_PROJECT_DEFINITION' }));
    await expectError(page, 'No project definition found');
    expect((await state(page)).processes).toEqual([]);
  });

  test('the drop zone is highlighted while a file is dragged over it', async ({ page }) => {
    await start(page);
    await openImportDialog(page);

    const classes = await page.evaluate(async () => {
      const label = document.querySelector('.modal.show .fileLabel');
      const body = label.closest('.modal-body');
      const transfer = new DataTransfer();
      transfer.items.add(new File(['[]'], 'x.json'));
      const tick = () => new Promise((r) => setTimeout(r, 50));
      body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      await tick();
      const during = label.className;
      // leaving to an element inside the body keeps the highlight
      body.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: label, dataTransfer: transfer }));
      await tick();
      const inside = label.className;
      body.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body, dataTransfer: transfer }));
      await tick();
      return { during, inside, after: label.className };
    });

    expect(classes.during).toContain('fileLabel--dragover');
    expect(classes.inside).toContain('fileLabel--dragover');
    expect(classes.after).not.toContain('fileLabel--dragover');
  });

  test('the content decides the format: VDI 3682 XML in a .json file is read as XML', async ({ page }) => {
    await start(page);
    await openImportDialog(page);

    await dropFile(page, fs.readFileSync(path.join(__dirname, 'fixtures', 'import', 'handgeschrieben.xml'), 'utf8'), 'eigentlich-xml.json');

    const outcome = await pressImport(page);
    expect(outcome).toEqual({ done: 1, errors: [], warnings: [] });
    expect(await state(page)).toEqual({ project: 'Handgeschrieben', processes: ['P1'], root: 'P1' });
  });

  test('the content decides the format: FPB.JS JSON in a .xml file is read as JSON', async ({ page }) => {
    await start(page);
    await openImportDialog(page);

    await dropFile(page, JSON.stringify(model('json', 'Als XML benannt')), 'eigentlich-json.xml', 'text/xml');

    const outcome = await pressImport(page);
    expect(outcome).toEqual({ done: 1, errors: [], warnings: [] });
    expect(await state(page)).toEqual({ project: 'Als XML benannt', processes: ['json-root'], root: 'json-root' });
  });

  test('a file the browser cannot read is reported and nothing is imported', async ({ page }) => {
    const importer = await start(page);
    await importer.import(model('old', 'Altes Projekt'));
    const before = await state(page);
    await openImportDialog(page);
    await page.evaluate(() => {
      // as when the file was removed or locked between choosing and reading
      const Original = window.FileReader;
      window.FileReader = class extends Original {
        readAsText() {
          setTimeout(() => this.onerror(new ProgressEvent('error')), 0);
        }
      };
    });

    await dropFile(page, JSON.stringify(model('new', 'Neues Projekt')), 'gesperrt.json');

    await expectError(page, 'File read error', 'Unable to read the selected file');
    await importButton(page).click();
    await expectError(page, 'No file selected');
    await page.waitForTimeout(300);
    expect(await state(page)).toEqual(before);
  });

  test('an exception while handing the file over is shown, the dialog stays open', async ({ page }) => {
    const importer = await start(page);
    await importer.import(model('old', 'Altes Projekt'));
    const before = await state(page);
    await page.evaluate(() => {
      // a host listener in front of the importer that throws
      window.fpbjs.get('eventBus').on('FPBJS.import', 5000, () => {
        throw new Error('Host listener failed');
      });
    });
    await openImportDialog(page);
    await dropFile(page, JSON.stringify(model('new', 'Neues Projekt')), 'neu.json');
    await expect(importButton(page)).toBeEnabled();

    await importButton(page).click();

    await expectError(page, 'Import failed', 'An error occurred during import: Host listener failed');
    await expect(page.locator('.modal.show')).toHaveCount(1);
    await expect(page.locator(LABEL)).toHaveText('neu.json');
    await expect(importButton(page)).toBeEnabled();
    expect(await state(page)).toEqual(before);
  });

  test('a drop without a file changes nothing', async ({ page }) => {
    await start(page);
    await openImportDialog(page);

    await page.evaluate(() => {
      const body = document.querySelector('.modal.show .fileLabel').closest('.modal-body');
      body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    });

    await expect(page.locator(LABEL)).toHaveText(DEFAULT_TEXT);
    await expect(importButton(page)).toBeDisabled();
    await expect(page.locator('.alert-danger')).toHaveCount(0);
  });

});

test.describe('Import dialog - cancel and re-import', () => {

  test('closing the dialog after choosing a file imports nothing and forgets the file', async ({ page }) => {
    const importer = await start(page);
    await importer.import(model('old', 'Altes Projekt'));
    const before = await state(page);

    await openImportDialog(page);
    await dropFile(page, JSON.stringify(model('new', 'Neues Projekt')), 'neu.json');
    await expect(page.locator(LABEL)).toHaveText('neu.json');
    await page.getByRole('button', { name: 'Close import options' }).click();
    await expect(page.locator('.modal.show')).toHaveCount(0);
    await page.waitForTimeout(500);

    expect(await state(page)).toEqual(before);

    // opened again, the dialog starts empty
    await openImportDialog(page);
    await expect(page.locator(LABEL)).toHaveText(DEFAULT_TEXT);
    await expect(importButton(page)).toBeDisabled();
  });

  test('Escape closes the dialog without importing', async ({ page }) => {
    const importer = await start(page);
    await importer.import(model('old', 'Altes Projekt'));
    const before = await state(page);

    await openImportDialog(page);
    await dropFile(page, JSON.stringify(model('new', 'Neues Projekt')), 'neu.json');
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal.show')).toHaveCount(0);
    await page.waitForTimeout(500);

    expect(await state(page)).toEqual(before);
  });

  /** What the canvas shows, without labels and the root. */
  const canvasIds = (page) => page.evaluate(() => window.fpbjs.get('elementRegistry')
    .filter((e) => e.type !== 'label' && e.businessObject && e.businessObject.$type !== 'fpb:Process')
    .map((e) => e.id));

  test('a file imported through the dialog replaces a model loaded before', async ({ page }) => {
    const importer = await start(page);
    const first = model('first', 'Erstes');
    await importer.import(first);
    const firstIds = await canvasIds(page);
    expect(firstIds.length).toBeGreaterThan(3);

    await openImportDialog(page);
    await pickFile(page, JSON.stringify(model('second', 'Zweites')), 'zweites.json');
    expect(await pressImport(page)).toEqual({ done: 1, errors: [], warnings: [] });

    expect(await state(page)).toEqual({ project: 'Zweites', processes: ['second-root'], root: 'second-root' });
    const shown = await canvasIds(page);
    expect(shown.filter((id) => firstIds.includes(id))).toEqual([]);
    expect(shown.length).toBe(firstIds.length);
  });

  test('importing a second file through the dialog replaces the first model', async ({ page }) => {
    await start(page);
    await openImportDialog(page);
    await dropFile(page, JSON.stringify(model('first', 'Erstes')), 'erstes.json');
    expect((await pressImport(page)).done).toBe(1);
    expect(await state(page)).toEqual({ project: 'Erstes', processes: ['first-root'], root: 'first-root' });

    await openImportDialog(page);
    await expect(page.locator(LABEL)).toHaveText(DEFAULT_TEXT);
    await pickFile(page, JSON.stringify(model('second', 'Zweites')), 'zweites.json');
    await expect(page.locator(LABEL)).toHaveText('zweites.json');
    await expect(importButton(page)).toBeEnabled({ timeout: 3000 });
    expect((await pressImport(page)).done).toBe(1);

    expect(await state(page)).toEqual({ project: 'Zweites', processes: ['second-root'], root: 'second-root' });
    const leftovers = await page.evaluate(() => window.fpbjs.get('elementRegistry')
      .filter((e) => e.businessObject && /first/.test(String(e.businessObject.name || '') + (e.id || ''))).length);
    expect(leftovers).toBe(0);
  });

  test('a failed import through the dialog keeps the previous model, the next file goes through', async ({ page }) => {
    const importer = await start(page);
    await importer.import(model('first', 'Erstes'));
    const before = await state(page);
    const beforeIds = await canvasIds(page);

    await openImportDialog(page);
    const broken = model('second', 'Zweites').slice(1);
    await dropFile(page, JSON.stringify(broken), 'ohne-projekt.json');
    const outcome = await pressImport(page);

    expect(outcome.done).toBe(0);
    expect(outcome.errors[0]).toEqual(expect.objectContaining({ errorType: 'MISSING_PROJECT_DEFINITION' }));
    expect(await state(page)).toEqual(before);
    expect((await canvasIds(page)).sort()).toEqual(beforeIds.sort());
    await expectError(page, 'No project definition found');

    // the dialog closed, opens empty and takes the next file
    await openImportDialog(page);
    await expect(page.locator(LABEL)).toHaveText(DEFAULT_TEXT);
    await expect(importButton(page)).toBeDisabled();
    await dropFile(page, JSON.stringify(model('third', 'Drittes')), 'drittes.json');
    expect((await pressImport(page)).done).toBe(1);
    expect(await state(page)).toEqual({ project: 'Drittes', processes: ['third-root'], root: 'third-root' });
  });

});
