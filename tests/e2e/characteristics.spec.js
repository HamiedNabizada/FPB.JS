// tests/e2e/characteristics.spec.js
import { test, expect } from '@playwright/test';
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

    const typed = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const type = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const field = (id, placeholder) => [...document.querySelectorAll('[id="' + id + '"]')]
        .find((n) => n.tagName === 'INPUT' && n.placeholder === placeholder) || null;

      const element = window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.businessObject.name === 'Gutprodukt')[0];
      window.fpbjs.get('selection').select(element);
      await sleep(400);

      const findAddButton = () => [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim() === 'Add characteristics');
      const toggle = document.querySelector('#openPropertiesPanelButton');
      if (!findAddButton() && toggle) {
        toggle.click();
        await sleep(700);
      }
      const addButton = findAddButton();
      if (!addButton) {
        return { error: 'Add characteristics button not found' };
      }
      addButton.click();
      await sleep(700);

      const actual = field('pp_characteristics_descriptiveElement_actualValues', 'value');
      const unit = field('pp_characteristics_descriptiveElement_actualValues', 'unit');
      if (!actual || !unit) {
        return { error: 'actual value inputs not found' };
      }
      type(actual, '222');
      await sleep(200);
      type(unit, 'degC');
      await sleep(400);
      return { shown: actual.value };
    });

    expect(typed.error).toBeUndefined();
    expect(typed.shown).toBe('222');

    const characteristic = await exportedCharacteristic(page, 'Gutprodukt');
    expect(characteristic).not.toBeNull();
    expect(characteristic.descriptiveElement.actualValues).toEqual([
      expect.objectContaining({ value: '222', unit: 'degC' })
    ]);
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
