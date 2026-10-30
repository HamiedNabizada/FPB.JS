// tests/e2e/helpers/importDialog.js
import { expect } from '../support/test';

/**
 * Drives the dialogs Open and Export of FPB.js like a user (016e D2): open,
 * drop or pick a file, press Open, wait for the importer.
 */

/** The dialog "Open" while it is shown */
export const OPEN = 'dialog.fpb-open-dialog[open]';

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

/** Exports the whole model through the download dialog as an event and returns its data. */
export async function exportViaDialog(page, { format = 'json', withLayout = true } = {}) {
  await dismissNotifications(page);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.querySelector('[data-icon="download"]'));
    button.click();
  });
  await expect(page.locator('#formatXML')).toBeVisible();
  return page.evaluate(({ format, withLayout }) => new Promise((resolve) => {
    window.fpbjs.get('eventBus').once('fpbjs', (e) => resolve(e.format === format ? e.data : null));
    document.querySelector({ xml: '#formatXML', aml: '#formatAML' }[format] || '#formatJSON').click();
    document.querySelector(withLayout ? '#informationLevel1' : '#informationLevel2').click();
    document.querySelector('#information1').click();
    document.querySelector('#export1').click();
    setTimeout(() => {
      const send = [...document.querySelectorAll('.modal.show .modal-footer button')].pop();
      send.click();
    }, 150);
    setTimeout(() => resolve(null), 8000);
  }), { format, withLayout });
}
