import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { OPEN, openImportDialog, dropFile, pickFile, importButton } from './helpers/importDialog';

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
