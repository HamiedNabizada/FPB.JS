/**
 * The content of model values, for comparing the copies of a boundary state
 * (modeling/behavior/StateCopySyncBehavior, validation/ModelChecker F9): two
 * objects agree when they hold the same fields, whatever object they are.
 */

const isEmpty = (value) => value === undefined || value === null || value === '' ||
  (Array.isArray(value) && value.length === 0);

/** The content of a model value, without moddle internals and empty fields */
export function content(value, depth = 0) {
  if (isEmpty(value)) {
    return null;
  }
  if (typeof value !== 'object' || depth > 8) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => content(entry, depth + 1));
  }
  const out = value.$type ? { $type: value.$type } : {};
  Object.keys(value).sort().forEach((key) => {
    if (key.charAt(0) !== '$' && !isEmpty(value[key])) {
      out[key] = content(value[key], depth + 1);
    }
  });
  return out;
}

export const sameContent = (a, b) => a === b || JSON.stringify(content(a)) === JSON.stringify(content(b));
