import fs from 'fs';
import path from 'path';
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import { ModelerPage } from './pages/ModelerPage';
import basis from './fixtures/temperieren.json';
import { exportiere, nachIds } from './helpers/modelExport';
import { OPEN } from './helpers/importDialog';
import { noteById } from './helpers/ui';
import { installFakeFileSystem, withoutFileSystem, fileSystem, nextPick, changeOnDisk } from './helpers/fileSystem';
import { openPanel, select, field } from './helpers/panel';

/**
 * Saving (016e D2, V9): Ctrl+S writes the whole model with its layout, in
 * Chrome and Edge into the opened or last saved file, else as a download.
 * Ctrl+Shift+S always asks for a new place. Chromium works on the pickers
 * and file handles of helpers/fileSystem.js; the download is tested with
 * File System Access switched off, as in Firefox and Safari.
 */

const clone = () => JSON.parse(JSON.stringify(basis));
const MODEL = JSON.stringify(basis);
const NAME = 'FPBJS_Project';
const XML = fs.readFileSync(path.join(__dirname, 'fixtures', 'import', 'handgeschrieben.xml'), 'utf8');
const MIXED = fs.readFileSync(path.join(__dirname, '..', 'unit', 'aml', 'oracle', 'inputs', 'generated', 'mixed.aml'), 'utf8');
// one process view: it opens without the dialog
const SINGLE = fs.readFileSync(path.join(__dirname, '..', 'unit', 'aml', 'oracle', 'expected', 'convert', 'fpbjs-temperieren.aml'), 'utf8');

async function start(page, { files = {}, fileSystemAccess = true, model = true } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1500, height: 900 });
  if (fileSystemAccess) {
    await installFakeFileSystem(page, { files });
  } else {
    await withoutFileSystem(page);
  }
  const importer = new ImportPage(page);
  await importer.goto();
  if (model) {
    await importer.import(clone());
  }
  return { importer, errors };
}

/** Ctrl+S (with shift: Ctrl+Shift+S) with the keyboard focus on the canvas */
async function pressSave(page, shift = false) {
  await page.evaluate(() => window.fpbjs.get('canvas').focus());
  await page.keyboard.press(shift ? 'Control+Shift+S' : 'Control+s');
}

const writes = async (page) => (await fileSystem(page)).writes;
const waitForWrites = (page, n) => expect.poll(async () => (await writes(page)).length).toBe(n);

/** Opens a file of the fake disk through "Open" and "Choose file" */
async function openFromDisk(page, name) {
  await nextPick(page, name);
  await page.locator('#openFileButton').click();
  await page.locator(`${OPEN} .fpb-choose-file`).click();
  await expect(page.locator(`${OPEN} .fpb-drop-zone-text`)).toHaveText(name);
  const done = page.evaluate(() => new Promise((resolve) => {
    const bus = window.fpbjs.get('eventBus');
    const finish = (e) => {
      bus.off('import.done', finish);
      bus.off('import.error', finish);
      resolve(e.type);
    };
    bus.on('import.done', finish);
    bus.on('import.error', finish);
    setTimeout(() => resolve('timeout'), 15000);
  }));
  await page.locator(`${OPEN} [data-answer="open"]`).click();
  return done;
}

