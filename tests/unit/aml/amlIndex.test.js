// tests/unit/aml/amlIndex.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CAEXDocument } from 'amlengine-js';

import { buildAmlIndex } from '../../../app/fpb/aml/amlIndex.js';
import { walkInternalElements } from '../../../app/fpb/aml/mapper/walker.js';

// Showcase A with a plant hierarchy linking into a state, user attributes and
// a second FPD hierarchy (tools/aml-oracle, BuildMixed)
const mixed = fs.readFileSync(path.join(__dirname, 'oracle', 'inputs', 'generated', 'mixed.aml'), 'utf8').replace(/^﻿/, '');

function fpdHierarchy(doc) {
  for (const ih of doc.caexFile.instanceHierarchy) {
    let fpd = false;
    walkInternalElements(ih.internalElement, (ie) => {
      fpd = fpd || /FPD_Process$/.test(ie.refBaseSystemUnitPath || '');
    });
    if (fpd) {
      return ih;
    }
  }
  return null;
}

describe('foreign AML content per FPB element', () => {

  it('finds the plant link, the user interface and the user attribute of the state', () => {
    const doc = CAEXDocument.loadFromString(mixed);
    const index = buildAmlIndex(doc, fpdHierarchy(doc));

    const state = [...index.values()].find((e) => e.attributes.some((a) => a.path === 'Materialnummer'));
    expect(state).toBeTruthy();
    expect(state.attributes).toContainEqual({ path: 'Materialnummer', value: '4711', unit: '' });
    expect(state.interfaces.map((i) => i.name)).toContain('Anlagenbezug');
    expect(state.links).toContainEqual({ link: 'B1_Prozess', owner: 'Behaelter_B1', partner: 'Behaelter_B1 (ZumProzess)' });
  });

  it('lists the attribute of the process operator and leaves FPD attributes and flows out', () => {
    const doc = CAEXDocument.loadFromString(mixed);
    const index = buildAmlIndex(doc, fpdHierarchy(doc));

    const po = [...index.values()].find((e) => e.attributes.some((a) => a.path === 'Verantwortlich'));
    expect(po.attributes).toEqual([{ path: 'Verantwortlich', value: 'Leitstand 2', unit: '' }]);
    // Showcase A links this operator to its pressure control on its own; flows are not listed
    expect(po.links.map((l) => l.link)).toEqual(['VentilToPressureCtl']);
    [...index.values()].forEach((entry) => {
      entry.attributes.forEach((a) => expect(['Identification', 'Characteristics', 'ViewInformation']).not.toContain(a.path.split('/')[0]));
    });
  });

  it('is empty without an FPD hierarchy', () => {
    const doc = CAEXDocument.loadFromString(mixed);
    expect(buildAmlIndex(doc, null).size).toBe(0);
  });
});
