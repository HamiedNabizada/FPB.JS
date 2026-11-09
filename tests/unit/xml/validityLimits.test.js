import { describe, it, expect } from 'vitest';

import { limitFromXml, limitAttributes, setpointAttributes } from '../../../app/fpb/xml/XMLMapper.js';

/**
 * Validity limits through the XML (016c T9a): an empty limit stays empty
 * instead of coming back as 0, a number stays a number. Since the limits can
 * be edited (016c decision 8), a limit is often set on one side only.
 */

const element = (xml) => new DOMParser().parseFromString(xml, 'application/xml').documentElement;

describe('XMLMapper: validity limits', () => {

  it('reads an empty limit as no limit, not as 0', () => {
    expect(limitFromXml(element('<validityLimits limitType="acceptance region" from="350" to=""/>')))
      .toEqual({ $type: 'fpbch:ValidityLimits', limitType: 'acceptance region', from: 350, to: undefined });
    expect(limitFromXml(element('<validityLimits limitType="permitted rejection region" to="360.5"/>')))
      .toEqual({ $type: 'fpbch:ValidityLimits', limitType: 'permitted rejection region', from: undefined, to: 360.5 });
  });

  it('keeps a limit that is not wholly a number as text instead of cutting it', () => {
    const limit = limitFromXml(element('<validityLimits limitType="acceptance region" from="1,5" to="12abc"/>'));
    expect(limit.from).toBe('1,5');
    expect(limit.to).toBe('12abc');
    expect(limitFromXml(element('<validityLimits limitType="acceptance region" from=" 2.5 " to="-3e2"/>')))
      .toMatchObject({ from: 2.5, to: -300 });
    // only blanks is no limit, not 0
    expect(limitFromXml(element('<validityLimits limitType="acceptance region" from="  " to="5"/>')).from).toBeUndefined();
  });

  it('keeps 0 as a limit', () => {
    expect(limitFromXml(element('<validityLimits limitType="acceptance region" from="0" to="5"/>')).from).toBe(0);
  });

  it('writes only the limits that are set', () => {
    expect(limitAttributes({ limitType: 'acceptance region', from: 350 }))
      .toEqual({ limitType: 'acceptance region', from: '350' });
    expect(limitAttributes({ limitType: '', from: 0, to: 0 }))
      .toEqual({ limitType: '', from: '0', to: '0' });
  });
});

// 032a V11: a setpoint of 0 is a value, not an empty field
describe('XMLMapper: setpoint', () => {

  it('a setpoint of 0 is written to the XML', () => {
    expect(setpointAttributes({ setpointValue: { value: 0, unit: 'K' } })).toEqual({ setpointValue: '0', unit: 'K' });
    expect(setpointAttributes({ setpointValue: { value: '0', unit: '' } })).toEqual({ setpointValue: '0' });
  });

  it('an empty setpoint writes no attribute', () => {
    ['', null, undefined].forEach((value) => {
      expect(setpointAttributes({ setpointValue: { value, unit: '' } })).toEqual({});
    });
    expect(setpointAttributes({})).toEqual({});
  });
});
