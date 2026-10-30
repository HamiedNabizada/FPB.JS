/**
 * Selectors for the dialogs and messages of FPB.js (016e D1). Until D2 the
 * import and export dialogs are still react-bootstrap modals, the questions
 * and the information already native dialogs: DIALOG finds either kind.
 */
export const DIALOG = 'dialog.fpb-dialog[open], .modal.show';
export const NOTE = '.fpb-notification';

export const dialog = (page) => page.locator(DIALOG);

/** Messages of one type ('error', 'warning', 'info', 'success') */
export const note = (page, type) => page.locator(`${NOTE}.fpb-notification--${type}`);

/** The message shown under a key, such as 'import.report' */
export const noteById = (page, id) => page.locator(`${NOTE}[data-id="${id}"]`);
