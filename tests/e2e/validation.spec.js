// tests/e2e/validation.spec.js
import { test, expect } from '@playwright/test';
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

});
