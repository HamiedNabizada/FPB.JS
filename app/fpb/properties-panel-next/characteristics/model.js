/**
 * Characteristics of an FPB object (VDI 3682 Blatt 2 Bild 5 to 7) as plain
 * operations on the list. The panel writes a changed copy through
 * updateProperties, so undo has the old list to return to.
 */

/** Type of an object a path creates when it is missing */
const MISSING = {
  category: 'fpb:Identification',
  descriptiveElement: 'fpbch:DescriptiveElement',
  relationalElement: 'fpbch:RelationalElement',
  setpointValue: 'fpbch:ValueWithUnit'
};

export function asList(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * A new characteristic. Unlike the old panel it gets no empty validity limit
 * (016b V3: limits are shown, not edited, so an empty one only stood there).
 */
export function newCharacteristic(create, ownerId, number) {
  return create('fpbch:Characteristics', {
    category: create('fpb:Identification', {
      uniqueIdent: ownerId + '_c' + number,
      longName: '',
      shortName: 'C_' + number,
      versionNumber: '',
      revisionNumber: ''
    }),
    descriptiveElement: create('fpbch:DescriptiveElement', {
      valueDeterminationProcess: '',
      representivity: '',
      setpointValue: create('fpbch:ValueWithUnit', { unit: '' }),
      validityLimits: [],
      actualValues: []
    }),
    relationalElement: create('fpbch:RelationalElement', {
      view: '',
      model: '',
      regulationsForRelationalGeneration: ''
    })
  });
}

/**
 * A copy of the list with one field set. `path` leads from the characteristic
 * to the field, numbers index into lists: ['category', 'longName'] or
 * ['descriptiveElement', 'actualValues', 0, 'value'].
 */
export function withField(list, index, path, value, tools) {
  const { clone, create } = tools;
  const next = clone(asList(list));
  let target = next[index];

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (typeof key === 'number') {
      while (target.length <= key) {
        target.push(create('fpbch:ValueWithUnit', {}));
      }
    } else if (target[key] === undefined || target[key] === null) {
      target[key] = typeof path[i + 1] === 'number' ? [] : create(MISSING[key] || 'fpbch:ValueWithUnit', {});
    } else if (typeof path[i + 1] === 'number' && !Array.isArray(target[key])) {
      // older files: a single object where the schema has a list
      target[key] = [target[key]];
    }
    target = target[key];
  }

  target[path[path.length - 1]] = value;
  return next;
}

export function withoutCharacteristic(list, index) {
  return asList(list).filter((characteristic, position) => position !== index);
}

/** The descriptive element of a characteristic in a copied list, created when missing */
function descriptiveOf(characteristic, create) {
  if (!characteristic.descriptiveElement) {
    characteristic.descriptiveElement = create('fpbch:DescriptiveElement', {});
  }
  return characteristic.descriptiveElement;
}

/** A copy of the list with an empty actual value appended (016c decision 9) */
export function withNewActualValue(list, index, tools) {
  const next = tools.clone(asList(list));
  const descriptive = descriptiveOf(next[index], tools.create);
  descriptive.actualValues = asList(descriptive.actualValues).concat(tools.create('fpbch:ValueWithUnit', {}));
  return next;
}

/** A copy of the list without the actual value at `position` */
export function withoutActualValue(list, index, position, tools) {
  const next = tools.clone(asList(list));
  const descriptive = descriptiveOf(next[index], tools.create);
  descriptive.actualValues = asList(descriptive.actualValues).filter((value, at) => at !== position);
  return next;
}
