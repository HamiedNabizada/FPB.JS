/**
 * Copy of the exchange data (the array of processes as it is imported and
 * exported).
 *
 * Both the importer and the auto layout consume their input: the importer
 * removes every entry it has matched and swaps ids for objects in place. So
 * they work on a copy, otherwise importing the same object twice would import
 * something different the second time.
 *
 * JSON does the job for data read from a file. It fails on a live model
 * (`getProcesses()` returns objects that point back at each other) and on
 * anything carrying functions, and the fallback used to hand back the original
 * object, which was then modified in the caller's hands without a word. The
 * structural copy below takes over in that case: it keeps shared references
 * shared and cycles intact, and it drops functions.
 */
export function cloneModelData(data) {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    return structuralCopy(data, new Map());
  }
}

function structuralCopy(value, copies) {
  if (!value || typeof value !== 'object') {
    return typeof value === 'function' ? undefined : value;
  }
  if (copies.has(value)) {
    return copies.get(value);
  }

  const copy = Array.isArray(value) ? [] : {};
  copies.set(value, copy);

  Object.keys(value).forEach(function (key) {
    const copied = structuralCopy(value[key], copies);

    if (copied !== undefined) {
      copy[key] = copied;
    }
  });

  return copy;
}
