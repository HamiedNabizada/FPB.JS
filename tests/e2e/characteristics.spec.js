// tests/e2e/characteristics.spec.js
import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';

const fixture = path.join(__dirname, '..', 'unit', 'layout', 'fixtures', 'temperieren.json');

// The export replacer of DownloadModal, reduced to what the assertions need.
const EXPORT_SNIPPET = `
  (() => {
    const idOf = (item) => (typeof item === 'string' || !item) ? item : (item.id || item.uniqueIdent || item);
    const replacer = (name, val) => {
      if (['elementsContainer', 'consistsOfStates', 'consistsOfProcessOperator', 'consistsOfProcesses',
        'inTandemWith', 'isAssignedTo', 'incoming', 'outgoing'].includes(name)) {
        return Array.isArray(val) ? val.map(idOf) : idOf(val);
      }
      if (['entryPoint', 'sourceRef', 'targetRef', 'decomposedView', 'parent', 'consistsOfSystemLimit',
        'isDecomposedProcessOperator'].includes(name)) {
        return idOf(val);
      }
      if (['di', 'children', 'labels', 'ProjectAssignment', 'TemporaryFlowHint'].includes(name)) {
        return undefined;
      }
      return val;
    };
    window.fpbjs.get('eventBus').fire('dataStore.updateAll', {});
    return JSON.parse(JSON.stringify(window.fpbjs.getProcesses(), replacer));
  })()
`;

async function importFixture(page, mutate) {
  const data = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  if (mutate) {
    mutate(data);
  }
  await page.goto('/');
  await page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
  await page.evaluate((json) => {
    window.fpbjs.get('eventBus').fire('FPBJS.import', { data: json });
  }, data);
  await page.waitForTimeout(3000);
}

function exportedCharacteristic(page, elementName) {
  return page.evaluate(([snippet, name]) => {
    const processes = eval(snippet);
    let found = null;
    processes.filter((p) => p && p.process).forEach((p) => {
      p.elementDataInformation.forEach((e) => {
        if (e.name === name && e.characteristics && e.characteristics.length) {
          found = e.characteristics[0];
        }
      });
    });
    return found;
  }, [EXPORT_SNIPPET, elementName]);
}

test.describe('Characteristics', () => {

  test('actual value typed into the properties panel survives the export', async ({ page }) => {
    await importFixture(page);
    await page.evaluate(() => {
      const element = window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.businessObject.name === 'Gutprodukt')[0];
      window.fpbjs.get('selection').select(element);
    });
    const toggle = page.locator('#propertiesPanelToggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await page.locator('[data-group-id="group-characteristics"]').getByRole('button', { name: 'Add characteristic' }).first().click();
    await page.getByRole('button', { name: 'Add actual value' }).click();
    const actual = page.locator('#bio-properties-panel-characteristic-0-actual-0-value');
    await actual.fill('222');
    await page.locator('#bio-properties-panel-characteristic-0-actual-0-unit').fill('degC');
    await expect(actual).toHaveValue('222');

    // the panel writes after a pause in typing
    await expect.poll(async () => {
      const characteristic = await exportedCharacteristic(page, 'Gutprodukt');
      return characteristic && characteristic.descriptiveElement.actualValues
        .map((v) => ({ value: String(v.value), unit: v.unit }));
    }).toEqual([{ value: '222', unit: 'degC' }]);
  });

  test('imported actual value lists keep every entry', async ({ page }) => {
    await importFixture(page, (data) => {
      const root = data.find((e) => e.process && !e.process.isDecomposedProcessOperator);
      const state = root.elementDataInformation.find((d) => d.name === 'Gutprodukt');
      state.characteristics = [{
        $type: 'fpbch:Characteristics',
        category: { $type: 'fpb:Identification', uniqueIdent: state.id + '_c1', longName: '', shortName: 'T', versionNumber: '', revisionNumber: '' },
        descriptiveElement: {
          $type: 'fpbch:DescriptiveElement',
          valueDeterminationProcess: '',
          representivity: '',
          setpointValue: { $type: 'fpbch:ValueWithUnit', value: 80, unit: 'degC' },
          validityLimits: [{ $type: 'fpbch:ValidityLimits', limitType: 'range', from: 70, to: 90 }],
          actualValues: [
            { $type: 'fpbch:ValueWithUnit', value: 81.5, unit: 'degC' },
            { $type: 'fpbch:ValueWithUnit', value: 79.2, unit: 'degC' }
          ]
        },
        relationalElement: { $type: 'fpbch:RelationalElement', view: '', model: '', regulationsForRelationalGeneration: '' }
      }];
    });

    const characteristic = await exportedCharacteristic(page, 'Gutprodukt');
    expect(characteristic.descriptiveElement.actualValues.map((v) => v.value)).toEqual([81.5, 79.2]);
  });
});
