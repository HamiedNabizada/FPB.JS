import { describe, it, expect } from 'vitest';

import { describeCounts } from '../../../app/fpb/validation/FpbValidation.js';

/**
 * The counts of the model check as words (toolbar, list), in the language of
 * translate (016h V5): one and many as two keys each.
 */

const de = {
  '{count} error': '{count} Fehler',
  '{count} errors': '{count} Fehler',
  '{count} warning': '{count} Warnung',
  '{count} warnings': '{count} Warnungen',
  '{count} note': '{count} Hinweis',
  '{count} notes': '{count} Hinweise'
};
const t = (s, r) => (de[s] || s).replace('{count}', r.count);

describe('describeCounts', () => {

  it('reads as before in English', () => {
    expect(describeCounts({ error: 0, warning: 1, info: 2 })).toBe('0 errors, 1 warning, 2 notes');
  });

  it('speaks the language of translate', () => {
    expect(describeCounts({ error: 1, warning: 2, info: 1 }, t)).toBe('1 Fehler, 2 Warnungen, 1 Hinweis');
  });
});
