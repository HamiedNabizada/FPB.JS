// tests/unit/properties-panel/characteristicsNumbering.test.js
import { describe, it, expect } from 'vitest';

import { nextCharacteristicNumber } from '../../../app/fpb/properties-panel/characteristicsNumbering.js';

const characteristic = (shortName) => ({ category: { shortName, uniqueIdent: 'el_' + shortName } });

describe('nextCharacteristicNumber', () => {

  it('starts at 1 without characteristics', () => {
    expect(nextCharacteristicNumber(undefined)).toBe(1);
    expect(nextCharacteristicNumber([])).toBe(1);
  });

  it('counts on from the existing entries', () => {
    expect(nextCharacteristicNumber([characteristic('C_1'), characteristic('C_2')])).toBe(3);
  });

  /** The reason for this function: a gap must not hand out a number twice */
  it('does not reuse a number after one in between was removed', () => {
    const remaining = [characteristic('C_2'), characteristic('C_3')];
    expect(nextCharacteristicNumber(remaining)).toBe(4);
  });

  it('ignores renamed characteristics and incomplete entries', () => {
    const mixed = [characteristic('Temperature'), characteristic('C_5'), {}, null];
    expect(nextCharacteristicNumber(mixed)).toBe(6);
  });
});
