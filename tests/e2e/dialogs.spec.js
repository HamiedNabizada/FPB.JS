import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

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

const dialog = (page) => page.locator('.modal.show');
const danger = (page) => page.evaluate(() => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--fpb-danger)';
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
});

test.describe('Dialogs', () => {

  test('import is a text button, disabled until a file is chosen, and Cancel closes', async ({ page }) => {
    await open(page);
    await page.locator('#importOptionsButton').click();
    await expect(dialog(page).getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toHaveCount(0);

    await page.locator('#importOptionsButton').click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('deleting a decomposed operator names it and answers with a red "Delete"', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('fpbDelete').remove([operator]);
    });
    await expect(dialog(page).locator('.modal-title')).toHaveText('Delete "Erhitzen"?');
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
