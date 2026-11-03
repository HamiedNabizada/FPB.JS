// tests/unit/properties-panel/characteristicsModel.test.js
import { describe, it, expect } from 'vitest';

import { newCharacteristic, withField, withoutCharacteristic, asList, withoutActualValue } from '../../../app/fpb/properties-panel/characteristics/model.js';
import { cloneModdle } from '../../../app/fpb/help/moddleClone.js';

const create = (type, attrs) => ({ $type: type, ...attrs });
const tools = { create, clone: (value) => cloneModdle({ create }, value) };

describe('characteristics model', () => {

  it('a new characteristic has category, descriptive and relational element, and no validity limit', () => {
    const c = newCharacteristic(create, 'state1', 3);
    expect(c.$type).toBe('fpbch:Characteristics');
    expect(c.category).toMatchObject({ uniqueIdent: 'state1_c3', shortName: 'C_3' });
    expect(c.descriptiveElement.validityLimits).toEqual([]);
    expect(c.descriptiveElement.actualValues).toEqual([]);
    expect(c.relationalElement.$type).toBe('fpbch:RelationalElement');
  });

  it('sets a field on a copy and leaves the old list as it was', () => {
    const list = [newCharacteristic(create, 's', 1)];
    const next = withField(list, 0, ['descriptiveElement', 'setpointValue', 'value'], 20, tools);
    expect(next[0].descriptiveElement.setpointValue.value).toBe(20);
    expect(list[0].descriptiveElement.setpointValue.value).toBeUndefined();
  });

  it('creates what is missing on the way, also the first actual value', () => {
    const list = [{ $type: 'fpbch:Characteristics' }];
    const next = withField(list, 0, ['descriptiveElement', 'actualValues', 0, 'value'], 7, tools);
    expect(next[0].descriptiveElement.actualValues[0]).toMatchObject({ $type: 'fpbch:ValueWithUnit', value: 7 });
  });

  it('removes one characteristic', () => {
    const list = [newCharacteristic(create, 's', 1), newCharacteristic(create, 's', 2)];
    expect(withoutCharacteristic(list, 0).map((c) => c.category.shortName)).toEqual(['C_2']);
  });

  it('older files may hold a single object where the schema has a list', () => {
    expect(asList(undefined)).toEqual([]);
    expect(asList({ value: 1 })).toEqual([{ value: 1 }]);
    expect(asList([1, 2])).toEqual([1, 2]);
  });

  // 016g B1: the row of "Add" reaches the model with its first input,
  // through withField, which creates the value at the next position
  it('the first input of a new row creates the actual value with it, also after a single object of older files', () => {
    const list = [{ $type: 'fpbch:Characteristics', descriptiveElement: { $type: 'fpbch:DescriptiveElement', actualValues: { $type: 'fpbch:ValueWithUnit', value: 1 } } }];
    const next = withField(list, 0, ['descriptiveElement', 'actualValues', 1, 'value'], 7, tools);
    expect(next[0].descriptiveElement.actualValues.map((v) => v.value)).toEqual([1, 7]);
    expect(next[0].descriptiveElement.actualValues[1].$type).toBe('fpbch:ValueWithUnit');
    expect(list[0].descriptiveElement.actualValues.value).toBe(1);
  });

  it('removes one actual value by its position on a copy (016c)', () => {
    const list = [{ $type: 'fpbch:Characteristics', descriptiveElement: { actualValues: [{ value: 1 }, { value: 2 }] } }];
    const next = withoutActualValue(list, 0, 0, tools);
    expect(next[0].descriptiveElement.actualValues.map((v) => v.value)).toEqual([2]);
    expect(list[0].descriptiveElement.actualValues).toHaveLength(2);
  });
});
