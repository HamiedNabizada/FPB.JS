import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * Questions of the modeler (016e V4, V5, T2, T3): a native <dialog> opened
 * with showModal, the rest of the page waits. Cancel has the focus, Escape
 * and the cross mean Cancel, and the focus goes back where it was. Every
 * confirmation.required gets its answer with its action, one question after
 * the other.
 */

async function laden(page) {
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.setViewportSize({ width: 1500, height: 900 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
  await page.evaluate(() => {
    window.__answers = [];
    const bus = window.fpbjs.get('eventBus');
    bus.on('confirmation.confirmed', (e) => window.__answers.push(['confirmed', e.action.type]));
    bus.on('confirmation.cancelled', (e) => window.__answers.push(['cancelled', e.action.type]));
  });
  return { fehler };
}

const ask = (page, question) => page.evaluate((q) => window.fpbjs.get('eventBus').fire('confirmation.required', q), question);
const answers = (page) => page.evaluate(() => window.__answers);
const question = (page) => page.locator('dialog.fpb-dialog[open]');

test.describe('Questions', () => {

  test('a question is a native dialog: Cancel has the focus, Escape cancels, the focus returns', async ({ page }) => {
    const { fehler } = await laden(page);
    await page.locator('#openSearchButton').focus();
    await ask(page, { title: 'Delete "Erhitzen"?', message: 'It has a decomposition.', confirmLabel: 'Delete', confirmVariant: 'danger', action: { type: 'probe' } });

    const dialog = question(page);
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d) => d.tagName === 'DIALOG' && d.matches(':modal'))).toBe(true);
    const labelledBy = await dialog.getAttribute('aria-labelledby');
    await expect(page.locator('#' + labelledBy)).toHaveText('Delete "Erhitzen"?');
    await expect(dialog.locator('[data-answer="cancel"]')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(question(page)).toHaveCount(0);
    expect(await answers(page)).toEqual([['cancelled', 'probe']]);
    await expect(page.locator('#openSearchButton')).toBeFocused();
    expect(fehler).toEqual([]);
  });

  test('the cross cancels and the named answer confirms', async ({ page }) => {
    await laden(page);
    await ask(page, { title: 'First', message: 'm', action: { type: 'cross' } });
    await question(page).getByRole('button', { name: 'Close' }).click();
    await ask(page, { title: 'Second', message: 'm', confirmLabel: 'Place on boundary', action: { type: 'named' } });
    await question(page).getByRole('button', { name: 'Place on boundary' }).click();
    await expect(question(page)).toHaveCount(0);
    expect(await answers(page)).toEqual([['cancelled', 'cross'], ['confirmed', 'named']]);
  });

  test('a blocked action shows only OK', async ({ page }) => {
    await laden(page);
    await ask(page, { title: 'Not possible', message: 'The state is locked.', isBlocked: true, action: { type: 'blocked' } });
    const buttons = question(page).locator('.fpb-dialog-footer button');
    await expect(buttons).toHaveCount(1);
    await expect(buttons).toHaveText('OK');
    await buttons.click();
    expect(await answers(page)).toEqual([['cancelled', 'blocked']]);
  });

  // Review Focus 1
  test('two questions in a row each get their answer', async ({ page }) => {
    await laden(page);
    await ask(page, { title: 'Question A', message: 'a', action: { type: 'a' } });
    await ask(page, { title: 'Question B', message: 'b', action: { type: 'b' } });
    await expect(question(page)).toHaveCount(1);
    await expect(question(page).locator('.fpb-dialog-title')).toHaveText('Question A');
    await question(page).locator('[data-answer="confirm"]').click();
    await expect(question(page).locator('.fpb-dialog-title')).toHaveText('Question B');
    await question(page).locator('[data-answer="cancel"]').click();
    await expect(question(page)).toHaveCount(0);
    expect(await answers(page)).toEqual([['confirmed', 'a'], ['cancelled', 'b']]);
  });

  test('a host can answer questions itself', async ({ page }) => {
    await laden(page);
    await page.evaluate(() => window.fpbjs.get('eventBus').on('confirmation.required', 1500, () => false));
    await ask(page, { title: 'Mine', message: 'm', action: { type: 'host' } });
    await page.waitForTimeout(300);
    await expect(question(page)).toHaveCount(0);
  });

  // final review 016e D1: names come from files and can be long
  test('a long name wraps inside the dialog and the cross stays reachable', async ({ page }) => {
    await laden(page);
    const name = 'X'.repeat(160);
    await ask(page, { title: `Delete "${name}"?`, message: `The element "${name}" will be removed.`, action: { type: 'long' } });
    const dialog = question(page);
    await expect(dialog).toBeVisible();
    const box = await dialog.evaluate((d) => {
      const r = d.getBoundingClientRect();
      const close = d.querySelector('.fpb-dialog-close').getBoundingClientRect();
      return {
        overflow: d.scrollWidth - d.clientWidth,
        closeInside: close.left >= r.left && close.right <= r.right
      };
    });
    expect(box.overflow).toBeLessThanOrEqual(1);
    expect(box.closeInside).toBe(true);
  });

  test('the question tells screen readers its consequence', async ({ page }) => {
    await laden(page);
    await ask(page, { title: 'Delete "Erhitzen"?', message: 'It has a decomposition.', details: 'The layer below goes too.', action: { type: 'sr' } });
    const dialog = question(page);
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    const describedBy = await dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator('#' + describedBy)).toContainText('It has a decomposition.');
    await expect(page.locator('#' + describedBy)).toContainText('The layer below goes too.');
  });

  for (const [scheme, surface] of [['light', 'rgb(255, 255, 255)'], ['dark', 'rgb(26, 32, 39)']]) {
    test(`the dialog follows the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await laden(page);
      await ask(page, { title: 'Theme', message: 'm', action: { type: 'theme' } });
      await expect(question(page)).toHaveCSS('background-color', surface);
    });
  }
});