test.describe('Save', () => {

  test('Ctrl+S asks for a place the first time, then writes into that file without asking', async ({ page }) => {
    const { errors } = await start(page);
    await nextPick(page, 'modell.json');
    await pressSave(page);
    await waitForWrites(page, 1);

    let disk = await fileSystem(page);
    expect(disk.pickers).toEqual([{ kind: 'save', suggestedName: `${NAME}.json`, extensions: [['.json'], ['.aml']] }]);
    expect(disk.writes[0].name).toBe('modell.json');
    await expect(noteById(page, 'files.saved')).toContainText('Saved to modell.json');

    await pressSave(page);
    await waitForWrites(page, 2);
    disk = await fileSystem(page);
    expect(disk.pickers).toHaveLength(1);
    expect(disk.writes[1].name).toBe('modell.json');
    expect(errors).toEqual([]);
  });

  test('the saved file holds the whole model with layout and opens again to the same model', async ({ page }) => {
    const { importer } = await start(page);
    const before = await exportiere(page);
    await nextPick(page, 'modell.json');
    await pressSave(page);
    await waitForWrites(page, 1);

    const json = JSON.parse((await writes(page))[0].text);
    expect(nachIds(json)).toEqual(nachIds(before));
    json.filter((e) => e.process).forEach((e) => {
      expect(e.elementVisualInformation.length).toBe(e.elementDataInformation.length);
    });

    await importer.import(json);
    expect(nachIds(await exportiere(page))).toEqual(nachIds(before));
  });

  test('a JSON file chosen in Open is saved back into it after permission', async ({ page }) => {
    await start(page, { files: { 'offen.json': MODEL }, model: false });
    expect(await openFromDisk(page, 'offen.json')).toBe('import.done');

    await pressSave(page);
    await waitForWrites(page, 1);
    const disk = await fileSystem(page);
    expect(disk.writes[0].name).toBe('offen.json');
    expect(disk.asked).toBe(1);
    // only the open picker: no question where to save
    expect(disk.pickers.map((p) => p.kind)).toEqual(['open']);
  });

  test('Ctrl+Shift+S always asks for a new place', async ({ page }) => {
    await start(page);
    await nextPick(page, 'a.json');
    await pressSave(page);
    await waitForWrites(page, 1);

    await nextPick(page, 'b.json');
    await pressSave(page, true);
    await waitForWrites(page, 2);
    await pressSave(page);
    await waitForWrites(page, 3);

    const disk = await fileSystem(page);
    expect(disk.pickers.map((p) => p.kind)).toEqual(['save', 'save']);
    expect(disk.writes.map((w) => w.name)).toEqual(['a.json', 'b.json', 'b.json']);
  });

  test('a model from an AML file is written into that AML file and keeps the rest of it', async ({ page }) => {
    await start(page, { files: { 'Anlage.aml': MIXED }, model: false });
    expect(await openFromDisk(page, 'Anlage.aml')).toBe('import.done');
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('modeling').updateLabel(operator, 'Umbenannt');
    });

    await pressSave(page);
    await waitForWrites(page, 1);
    const written = (await writes(page))[0];
    expect(written.name).toBe('Anlage.aml');
    expect(written.text).toContain('Name="Umbenannt"');
    // the rest of the file
    expect(written.text).toContain('Name="Behaelter_B1"');
    await expect(noteById(page, 'files.saved')).toContainText('Saved to Anlage.aml');
  });

  // Review Focus 3
  test('a model from an XML file is saved as JSON, never into the XML file', async ({ page }) => {
    await start(page, { files: { 'modell.xml': XML }, model: false });
    expect(await openFromDisk(page, 'modell.xml')).toBe('import.done');

    await nextPick(page, 'modell.json');
    await pressSave(page);
    await waitForWrites(page, 1);
    const disk = await fileSystem(page);
    expect(disk.pickers[1]).toEqual(expect.objectContaining({ kind: 'save', suggestedName: 'modell.json' }));
    expect(disk.writes.map((w) => w.name)).toEqual(['modell.json']);
    expect(disk.files['modell.xml']).toBe(XML);
    expect(JSON.parse(disk.writes[0].text).find((e) => e.$type === 'fpb:Project').name).toBe('Handgeschrieben');
  });

  // Review Focus 4
  test('cancelling the choice of a place changes nothing and Ctrl+S asks again', async ({ page }) => {
    await start(page);
    let downloads = 0;
    page.on('download', () => downloads++);
    await nextPick(page, 'abort');
    await pressSave(page);
    await expect.poll(async () => (await fileSystem(page)).pickers.length).toBe(1);
    await page.waitForTimeout(500);
    expect(await writes(page)).toEqual([]);
    await expect(page.locator('.fpb-notification')).toHaveCount(0);
    expect(downloads).toBe(0);

    await nextPick(page, 'spaeter.json');
    await pressSave(page);
    await waitForWrites(page, 1);
    expect((await fileSystem(page)).pickers).toHaveLength(2);
  });

  // Review Focus 2
  test('after a failed import Ctrl+S still writes into the file of the model on screen', async ({ page }) => {
    const broken = JSON.stringify(clone().slice(1));
    await start(page, { files: { 'a.json': MODEL, 'b.json': broken }, model: false });
    expect(await openFromDisk(page, 'a.json')).toBe('import.done');
    expect(await openFromDisk(page, 'b.json')).toBe('import.error');

    await pressSave(page);
    await waitForWrites(page, 1);
    const disk = await fileSystem(page);
    expect(disk.writes.map((w) => w.name)).toEqual(['a.json']);
    expect(disk.files['b.json']).toBe(broken);
  });

  // Review Focus 1
  test('Ctrl+S right after typing a name in the properties panel saves that name', async ({ page }) => {
    await installFakeFileSystem(page);
    await openPanel(page);
    await select(page, 'Erhitzen');
    await field(page, 'longName').click();
    await page.keyboard.type('Gerade getippt');
    await nextPick(page, 'panel.json');
    await page.keyboard.press('Control+s');
    await waitForWrites(page, 1);

    const json = JSON.parse((await writes(page))[0].text);
    const operator = json.filter((e) => e.process).flatMap((e) => e.elementDataInformation).find((d) => d.name === 'Erhitzen');
    expect(operator.identification.longName).toBe('Gerade getippt');
  });

  test('Ctrl+S while a label is edited on the canvas saves the new label', async ({ page }) => {
    await start(page);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('directEditing').activate(operator);
    });
    await expect(page.locator('.djs-direct-editing-parent')).toBeVisible();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Aufheizen');
    await nextPick(page, 'label.json');
    await page.keyboard.press('Control+s');
    await waitForWrites(page, 1);

    const names = JSON.parse((await writes(page))[0].text).filter((e) => e.process)
      .flatMap((e) => e.elementDataInformation).map((d) => d.name);
    expect(names).toContain('Aufheizen');
    expect(names).not.toContain('Erhitzen');
  });

  test('when writing is not allowed a warning offers Save as', async ({ page }) => {
    await start(page, { files: { 'offen.json': MODEL }, model: false });
    expect(await openFromDisk(page, 'offen.json')).toBe('import.done');
    await page.evaluate(() => { window.__fs.permission = 'denied'; });

    await pressSave(page);
    const warning = noteById(page, 'files.error');
    await expect(warning).toHaveClass(/fpb-notification--warning/);
    await expect(warning).toContainText('FPB.js may not write to offen.json');
    expect(await writes(page)).toEqual([]);

    await nextPick(page, 'kopie.json');
    await warning.getByRole('button', { name: 'Save as' }).click();
    await waitForWrites(page, 1);
    expect((await writes(page))[0].name).toBe('kopie.json');
  });

  test('an empty model is not saved', async ({ page }) => {
    await start(page, { model: false });
    await pressSave(page);
    await expect(noteById(page, 'files.saved')).toContainText('The model is empty: there is nothing to save.');
    expect((await fileSystem(page)).pickers).toEqual([]);
  });

  test('New model forgets the file', async ({ page }) => {
    await start(page);
    await nextPick(page, 'a.json');
    await pressSave(page);
    await waitForWrites(page, 1);

    await page.evaluate(() => window.fpbjs.newModel());
    await new ModelerPage(page).createSystemLimit({ x: 500, y: 350 });
    await expect.poll(() => page.evaluate(() => window.fpbjs.getProcesses().length)).toBeGreaterThan(0);

    await nextPick(page, 'b.json');
    await pressSave(page);
    await waitForWrites(page, 2);
    const disk = await fileSystem(page);
    expect(disk.pickers).toHaveLength(2);
    expect(disk.writes.map((w) => w.name)).toEqual(['a.json', 'b.json']);
  });

  test('saving clears the unsaved state of the browser backup', async ({ page }) => {
    await start(page);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
      window.fpbjs.get('modeling').moveElements([operator], { x: 20, y: 0 });
    });
    const dirty = () => page.evaluate(() => {
      const autosave = window.fpbjs.get('autosave');
      autosave.flush();
      return autosave.isDirty();
    });
    expect(await dirty()).toBe(true);

    await nextPick(page, 'gesichert.json');
    await pressSave(page);
    await waitForWrites(page, 1);
    expect(await dirty()).toBe(false);
  });

  test('without File System Access Ctrl+S downloads the file and says so', async ({ page }) => {
    await start(page, { fileSystemAccess: false });
    let waiting = page.waitForEvent('download');
    await pressSave(page);
    let download = await waiting;
    expect(download.suggestedFilename()).toBe(`${NAME}.json`);
    const json = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(json.filter((e) => e.process)).toHaveLength(2);
    await expect(noteById(page, 'files.saved')).toContainText(`Downloaded ${NAME}.json`);

    // a file opened before keeps its name
    await page.locator('#openFileButton').click();
    await page.locator(`${OPEN} input#fpb-open-input`).setInputFiles({ name: 'mein-modell.json', mimeType: 'application/json', buffer: Buffer.from(MODEL) });
    await expect(page.locator(`${OPEN} [data-answer="open"]`)).toBeEnabled();
    await page.locator(`${OPEN} [data-answer="open"]`).click();
    await page.waitForTimeout(800);
    waiting = page.waitForEvent('download');
    await pressSave(page);
    download = await waiting;
    expect(download.suggestedFilename()).toBe('mein-modell.json');
  });

  // final review 016e D2, I1: Chrome grants the permission only shortly
  // after the key press, so it is asked before the AML export is built
  test('the permission to write an opened AML file is asked before the export is built', async ({ page }) => {
    await start(page, { files: { 'Anlage.aml': MIXED }, model: false });
    expect(await openFromDisk(page, 'Anlage.aml')).toBe('import.done');
    await page.evaluate(() => {
      const aml = window.fpbjs.get('amlSupport');
      const original = aml.exportAml.bind(aml);
      aml.exportAml = () => {
        window.__askedAtExport = window.__fs.asked;
        return original();
      };
    });
    await pressSave(page);
    await waitForWrites(page, 1);
    expect(await page.evaluate(() => window.__askedAtExport)).toBe(1);
  });

  // final review 016e D2, I4: the rest of an AML file may have been edited
  // elsewhere, in the AML Editor for one
  test('a file changed on disk after it was opened is not overwritten without a question', async ({ page }) => {
    await start(page, { files: { 'Anlage.aml': MIXED }, model: false });
    expect(await openFromDisk(page, 'Anlage.aml')).toBe('import.done');
    const external = MIXED.replace('Name="Behaelter_B1"', 'Name="Behaelter_B1_extern"');
    await changeOnDisk(page, 'Anlage.aml', external);

    await pressSave(page);
    const question = page.getByRole('alertdialog');
    await expect(question).toContainText('Anlage.aml has changed on disk');
    await question.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(300);
    expect(await writes(page)).toEqual([]);
    expect((await fileSystem(page)).files['Anlage.aml']).toBe(external);

    await pressSave(page);
    await question.getByRole('button', { name: 'Overwrite' }).click();
    await waitForWrites(page, 1);
    // its own write is no change from outside
    await pressSave(page);
    await waitForWrites(page, 2);
    await expect(question).toHaveCount(0);
  });

  // final review 016e D2, I2: the keyboard focus is on the page after loading
  test('right after the page loads Ctrl+S saves the model, not the page', async ({ page }) => {
    await start(page);
    await nextPick(page, 'gleich.json');
    await page.keyboard.press('Control+s');
    await waitForWrites(page, 1);
    expect((await fileSystem(page)).pickers).toHaveLength(1);
  });

  test('Ctrl+S in a field of a dialog saves nothing and leaves the dialog open', async ({ page }) => {
    await start(page);
    await page.locator('#exportButton').click();
    await page.locator('#exportFileName').focus();
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(500);
    expect((await fileSystem(page)).pickers).toEqual([]);
    await expect(page.locator('dialog.fpb-export-dialog[open]')).toBeVisible();
  });

  // 016g A1, review focus 1: the file has the model as it was when the
  // content was built; what changes while it is written is not in it
  for (const [kind, name, content] of [['JSON', 'a.json', MODEL], ['AML', 'Anlage.aml', MIXED]]) {
    test(`changes made while ${kind === 'AML' ? 'an AML file' : 'the file'} is being written stay unsaved`, async ({ page }) => {
      await start(page, { files: { [name]: content }, model: false });
      expect(await openFromDisk(page, name)).toBe('import.done');
      await page.evaluate(() => window.__fs.hold());
      await pressSave(page);
      await expect.poll(() => page.evaluate(() => window.__fs.waiting)).toBe(1);
      await page.evaluate(() => {
        const operator = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:ProcessOperator')[0];
        window.fpbjs.get('modeling').updateLabel(operator, 'Waehrend des Speicherns');
      });
      await page.evaluate(() => window.__fs.release());
      await waitForWrites(page, 1);
      await expect(noteById(page, 'files.saved')).toContainText('Saved to ' + name);
      expect((await writes(page))[0].text).not.toContain('Waehrend des Speicherns');
      expect(await page.evaluate(() => window.fpbjs.get('fpbFiles')._hasUnsavedChanges())).toBe(true);
    });
  }

  // 016g A3
  test('an exception of an import listener keeps the file of the model on screen', async ({ page }) => {
    await start(page, { files: { 'a.json': MODEL }, model: false });
    expect(await openFromDisk(page, 'a.json')).toBe('import.done');
    const opened = await page.evaluate(async (text) => {
      const bus = window.fpbjs.get('eventBus');
      const fail = () => {
        throw new Error('a listener of the host');
      };
      bus.on('FPBJS.import', 1500, fail);
      try {
        return await window.fpbjs.get('fpbFiles').openFile(new File([text], 'b.json'));
      } finally {
        bus.off('FPBJS.import', fail);
      }
    }, MODEL);
    expect(opened).toBe(false);

    await pressSave(page);
    await waitForWrites(page, 1);
    expect((await writes(page)).map((w) => w.name)).toEqual(['a.json']);
  });

  // final review 016g, I1: every module that prepared for the import goes
  // back, also the AML file of amlSupport
  test('an import a listener aborts keeps the AML file of the model on screen with all it holds', async ({ page }) => {
    await start(page, { files: { 'Anlage.aml': MIXED }, model: false });
    expect(await openFromDisk(page, 'Anlage.aml')).toBe('import.done');
    const opened = await page.evaluate(async (text) => {
      const bus = window.fpbjs.get('eventBus');
      const fail = () => {
        throw new Error('a listener of the host');
      };
      bus.on('FPBJS.import', 1500, fail);
      try {
        return await window.fpbjs.get('fpbFiles').openFile(new File([text], 'b.json'));
      } finally {
        bus.off('FPBJS.import', fail);
      }
    }, MODEL);
    expect(opened).toBe(false);
    expect(await page.evaluate(() => {
      const source = window.fpbjs.get('amlSupport').getSource();
      return source ? source.fileName : null;
    })).toBe('Anlage.aml');

    await pressSave(page);
    await waitForWrites(page, 1);
    const written = (await writes(page))[0];
    expect(written.name).toBe('Anlage.aml');
    // the rest of the file
    expect(written.text).toContain('Name="Behaelter_B1"');
  });

  test('an AML import a listener aborts leaves the JSON model with its file and without an AML file', async ({ page }) => {
    await start(page, { files: { 'a.json': MODEL }, model: false });
    expect(await openFromDisk(page, 'a.json')).toBe('import.done');
    await page.evaluate((text) => new Promise((resolve) => {
      const bus = window.fpbjs.get('eventBus');
      const fail = () => {
        throw new Error('a listener of the host');
      };
      bus.on('FPBJS.import', 1500, fail);
      // the AML import runs on after openFile: wait for its error message
      const done = (event) => {
        if (event.notes.some((note) => note.id === 'import.error')) {
          bus.off('notifications.changed', done);
          bus.off('FPBJS.import', fail);
          resolve();
        }
      };
      bus.on('notifications.changed', done);
      window.fpbjs.get('fpbFiles').openFile(new File([text], 'x.aml'));
    }), SINGLE);
    expect(await page.evaluate(() => {
      const file = window.fpbjs.get('fpbFiles')._target;
      const source = window.fpbjs.get('amlSupport').getSource();
      return { file: file ? file.name : null, source: source ? source.fileName : null };
    })).toEqual({ file: 'a.json', source: null });
  });

  // 016g A4
  test('a host import while an AML file is loading does not get that file', async ({ page }) => {
    await start(page);
    await page.evaluate((text) => {
      const aml = window.fpbjs.get('amlSupport');
      const importAml = aml.importAml.bind(aml);
      aml.importAml = (...args) => new Promise((resolve) => {
        window.__releaseAml = resolve;
      }).then(() => importAml(...args));
      window.__amlOpened = window.fpbjs.get('fpbFiles').openFile(new File([text], 'Anlage.aml'));
    }, SINGLE);
    await expect.poll(() => page.evaluate(() => typeof window.__releaseAml)).toBe('function');

    const target = () => page.evaluate(() => {
      const file = window.fpbjs.get('fpbFiles')._target;
      return file ? file.name : null;
    });
    const hostImport = page.evaluate((data) => new Promise((resolve) => {
      const bus = window.fpbjs.get('eventBus');
      bus.once('import.done', () => resolve(true));
      bus.fire('FPBJS.import', { data });
    }), clone());
    expect(await hostImport).toBe(true);
    expect(await target()).toBe(null);

    const amlDone = page.evaluate(() => new Promise((resolve) => {
      window.fpbjs.get('eventBus').once('import.done', () => resolve(true));
      window.__releaseAml();
    }));
    expect(await amlDone).toBe(true);
    expect(await target()).toBe('Anlage.aml');
  });

  // 016g A5
  test('a refused picker leaves writing into a chosen file on', async ({ page }) => {
    await start(page, { files: { 'a.json': MODEL }, model: false });
    expect(await openFromDisk(page, 'a.json')).toBe('import.done');
    await pressSave(page);
    await waitForWrites(page, 1);

    await nextPick(page, 'deny');
    const download = page.waitForEvent('download');
    await pressSave(page, true);
    await download;

    await pressSave(page);
    await waitForWrites(page, 2);
    expect((await writes(page)).map((w) => w.name)).toEqual(['a.json', 'a.json']);
  });

  // 016g A6
  test('the warning after a refused write names the newly chosen file', async ({ page }) => {
    await start(page, { files: { 'a.json': MODEL }, model: false });
    expect(await openFromDisk(page, 'a.json')).toBe('import.done');
    await page.evaluate(() => {
      window.__fs.readOnly['b.json'] = true;
    });
    await nextPick(page, 'b.json');
    await pressSave(page, true);
    await expect(noteById(page, 'files.error')).toContainText('FPB.js may not write to b.json');
  });

  test('Save in the toolbar saves, also in read-only mode', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
    await expect(page.locator('#saveFileButton')).toBeEnabled();
    await nextPick(page, 'lesen.json');
    await page.locator('#saveFileButton').click();
    await waitForWrites(page, 1);
    expect((await writes(page))[0].name).toBe('lesen.json');
  });
});
