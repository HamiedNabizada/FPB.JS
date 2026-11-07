// tests/e2e/validation.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für die Modellprüfung nach dem VDI-3682-Regelkatalog (Feature 024 E).
 * Das Fixture ist regelkonform; die Tests bauen gezielt Verstöße ein.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

async function vorbereiten(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

const markierungen = (page) => page.locator('.fpb-validation-marker');

test.describe('Modellprüfung', () => {

  test('ein regelkonformes Modell hat keine Markierungen und keinen Zähler', async ({ page }) => {
    await vorbereiten(page);
    await page.waitForTimeout(400);

    await expect(markierungen(page)).toHaveCount(0);
    await expect(page.locator('#openValidationButton .fpb-validation-count')).toHaveCount(0);
  });

  test('ein Operator außerhalb der Systemgrenze wird markiert und gezählt', async ({ page }) => {
    await vorbereiten(page);

    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Prüfen')[0];
      window.fpbjs.get('modeling').moveElements([operator], { x: 900, y: 0 });
    });

    await expect(markierungen(page)).toHaveCount(1);
    await expect(markierungen(page)).toHaveAttribute('data-rules', 'B2');
    await expect(page.locator('#openValidationButton .fpb-validation-count')).toHaveText('1');

    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    await expect(markierungen(page)).toHaveCount(0);
  });

  test('die Liste zeigt Befunde anderer Ebenen und springt dorthin', async ({ page }) => {
    const importer = await vorbereiten(page);
    const oben = await importer.rootProcessId();

    // In der Kind-Ebene Vorwärmen aus der Systemgrenze schieben: B2 dort
    await importer.switchToChildLayer();
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Vorwärmen')[0];
      window.fpbjs.get('modeling').moveElements([operator], { x: 1200, y: 0 });
    });
    await page.evaluate(async (id) => {
      const kind = window.fpbjs.get('canvas').getRootElement();
      window.fpbjs.get('modeling').switchProcess(kind.businessObject.parent);
      await new Promise((r) => setTimeout(r, 300));
      return id;
    }, oben);

    await page.click('#openValidationButton');
    const eintrag = page.locator('.fpb-validation-item[data-rule="B2"]');
    await expect(eintrag).toContainText('Vorwärmen');
    await expect(eintrag).toContainText('decomposition of Erhitzen');
    await eintrag.click();

    const zustand = await page.evaluate(() => ({
      ebene: window.fpbjs.get('canvas').getRootElement().id,
      ausgewaehlt: window.fpbjs.get('selection').get().map((e) => e.businessObject.name),
    }));
    expect(zustand.ebene).not.toBe(oben);
    expect(zustand.ausgewaehlt).toEqual(['Vorwärmen']);
  });

  test('Markierungen lassen sich ausblenden', async ({ page }) => {
    await vorbereiten(page);
    await page.evaluate(() => {
      const operator = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Prüfen')[0];
      window.fpbjs.get('modeling').moveElements([operator], { x: 900, y: 0 });
    });
    await expect(markierungen(page)).toHaveCount(1);

    await page.click('#openValidationButton');
    await page.locator('.fpb-validation-toggle input').uncheck();

    await expect(markierungen(page)).toHaveCount(0);
    await expect(page.locator('.fpb-validation-item[data-rule="B2"]')).toHaveCount(1);
  });


  // 016c decision 10: filter by severity, findings as cards
  test.describe('filter', () => {

    /** An unconnected, unnamed state: one warning (G4) and one note (D4) more */
    const looseState = (page) => page.evaluate(() => {
      const registry = window.fpbjs.get('elementRegistry');
      const systemLimit = registry.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Product' });
      return window.fpbjs.get('modeling').createShape(shape, { x: systemLimit.x + 60, y: systemLimit.y + systemLimit.height / 2 }, systemLimit).id;
    });
    const openList = (page) => page.evaluate(() => {
      window.fpbjs.get('fpbValidation').run();
      window.fpbjs.get('fpbValidation').openPanel();
    });
    const filterButton = (page, kind) => page.locator('.fpb-validation-filter [data-filter="' + kind + '"]');
    const cards = (page) => page.locator('.fpb-validation-panel .fpb-validation-item');

    test('the filter shows only findings of that severity and leaves the markers alone', async ({ page }) => {
      await vorbereiten(page);
      await looseState(page);
      await openList(page);
      const markers = await markierungen(page).count();
      const all = await cards(page).count();
      expect(all).toBeGreaterThan(1);

      await filterButton(page, 'warning').click();
      await expect(filterButton(page, 'warning')).toHaveAttribute('aria-pressed', 'true');
      await expect(cards(page)).not.toHaveCount(all);
      for (const card of await cards(page).all()) {
        await expect(card).toHaveClass(/fpb-validation-warning/);
      }
      expect(await markierungen(page).count()).toBe(markers);

      await filterButton(page, 'all').click();
      await expect(cards(page)).toHaveCount(all);
    });

    test('the counts in the filter follow the findings', async ({ page }) => {
      await vorbereiten(page);
      await openList(page);
      await expect(filterButton(page, 'warning')).toHaveText('Warnings 0');
      await looseState(page);
      await page.evaluate(() => window.fpbjs.get('fpbValidation').run());
      // the new state is not connected (G4) and has no name (D7, a warning since 031)
      await expect(filterButton(page, 'warning')).toHaveText('Warnings 2');
    });

    // 016g B4
    test('a filter without findings says so', async ({ page }) => {
      await vorbereiten(page);
      await looseState(page);
      await openList(page);
      await filterButton(page, 'error').click();
      await expect(page.locator('.fpb-validation-panel .fpb-validation-empty')).toHaveText('No findings of this kind.');
      await expect(cards(page)).toHaveCount(0);
      await filterButton(page, 'all').click();
      await expect(page.locator('.fpb-validation-panel .fpb-validation-empty')).toHaveCount(0);
    });

    test('the filter works in read-only mode', async ({ page }) => {
      await vorbereiten(page);
      await looseState(page);
      await page.evaluate(() => window.fpbjs.get('readOnly').set(true));
      await openList(page);
      await filterButton(page, 'info').click();
      for (const card of await cards(page).all()) {
        await expect(card).toHaveClass(/fpb-validation-info/);
      }
    });
  });

  // 016g B2: E5 of the rule catalog
  test('reversed limits show as E5 in the list', async ({ page }) => {
    await vorbereiten(page);
    const toggle = page.locator('#propertiesPanelToggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await page.evaluate(() => {
      const state = window.fpbjs.get('elementRegistry').filter((e) => e.businessObject && e.businessObject.name === 'Rohstoff' && e.type !== 'label')[0];
      window.fpbjs.get('selection').select(state);
    });
    await page.locator('.fpb-characteristic-row').first().click();
    await page.locator('#bio-properties-panel-characteristic-0-acceptance-from').fill('80');
    await page.locator('#bio-properties-panel-characteristic-0-acceptance-to').fill('20');
    await page.evaluate(() => {
      window.fpbjs.get('fpbValidation').run();
      window.fpbjs.get('fpbValidation').openPanel();
    });
    const item = page.locator('.fpb-validation-panel .fpb-validation-item[data-rule="E5"]');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Lower limit not above upper limit');
    await expect(item).toContainText('acceptance region');
  });

  test('die Filter der Liste brechen auf Deutsch nicht um', async ({ page }) => {
    // Testrunde 2026-11-07: "Warnungen 3" stand auf zwei Zeilen
    await vorbereiten(page);
    await page.evaluate(() => {
      window.fpbjs.get('fpbI18n').set('de');
      window.fpbjs.get('fpbValidation').run();
      window.fpbjs.get('fpbValidation').openPanel();
    });
    const filters = page.locator('.fpb-validation-panel .fpb-validation-filter button');
    await expect(filters).toHaveCount(4);
    await expect(filters.nth(2)).toContainText('Warnungen');
    const lines = await filters.evaluateAll((buttons) => buttons.map((b) => {
      const range = document.createRange();
      range.selectNodeContents(b);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    }));
    expect(lines).toEqual([1, 1, 1, 1]);
  });
});
