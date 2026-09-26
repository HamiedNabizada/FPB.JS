// tests/unit/aml/oracleMask.js
//
// Masking for the comparison with the C# mapper (tools/aml-oracle). The
// mapper's own GUIDs and the time are fixed on both sides; only the IDs that
// Aml.Engine generates itself (random, version 4, e.g. for new classes) differ
// from run to run. They are numbered in the order they first appear, so both
// outputs must still use the same random ID at the same places. GUIDs of the
// input, the fixed ones (00000000-0000-4000-8000-...) and the name-based ones
// (version 5, derived with SHA-1) are compared as they are.

const GUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-([0-9a-fA-F])[0-9a-fA-F]{3}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const FIXED = '00000000-0000-4000-8000-';

/** The GUIDs in the given texts, lower case */
export function guidsIn(...texts) {
  const found = new Set();
  texts.forEach((text) => {
    for (const match of String(text || '').matchAll(GUID)) {
      found.add(match[0].toLowerCase());
    }
  });
  return found;
}

/** `text` with the random GUIDs of Aml.Engine numbered; `keep` are the GUIDs of the input */
export function maskRandomGuids(text, keep = new Set()) {
  const numbers = new Map();
  return text.replace(GUID, (guid, version) => {
    const key = guid.toLowerCase();
    if (version !== '4' || keep.has(key) || key.startsWith(FIXED)) {
      return guid;
    }
    if (!numbers.has(key)) {
      numbers.set(key, 'random-guid-' + (numbers.size + 1));
    }
    return numbers.get(key);
  });
}
