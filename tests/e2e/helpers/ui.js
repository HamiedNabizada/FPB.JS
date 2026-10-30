/**
 * Selectors for the dialogs and messages of FPB.js (016e D1, D2): every
 * dialog is a native <dialog> since D2.
 */
export const DIALOG = 'dialog.fpb-dialog[open]';
export const NOTE = '.fpb-notification';

export const dialog = (page) => page.locator(DIALOG);

/** Messages of one type ('error', 'warning', 'info', 'success') */
export const note = (page, type) => page.locator(`${NOTE}.fpb-notification--${type}`);

/** The message shown under a key, such as 'import.report' */
export const noteById = (page, id) => page.locator(`${NOTE}[data-id="${id}"]`);
