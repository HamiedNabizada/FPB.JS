// tests/e2e/properties-panel-next.spec.js
import { test, expect } from './support/test';
import { openPanel, select as auswaehlen, header as kopf, field as feld, stackSize as stapel, undo as rueckgaengig } from './helpers/panelNext';

/**
 * Das neue Eigenschaften-Panel (Preact, @bpmn-io/properties-panel).
 */

async function vorbereiten(page) {
  // starts closed, like the old panel; openPanel opens it
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/?panel=next');
  await expect(page.locator('#propertiesPanelToggle')).toHaveAttribute('aria-expanded', 'false');
  await openPanel(page);
}

test.describe('Neues Eigenschaften-Panel', () => {

  test('zeigt ohne Auswahl die Ebene und mit Auswahl Typ und Name im Kopf', async ({ page }) => {
    await vorbereiten(page);
    await expect(kopf(page)).toContainText('Process');
    await expect(kopf(page)).toContainText('Top level');

    await auswaehlen(page, 'Erhitzen');
    await expect(kopf(page)).toContainText('Process operator');
    await expect(kopf(page)).toContainText('Erhitzen');
    await expect(feld(page, 'shortName')).toHaveValue('Erhitzen');
  });

  test('Umbenennen im Panel ist ein Rückgängig-Schritt und ändert die Zeichenfläche', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Erhitzen');
    const vorher = await stapel(page);

    // select and type over, as a user does: clearing first would store an
    // empty name of its own when the machine is slow (one more undo step)
    await feld(page, 'shortName').selectText();
    await feld(page, 'shortName').pressSequentially('Erwärmen', { delay: 30 });
    await expect.poll(() => stapel(page)).toBe(vorher + 1);
    await expect(kopf(page)).toContainText('Erwärmen');
    await expect(page.locator('.djs-element .djs-label', { hasText: 'Erwärmen' }).first()).toBeAttached();

    await rueckgaengig(page);
    await expect(feld(page, 'shortName')).toHaveValue('Erhitzen');
    await expect(kopf(page)).toContainText('Erhitzen');
  });

  test('Langname: Eingabe und Rückgängig', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Erhitzen');

    await feld(page, 'longName').fill('Erhitzen auf 80 Grad');
    await expect.poll(() => page.evaluate(() => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === 'Erhitzen' && x.type !== 'label')[0];
      return e.businessObject.identification.longName;
    })).toBe('Erhitzen auf 80 Grad');

    await rueckgaengig(page);
    await expect(feld(page, 'longName')).toHaveValue('');
  });

  test('eine Umbenennung auf der Zeichenfläche erscheint im Panel', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Erhitzen');

    await page.evaluate(() => {
      const e = window.fpbjs.get('elementRegistry').filter((x) => x.businessObject && x.businessObject.name === 'Erhitzen' && x.type !== 'label')[0];
      window.fpbjs.get('modeling').updateLabel(e, 'Aufwärmen');
    });
    await expect(feld(page, 'shortName')).toHaveValue('Aufwärmen');
  });

  test('Systemgrenze hat ihren Namen, Mehrfachauswahl einen Hinweis', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Aufheizen mit Prüfung');
    await expect(kopf(page)).toContainText('System limit');
    await expect(feld(page, 'systemLimitName')).toHaveValue('Aufheizen mit Prüfung');

    await page.evaluate(() => {
      const r = window.fpbjs.get('elementRegistry');
      const namen = ['Erhitzen', 'Prüfen'];
      window.fpbjs.get('selection').select(r.filter((e) => e.businessObject && namen.includes(e.businessObject.name) && e.type !== 'label'));
    });
    await expect(page.locator('.bio-properties-panel-placeholder')).toContainText('Multiple elements');
  });

  test('der Umschalter blendet das Panel aus und merkt sich das', async ({ page }) => {
    await vorbereiten(page);
    await page.locator('#propertiesPanelToggle').click();
    await expect(page.locator('.fpb-properties-body')).toHaveCount(0);

    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    await expect(page.locator('#propertiesPanelToggle')).toHaveAttribute('aria-expanded', 'false');

    // und offen bleibt es nach dem Öffnen ebenso
    await page.locator('#propertiesPanelToggle').click();
    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    await expect(page.locator('#propertiesPanelToggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('a closed group stays closed after hiding the panel and after a reload', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Erhitzen');
    const kopfZeile = page.locator('[data-group-id="group-identification"] .bio-properties-panel-group-header');
    await kopfZeile.click();
    await expect(page.locator('[data-group-id="group-identification"] .bio-properties-panel-group-entries')).not.toHaveClass(/open/);

    await page.locator('#propertiesPanelToggle').click();
    await page.locator('#propertiesPanelToggle').click();
    await auswaehlen(page, 'Erhitzen');
    await expect(page.locator('[data-group-id="group-identification"] .bio-properties-panel-group-entries')).not.toHaveClass(/open/);

    await page.reload();
    await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    await expect(page.locator('#propertiesPanelToggle')).toHaveAttribute('aria-expanded', 'true');
    await openPanel(page);
    await auswaehlen(page, 'Erhitzen');
    await expect(page.locator('[data-group-id="group-identification"] .bio-properties-panel-group-entries')).not.toHaveClass(/open/);
  });

  test('propertiesPanel.open opens a hidden panel', async ({ page }) => {
    await vorbereiten(page);
    await page.locator('#propertiesPanelToggle').click();
    await expect(page.locator('.fpb-properties-body')).toHaveCount(0);

    await page.evaluate(() => window.fpbjs.get('eventBus').fire('propertiesPanel.open', {}));
    await expect(page.locator('.fpb-properties-body')).toBeVisible();
  });

  test('a selection made while the panel opens is shown', async ({ page }) => {
    await vorbereiten(page);
    await page.locator('#propertiesPanelToggle').click();
    await expect(page.locator('.fpb-properties-body')).toHaveCount(0);

    // select right after the panel body is drawn, before its effects have run
    await page.evaluate(() => new Promise((resolve) => {
      const shell = document.querySelector('.fpb-properties');
      const observer = new MutationObserver(() => {
        if (shell.querySelector('.bio-properties-panel-header')) {
          observer.disconnect();
          const element = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
          window.fpbjs.get('selection').select(element);
          resolve();
        }
      });
      observer.observe(shell, { childList: true, subtree: true });
      document.querySelector('#propertiesPanelToggle').click();
    }));

    await expect(kopf(page)).toContainText('Erhitzen');
  });

  test('the head shows the name and chips for type and layer', async ({ page }) => {
    await vorbereiten(page);
    await auswaehlen(page, 'Erhitzen');
    await expect(page.locator('.fpb-panel-header-name')).toHaveText('Erhitzen');
    await expect(page.locator('.fpb-chip-type')).toHaveText('Process operator');
    await expect(page.locator('.fpb-chip-layer')).toHaveText('Top level');

    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('modeling').switchProcess(operator.businessObject.decomposedView);
    });
    await auswaehlen(page, 'Vorwärmen');
    await expect(page.locator('.fpb-chip-layer')).toHaveText('Decomposition of Erhitzen');
  });

  test('in the dark the line symbols in the head stand out from the card', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await vorbereiten(page);
    for (const type of ['fpb:SystemLimit', 'fpb:Usage', 'fpb:Flow', null]) {
      await page.evaluate((type) => {
        const element = type && window.fpbjs.get('elementRegistry').filter((e) => e.type === type)[0];
        window.fpbjs.get('selection').select(element ? [element] : []);
      }, type);
      await page.waitForTimeout(200);
      const ratio = await page.evaluate(() => {
        const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
        const luminance = ([r, g, b]) => {
          const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        const line = document.querySelector('.fpb-panel-header-icon svg [stroke]');
        const card = getComputedStyle(document.querySelector('.fpb-panel-header')).backgroundColor;
        const a = luminance(rgb(getComputedStyle(line).stroke));
        const b = luminance(rgb(card));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio, String(type)).toBeGreaterThanOrEqual(3);
    }
  });

  test('a long name breaks and the panel stays 320 px wide', async ({ page }) => {
    await vorbereiten(page);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      window.fpbjs.get('modeling').updateLabel(operator, 'E'.repeat(60));
      window.fpbjs.get('selection').select(operator);
    });
    await expect(page.locator('.fpb-panel-header-name')).toHaveText('E'.repeat(60));
    const body = page.locator('.fpb-properties-body');
    expect((await body.boundingBox()).width).toBe(320);
    expect(await body.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  });

  test('shown values have no field look', async ({ page }) => {
    await vorbereiten(page);
    const value = page.locator('[data-entry-id="process-states"] .fpb-fixed-value');
    await expect(value).toBeVisible();
    expect(await value.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('none');
    expect(await value.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  });

  test('an entry that throws shows a message instead of a blank panel', async ({ page }) => {
    await vorbereiten(page);
    page.on('pageerror', () => {});
    await page.evaluate(() => {
      const element = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Erhitzen' && e.type !== 'label')[0];
      element.businessObject.get = () => { throw new Error('broken entry'); };
      window.fpbjs.get('selection').select(element);
    });
    await expect(page.locator('.fpb-properties-failure')).toContainText('ran into an error');
  });
});
