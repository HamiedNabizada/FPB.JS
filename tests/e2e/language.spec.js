// tests/e2e/language.spec.js
import path from 'path';
import { test, expect, devices } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * The language of the web app (016h V2, V3, V4, V7): a button in the view
 * group of the toolbar switches at once, keeps the model, layer and undo,
 * and the choice comes back on the next visit, without English first.
 */

const CHILD = '9ca400c0-a373-48c0-9f13-37ce196cee29';
const PRODUCT = 'c50336d6-9a7f-46e3-a7f5-e6187618dd69';
const SHOTS = path.join(__dirname, 'screenshots');

async function open(page, viewport = { width: 1400, height: 900 }) {
  if (viewport) {
    await page.setViewportSize(viewport);
  }
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
}

const languageButton = (page) => page.locator('#languageButton');

/** An entry of the palette by its name (title, or aria-label once its tip took it) */
const paletteEntry = (page, name) => page.locator('.djs-palette [title="' + name + '"], .djs-palette [aria-label="' + name + '"]');

/** Show an element in the properties panel, opened first */
async function showInPanel(page, id) {
  await page.evaluate((id) => {
    window.fpbjs.get('eventBus').fire('propertiesPanel.open');
    window.fpbjs.get('selection').select(window.fpbjs.get('elementRegistry').get(id));
  }, id);
}

async function german(page) {
  await languageButton(page).click();
  await expect(languageButton(page)).toHaveAttribute('aria-label', 'English');
}

test.describe('Language of the web app', () => {

  test('the language button switches at once and keeps the model', async ({ page }) => {
    await open(page);
    await page.evaluate((id) => {
      const shapes = [];
      const queue = [window.fpbjs.getProjectDefinition().entryPoint];
      while (queue.length) {
        const shape = queue.shift();
        shapes.push(shape);
        (shape.businessObject.consistsOfProcesses || []).forEach((child) => queue.push(child));
      }
      window.fpbjs.get('modeling').switchProcess(shapes.find((s) => s.id === id));
    }, CHILD);
    const before = await page.evaluate((id) => {
      const shape = window.fpbjs.get('elementRegistry').get(id);
      window.fpbjs.get('modeling').moveElements([shape], { x: 20, y: 0 });
      window.fpbjs.get('selection').select(shape);
      return shape.x - 20;
    }, PRODUCT);

    await expect(languageButton(page)).toHaveAttribute('aria-label', 'Deutsch');
    await german(page);

    await expect(paletteEntry(page, 'Prozessoperator hinzufügen')).toHaveCount(1);
    expect(await page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id)).toBe(CHILD);
    expect(await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.id))).toEqual([PRODUCT]);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await page.evaluate((id) => window.fpbjs.get('elementRegistry').get(id).x, PRODUCT)).toBe(before);
  });

  test('the choice is kept after a reload, without English first', async ({ page }) => {
    await open(page);
    await german(page);
    expect(await page.evaluate(() => window.localStorage.getItem('fpbjs.language'))).toBe('de');

    // every label the open button ever has, from the first paint on
    await page.addInitScript(() => {
      window.__labels = [];
      new MutationObserver(() => {
        const button = document.getElementById('openFileButton');
        if (button) {
          window.__labels.push(button.getAttribute('aria-label'));
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label'] });
    });
    await page.reload();
    await expect(page.locator('#openFileButton')).toHaveAttribute('aria-label', 'Öffnen (Strg+O)');
    const labels = await page.evaluate(() => window.__labels);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((label) => label && label.startsWith('Open'))).toEqual([]);
  });

  test('html lang follows the language', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    await german(page);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
  });

  test('the examples of the start card speak German', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await new ImportPage(page).goto();
    await german(page);
    await expect(page.locator('.fpb-start-example-description').first()).toHaveText('Erwärmen mit Prüfung, eine Dekomposition');
  });

  test('terms of VDI 3682', async ({ page }) => {
    await open(page);
    await german(page);
    await expect(paletteEntry(page, 'Technische Ressource hinzufügen')).toHaveCount(1);

    await showInPanel(page, PRODUCT);
    const panel = page.locator('#properties-container');
    await expect(panel.getByText('Kennzeichnung', { exact: true })).toBeVisible();
    await panel.locator('.fpb-characteristic-row-name').first().click();
    await expect(panel.getByText('Sollwert', { exact: true })).toBeVisible();
    await expect(panel.getByText('Gültigkeitsgrenzen des Sollwerts')).toBeVisible();

    await page.locator('#openValidationButton').click();
    await expect(page.locator('.fpb-validation-title')).toHaveText('Modellprüfung (VDI 3682)');
  });
});

