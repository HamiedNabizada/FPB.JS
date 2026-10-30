import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';
import { DIALOG } from './helpers/ui';

/**
 * Dialogs as cards with named answers (016c decision 13): the import has a
 * text button "Import" and "Cancel"; a question names the element and its
 * consequence, and the destructive answer is red and named after the action.
 */

async function open(page) {
  await page.setViewportSize({ width: 1500, height: 900 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
}

const dialog = (page) => page.locator(DIALOG);
const danger = (page) => page.evaluate(() => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--fpb-danger)';
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
});

test.describe('Dialogs', () => {

  test('open is a text button, disabled until a file is chosen, and Cancel closes', async ({ page }) => {
    await open(page);
    await page.locator('#openFileButton').click();
    await expect(dialog(page).getByRole('button', { name: 'Open', exact: true })).toBeDisabled();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toHaveCount(0);

    await page.locator('#openFileButton').click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('open, export and information are cards with the plain close and close with Escape', async ({ page }) => {
    await open(page);
    const openers = [
      () => page.locator('#openFileButton').click(),
      () => page.locator('#exportButton').click(),
      () => page.getByRole('button', { name: 'Show information and help', exact: true }).click()
    ];
    for (const openDialog of openers) {
      await openDialog();
      await expect(dialog(page)).toHaveClass(/fpb-dialog/);
      await expect(dialog(page).locator('[data-icon="rectangle-xmark"]')).toHaveCount(0);
      await dialog(page).locator('.fpb-dialog-close').click();
      await expect(dialog(page)).toHaveCount(0);

      await openDialog();
      await expect(dialog(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toHaveCount(0);
    }
  });

  for (const scheme of ['light', 'dark']) {
    test(`the drop area shows keyboard focus and a dragged file (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await page.locator('#openFileButton').click();
      const label = dialog(page).locator('.fpb-drop-zone');
      const look = () => label.evaluate((l) => {
        const s = getComputedStyle(l);
        return [s.borderTopColor, s.backgroundColor, s.outlineStyle].join(' ');
      });
      const plain = await look();

      // colours fade in (dark-mode.css), so the look is polled
      await dialog(page).locator('.fpb-choose-file').focus();
      await expect.poll(look).not.toBe(plain);
      await dialog(page).locator('.fpb-choose-file').blur();
      await expect.poll(look).toBe(plain);

      await label.evaluate((l) => l.classList.add('is-dragover'));
      await expect.poll(look).not.toBe(plain);
    });
  }

  test('deleting a decomposed operator names it and answers with a red "Delete"', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('fpbDelete').remove([operator]);
    });
    await expect(dialog(page).locator('.fpb-dialog-title')).toHaveText('Delete "Erhitzen"?');
    const remove = dialog(page).getByRole('button', { name: 'Delete', exact: true });
    await expect(remove).toBeVisible();
    expect(await remove.evaluate((b) => getComputedStyle(b).backgroundColor)).toBe(await danger(page));

    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('in the dark the destructive answer stays red', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('fpbDelete').remove([operator]);
    });
    const remove = dialog(page).getByRole('button', { name: 'Delete', exact: true });
    await expect(remove).toBeVisible();
    expect(await remove.evaluate((b) => getComputedStyle(b).backgroundColor)).toBe(await danger(page));
  });

  test('a question closes with Escape and changes nothing', async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => window.fpbjs.get('elementRegistry').getAll().length);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('fpbDelete').remove([operator]);
    });
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.fpbjs.get('elementRegistry').getAll().length)).toBe(before);
  });
});
