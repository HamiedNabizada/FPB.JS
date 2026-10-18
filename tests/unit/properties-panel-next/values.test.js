// tests/unit/properties-panel-next/values.test.js
import { describe, it, expect } from 'vitest';

import { parseValue, formatValue } from '../../../app/fpb/properties-panel-next/values.js';

/** Setpoint and actual values: number or text (VDI 3682 Blatt 2 §5.2, 016b V2) */
describe('values', () => {

  it('reads numbers with point or comma', () => {
    expect(parseValue('1.5')).toBe(1.5);
    expect(parseValue('1,5')).toBe(1.5);
    expect(parseValue(' 2 ')).toBe(2);
    expect(parseValue('-0,25')).toBe(-0.25);
    expect(parseValue('3e2')).toBe(300);
  });

  // Review Focus 3
  it('keeps anything else as text, also numbers with thousands separators', () => {
    expect(parseValue('flüssig')).toBe('flüssig');
    expect(parseValue('1.000,5')).toBe('1.000,5');
    expect(parseValue('20 °C')).toBe('20 °C');
  });

  it('an empty field removes the value', () => {
    expect(parseValue('')).toBeUndefined();
    expect(parseValue('   ')).toBeUndefined();
    expect(parseValue(undefined)).toBeUndefined();
  });

  it('shows numbers and text as they are, nothing for no value', () => {
    expect(formatValue(1.5)).toBe('1.5');
    expect(formatValue('flüssig')).toBe('flüssig');
    expect(formatValue(undefined)).toBe('');
    expect(formatValue(null)).toBe('');
    expect(formatValue(0)).toBe('0');
  });
});