/**
 * Nothing runs over in German (016h Anti-Ziele): buttons, labels and titles
 * keep their text inside. The pictures stay for a look by eye.
 */
const OVERFLOW = 'button, label, h1, h2, h3, h4, .bio-properties-panel-label, .fpb-characteristic-tab, .fpb-sheet-title';

async function overflowing(page) {
  return page.evaluate((selector) => {
    const name = (element) => (element.id || element.className || element.tagName) + ': ' + element.textContent.trim().slice(0, 60);
    const own = [...document.querySelectorAll(selector)]
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => getComputedStyle(element).overflowX !== 'visible' || element.tagName === 'BUTTON')
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map(name);
    // a button of an open dialog stays inside the dialog and the screen
    const outside = [...document.querySelectorAll('dialog[open] button')]
      .filter((button) => button.getClientRects().length > 0)
      .filter((button) => {
        const box = button.getBoundingClientRect();
        const frame = button.closest('dialog').getBoundingClientRect();
        return box.left < frame.left - 1 || box.right > frame.right + 1 || box.right > window.innerWidth + 1;
      })
      .map((button) => 'outside the dialog | ' + name(button));
    return own.concat(outside);
  }, OVERFLOW);
}

async function surfaces(page, shot, phone) {
  const found = [];
  const look = async (name) => {
    found.push(...(await overflowing(page)).map((entry) => name + ' | ' + entry));
    await page.screenshot({ path: path.join(SHOTS, 'german-' + shot + '-' + name + '.png') });
  };

  if (phone) {
    await page.evaluate((id) => window.fpbjs.get('selection').select(window.fpbjs.get('elementRegistry').get(id)), PRODUCT);
    await page.locator('#propertiesSheetButton').click();
  } else {
    await showInPanel(page, PRODUCT);
  }
  await page.locator('.fpb-characteristic-row-name').first().click();
  await look('panel');

  if (phone) {
    await page.locator('.fpb-sheet-close').click();
  }
  await page.evaluate(() => window.fpbjs.get('fpbFiles').export());
  await page.locator('dialog.fpb-dialog[open]').waitFor();
  await look('export');
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.fpbjs.get('fpbInfo').open());
  await page.locator('dialog.fpb-dialog[open]').waitFor();
  await look('information');
  await page.keyboard.press('Escape');

  // the questions with the longest pairs of buttons (final review, Important 5)
  const question = async (name, ask) => {
    await page.evaluate(ask);
    await page.locator('dialog.fpb-dialog[open]').waitFor();
    await look(name);
    await page.locator('dialog.fpb-dialog[open] [data-answer=cancel]').click();
  };
  await question('question-delete', () => {
    const registry = window.fpbjs.get('elementRegistry');
    window.fpbjs.get('fpbDelete').remove([registry.get('9ca400c0-a373-48c0-9f13-37ce196cee29')]);
  });
  await question('question-boundary', () => {
    const updater = window.fpbjs.get('shapeUpdater');
    const element = window.fpbjs.get('elementRegistry').get('c50336d6-9a7f-46e3-a7f5-e6187618dd69');
    updater._queueBoundary('stateMovedOnBoundary', { element, oldPosition: { x: element.x, y: element.y }, borderPosition: 'onUpperBorder' }, window.fpbjs.get('canvas').getRootElement());
    updater._askForBoundary();
  });

  await page.evaluate(() => window.fpbjs.get('fpbValidation').openPanel());
  await look('model-check');
  return found;
}

test.describe('Lengths in German', () => {

  test('nothing overflows on a desktop', async ({ page }) => {
    await open(page);
    await german(page);
    expect(await surfaces(page, 'desktop', false)).toEqual([]);
  });

  // the narrowest phone the plan names: 375 px (final review, Important 5)
  test.describe('on a narrow phone', () => {
    const { defaultBrowserType, ...phone } = devices['iPhone SE'];
    test.use(Object.assign({}, phone, { viewport: { width: 375, height: 812 } }));
    test.skip(({ browserName }) => browserName === 'firefox', 'Playwright has no phone emulation (isMobile) in Firefox');

    test('nothing overflows on a phone 375 px wide', async ({ page }) => {
      await open(page, null);
      await german(page);
      expect(await surfaces(page, 'phone-375', true)).toEqual([]);
    });
  });

  test.describe('on a phone', () => {
    const { defaultBrowserType, ...phone } = devices['Pixel 5'];
    test.use(phone);
    test.skip(({ browserName }) => browserName === 'firefox', 'Playwright has no phone emulation (isMobile) in Firefox');

    test('nothing overflows on a phone', async ({ page }) => {
      await open(page, null);
      await german(page);
      expect(await surfaces(page, 'phone', true)).toEqual([]);
    });
  });
});
