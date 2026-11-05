import { markText } from '../../i18n/markText';

import { parseValue } from '../values';
import { asList } from './model';

/**
 * Validity limits of a setpoint by VDI 3682 Blatt 2 Abschn. 5.2: the value
 * "appears as a setpoint with its validity limits i.e. the acceptance region,
 * the permitted rejection region and the non-permissible rejection region".
 * The last one is everything outside the permitted rejection region, so two
 * regions are kept, each with a lower and an upper limit (016c T8). Format v1
 * stays: entries `fpbch:ValidityLimits { limitType, from, to }`, the regions
 * in the words of the guideline as `limitType`.
 */
export const REGIONS = {
  acceptance: 'acceptance region',
  permitted: 'permitted rejection region'
};

/** Words older files and other tools use for the regions */
const WORDS = {
  acceptance: ['acceptance region', 'acceptance', 'gutbereich'],
  permitted: ['permitted rejection region', 'rejection', 'erlaubter fehlbereich', 'fehlbereich']
};

export function regionOf(limitType) {
  const word = String(limitType || '').trim().toLowerCase();
  if (!word) {
    return null;
  }
  return Object.keys(WORDS).find((region) => WORDS[region].indexOf(word) !== -1) || null;
}

/** The default limit older versions created for every characteristic */
export const isEmptyDefault = (limit) => !limit.limitType && Number(limit.from || 0) === 0 && Number(limit.to || 0) === 0;

/**
 * `{ acceptance, permitted, others }` with entries `{ index, limitType, from,
 * to }`: the first entry of each region; further ones and unknown types go to
 * `others`; the empty default of older versions is left out.
 */
export function readLimits(list) {
  const result = { acceptance: null, permitted: null, others: [] };
  asList(list).forEach((limit, index) => {
    if (!limit || isEmptyDefault(limit)) {
      return;
    }
    const entry = { index, limitType: limit.limitType, from: limit.from, to: limit.to };
    const region = regionOf(limit.limitType);
    if (region && !result[region]) {
      result[region] = entry;
    } else {
      result.others.push(entry);
    }
  });
  return result;
}

const isSet = (value) => value !== undefined && value !== null && value !== '';

/**
 * A new list with one limit of a region set; the region's entry is created
 * when missing and left out when both of its limits are empty afterwards,
 * and so is the empty default of older versions.
 * Entries are replaced, never changed, so undo has the old ones.
 */
export function withRegionBound(list, region, bound, value, create) {
  // the empty default older versions created goes with the first write (T9)
  const entries = asList(list).filter((limit) => limit && !isEmptyDefault(limit));
  const existing = readLimits(entries)[region];

  if (!existing) {
    if (!isSet(value)) {
      return entries;
    }
    const attrs = { limitType: REGIONS[region] };
    attrs[bound] = value;
    return entries.concat(create('fpbch:ValidityLimits', attrs));
  }

  const old = entries[existing.index];
  const next = { limitType: old.limitType, from: old.from, to: old.to };
  next[bound] = value;
  if (!isSet(next.from) && !isSet(next.to)) {
    entries.splice(existing.index, 1);
    return entries;
  }
  const attrs = { limitType: next.limitType };
  if (isSet(next.from)) {
    attrs.from = next.from;
  }
  if (isSet(next.to)) {
    attrs.to = next.to;
  }
  entries[existing.index] = create('fpbch:ValidityLimits', attrs);
  return entries;
}

export function withoutLimit(list, index) {
  return asList(list).filter((limit, position) => position !== index);
}

/** A limit is a number (with point or comma); empty is no limit */
export function parseLimit(text) {
  const value = parseValue(text);
  if (value === undefined) {
    return { value: undefined, error: null };
  }
  if (typeof value === 'number') {
    return { value, error: null };
  }
  return { value: undefined, error: markText('A limit is a number.') };
}
