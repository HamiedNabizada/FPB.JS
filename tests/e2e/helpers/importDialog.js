// tests/e2e/helpers/importDialog.js
import fs from 'fs';
import { expect } from '../support/test';

/**
 * Drives the dialogs Open and Export of FPB.js like a user (016e D2): open,
 * drop or pick a file, press Open, wait for the importer.
 */

/** The dialog "Open" while it is shown */
export const OPEN = 'dialog.fpb-open-dialog[open]';

/** The dialog "Export" while it is shown */
export const EXPORT = 'dialog.fpb-export-dialog[open]';

/** Closes the messages of earlier imports and exports (016e message stack). */
export async function dismissNotifications(page) {
  await page.evaluate(() => window.fpbjs.get('fpbNotifications').clear());
  await expect(page.locator('.fpb-notification')).toHaveCount(0);
}

/** Opens the dialog "Open" from the toolbar. */
export async function openImportDialog(page) {
  await dismissNotifications(page);
  await page.locator('#openFileButton').click();
  await expect(page.locator(`${OPEN} .fpb-drop-zone`)).toBeVisible();
}

/** Drops a file on the card of the dialog, as the browser does when dragging from the explorer. */
export async function dropFile(page, content, name, type = 'application/json') {
  return page.evaluate(({ content, name, type }) => {
    const target = document.querySelector('dialog.fpb-open-dialog[open] .fpb-dialog-card');
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], name, { type }));
    const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
    target.dispatchEvent(new DragEvent('dragenter', options));
    target.dispatchEvent(new DragEvent('dragover', options));
    const drop = new DragEvent('drop', options);
    target.dispatchEvent(drop);
    return drop.defaultPrevented;
  }, { content, name, type });
}

/** Picks a file through the hidden file input. */
export async function pickFile(page, content, name, mimeType = 'application/json') {
  await page.locator(`${OPEN} input#fpb-open-input`).setInputFiles({ name, mimeType, buffer: Buffer.from(content) });
}

export const importButton = (page) => page.locator(`${OPEN} [data-answer="open"]`);

/**
 * Presses the import button and waits for the importer's answer.
 * Returns { done, errors: [{message, details, errorType}], warnings: [...] }.
 */
export async function pressImport(page) {
  await page.evaluate(() => {
    const bus = window.fpbjs.get('eventBus');
    const out = { done: 0, errors: [], warnings: [] };
    window.__importOutcome = out;
    const onError = (e) => out.errors.push({ message: e.message, details: e.details, errorType: e.errorType });
    const onReport = (e) => (e.warnings || []).forEach((w) => out.warnings.push({ message: w.message, details: w.details, hint: w.hint }));
    const onDone = () => { out.done++; };
    bus.on('import.error', onError);
    bus.on('import.report', onReport);
    bus.on('import.done', onDone);
    out.off = () => {
      bus.off('import.error', onError);
      bus.off('import.report', onReport);
      bus.off('import.done', onDone);
    };
  });
  await importButton(page).click();
  await page.waitForFunction(() => window.__importOutcome.done > 0 || window.__importOutcome.errors.length > 0, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const out = window.__importOutcome;
    out.off();
    return { done: out.done, errors: out.errors, warnings: out.warnings };
  });
}

/**
 * Exports the whole model through the dialog "Export" and returns the
 * downloaded file: JSON parsed, XML and AML as text.
 */
export async function exportViaDialog(page, { format = 'json', withLayout = true } = {}) {
  await dismissNotifications(page);
  await page.locator('#exportButton').click();
  const dialog = page.locator(EXPORT);
  await expect(dialog).toBeVisible();
  await dialog.locator(`#exportFormat-${format}`).check();
  if (format === 'json') {
    await dialog.locator('#exportScope-model').check();
  }
  if (await dialog.locator('#exportLayout').count()) {
    await dialog.locator('#exportLayout').setChecked(withLayout);
  }
  const waiting = page.waitForEvent('download', { timeout: 30000 });
  await dialog.locator('[data-answer="export"]').click();
  const text = fs.readFileSync(await (await waiting).path(), 'utf8').replace(/^\uFEFF/, '');
  return format === 'json' ? JSON.parse(text) : text;
}
