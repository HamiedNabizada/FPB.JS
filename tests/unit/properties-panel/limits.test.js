import { describe, it, expect } from 'vitest';

import {
  REGIONS, regionOf, readLimits, withRegionBound, withoutLimit, parseLimit
} from '../../../app/fpb/properties-panel/characteristics/limits.js';

/** Validity limits by the regions of VDI 3682 Blatt 2 Abschn. 5.2 (016c T8, T9) */

const create = (type, attrs) => Object.assign({ $type: type }, attrs);

describe('validity limits', () => {

  it('names the regions in the words of the guideline', () => {
    expect(REGIONS).toEqual({ acceptance: 'acceptance region', permitted: 'permitted rejection region' });
  });

  it('reads the region from the words older files use', () => {
    for (const word of ['acceptance region', 'Acceptance', ' gutbereich ']) {
      expect(regionOf(word)).toBe('acceptance');
    }
    for (const word of ['permitted rejection region', 'rejection', 'Erlaubter Fehlbereich', 'fehlbereich']) {
      expect(regionOf(word)).toBe('permitted');
    }
    expect(regionOf('t')).toBeNull();
    expect(regionOf('')).toBeNull();
    expect(regionOf(undefined)).toBeNull();
  });

  it('takes the first entry per region, lists the rest and skips the empty default', () => {
    const limits = readLimits([
      { limitType: '', from: 0, to: 0 },
      { limitType: 'acceptance', from: 350, to: 356 },
      { limitType: 't', from: 1, to: 2 },
      { limitType: 'acceptance region', from: 1, to: 2 }
    ]);
    expect(limits.acceptance).toMatchObject({ index: 1, from: 350, to: 356 });
    expect(limits.permitted).toBeNull();
    expect(limits.others.map((o) => o.index)).toEqual([2, 3]);
  });

  it('reads a single object as a list', () => {
    expect(readLimits({ limitType: 'acceptance', from: 1, to: 2 }).acceptance).toMatchObject({ index: 0 });
    expect(readLimits(undefined)).toEqual({ acceptance: null, permitted: null, others: [] });
  });

  it('creates a region when a bound is set and removes it when both are empty', () => {
    const one = withRegionBound([], 'permitted', 'from', 345, create);
    expect(one).toEqual([{ $type: 'fpbch:ValidityLimits', limitType: 'permitted rejection region', from: 345 }]);

    const two = withRegionBound(one, 'permitted', 'to', 360, create);
    expect(two[0]).toMatchObject({ from: 345, to: 360 });
    expect(one[0].to).toBeUndefined();

    const three = withRegionBound(two, 'permitted', 'from', undefined, create);
    expect(three[0]).toMatchObject({ to: 360 });
    expect(three[0].from).toBeUndefined();

    expect(withRegionBound(three, 'permitted', 'to', undefined, create)).toEqual([]);
  });

  it('drops the empty default of older versions when it writes', () => {
    const list = [{ $type: 'fpbch:ValidityLimits', limitType: '', from: 0, to: 0 }];
    expect(withRegionBound(list, 'acceptance', 'from', 350, create)).toEqual([
      { $type: 'fpbch:ValidityLimits', limitType: 'acceptance region', from: 350 }
    ]);
  });

  it('keeps the type of an older entry it changes', () => {
    const list = [{ $type: 'fpbch:ValidityLimits', limitType: 'acceptance', from: 350, to: 356 }];
    expect(withRegionBound(list, 'acceptance', 'to', 357, create)[0]).toMatchObject({ limitType: 'acceptance', from: 350, to: 357 });
  });

  it('removes one entry by its index', () => {
    expect(withoutLimit([{ limitType: 'a' }, { limitType: 'b' }], 0)).toEqual([{ limitType: 'b' }]);
  });

  it('reads a limit as a number with point or comma, empty as no limit, text as an error', () => {
    expect(parseLimit('1,5')).toEqual({ value: 1.5, error: null });
    expect(parseLimit(' 350 ')).toEqual({ value: 350, error: null });
    expect(parseLimit('')).toEqual({ value: undefined, error: null });
    expect(parseLimit('abc')).toEqual({ value: undefined, error: 'A limit is a number.' });
  });
});
