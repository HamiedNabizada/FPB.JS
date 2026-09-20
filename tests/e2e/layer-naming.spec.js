// tests/e2e/layer-naming.spec.js
import { test, expect } from '@playwright/test';
import { ImportPage } from './pages/ImportPage';
import basis from './fixtures/temperieren.json';

/**
 * E2E-Tests für Szenario 10 der Layer-Konsistenz.
 *
 * Die Systemgrenze einer Dekomposition trägt den Namen des Operators, zu dem
 * sie gehört ("SL_Erhitzen"). Wird der Operator umbenannt, blieb sie bisher auf
 * dem alten Namen stehen, und die Ebene darunter zeigte einen Namen, den es im
 * Modell nicht mehr gab.
 *
 * Eine selbst vergebene Benennung bleibt dagegen stehen, so wie sie auch beim
 * Dekomponieren nicht überschrieben wird.
 */

const clone = () => JSON.parse(JSON.stringify(basis));

const OPERATOR = 'Erhitzen';

async function laden(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(clone());
  return importer;
}

const umbenennen = (page, alterName, neuerName) => page.evaluate(({ alterName, neuerName }) => {
  const operator = window.fpbjs.get('elementRegistry')
    .filter((e) => e.type === 'fpb:ProcessOperator' && e.businessObject.name === alterName)[0];
  window.fpbjs.get('modeling').updateLabel(operator, neuerName);
}, { alterName, neuerName });

/** Name des Operators und der Systemgrenze in seiner Kind-Ebene */
const namen = (page, operatorName) => page.evaluate((operatorName) => {
  const operator = window.fpbjs.get('elementRegistry')
    .filter((e) => e.type === 'fpb:ProcessOperator' && e.businessObject.name === operatorName)[0];
  if (!operator) return null;
  const kind = operator.businessObject.decomposedView;
  const systemgrenze = kind.businessObject.elementsContainer
    .filter((e) => e.businessObject.$type === 'fpb:SystemLimit')[0];
  return {
    operator: operator.businessObject.name,
    kurzname: operator.businessObject.identification && operator.businessObject.identification.shortName,
    systemgrenze: systemgrenze.businessObject.name,
  };
}, operatorName);

test.describe('Szenario 10: dekomponierten Operator umbenennen', () => {

  test('die Systemgrenze der Kind-Ebene übernimmt den neuen Namen', async ({ page }) => {
    await laden(page);
    expect(await namen(page, OPERATOR)).toMatchObject({ systemgrenze: 'SL_' + OPERATOR });

    await umbenennen(page, OPERATOR, 'Aufheizen');

    expect(await namen(page, 'Aufheizen')).toMatchObject({
      operator: 'Aufheizen',
      kurzname: 'Aufheizen',
      systemgrenze: 'SL_Aufheizen',
    });
  });

  test('Rückgängig stellt beide Namen wieder her', async ({ page }) => {
    await laden(page);

    await umbenennen(page, OPERATOR, 'Aufheizen');
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());

    expect(await namen(page, OPERATOR)).toMatchObject({
      operator: OPERATOR,
      systemgrenze: 'SL_' + OPERATOR,
    });
  });

  test('eine selbst benannte Systemgrenze behält ihren Namen', async ({ page }) => {
    const importer = await laden(page);
    const elternEbene = await importer.rootProcessId();

    // in der Kind-Ebene die Systemgrenze selbst benennen
    await importer.switchToChildLayer();
    await page.evaluate(() => {
      const systemgrenze = window.fpbjs.get('elementRegistry')
        .filter((e) => e.type === 'fpb:SystemLimit')[0];
      window.fpbjs.get('modeling').updateLabel(systemgrenze, 'Ofen');
    });
    // zurück in die Eltern-Ebene: der Kind-Prozess trägt sie als `parent`
    await page.evaluate(() => {
      const eltern = window.fpbjs.get('canvas').getRootElement().businessObject.parent;
      window.fpbjs.get('modeling').switchProcess(eltern);
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id)).toBe(elternEbene);

    await umbenennen(page, OPERATOR, 'Aufheizen');

    expect(await namen(page, 'Aufheizen')).toMatchObject({ systemgrenze: 'Ofen' });
  });

});
