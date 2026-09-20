// tests/unit/help/cloneModelData.test.js
import { describe, it, expect } from 'vitest';

import { cloneModelData } from '../../../app/fpb/help/cloneModelData.js';

describe('cloneModelData', () => {

  it('copies plain exchange data', () => {
    const daten = [{ process: { id: 'p1' }, elementDataInformation: [{ id: 'a' }] }];
    const kopie = cloneModelData(daten);

    expect(kopie).toEqual(daten);
    kopie[0].elementDataInformation.pop();
    expect(daten[0].elementDataInformation).toHaveLength(1);
  });

  /** Der Grund für den Helfer: das Original darf nie zurückgegeben werden */
  it('copies data that points back at itself', () => {
    const prozess = { id: 'p1' };
    const zustand = { id: 's1', parent: prozess };
    prozess.elementsContainer = [zustand];
    const daten = [{ process: prozess, elementDataInformation: [zustand] }];

    const kopie = cloneModelData(daten);

    expect(kopie).not.toBe(daten);
    expect(kopie[0].process).not.toBe(prozess);
    expect(kopie[0].process.id).toBe('p1');
    // der Zyklus bleibt erhalten, zeigt aber auf die Kopie
    expect(kopie[0].process.elementsContainer[0].parent).toBe(kopie[0].process);
    // geteilte Verweise bleiben geteilt
    expect(kopie[0].elementDataInformation[0]).toBe(kopie[0].process.elementsContainer[0]);

    kopie[0].process.id = 'anders';
    expect(prozess.id).toBe('p1');
  });

  it('drops functions instead of failing', () => {
    const daten = { id: 'p1', $instanceOf: () => true, zyklus: null };
    daten.zyklus = daten;

    const kopie = cloneModelData(daten);

    expect(kopie.$instanceOf).toBeUndefined();
    expect(kopie.zyklus).toBe(kopie);
  });
});
