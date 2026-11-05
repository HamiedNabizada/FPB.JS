import { describe, it, expect } from 'vitest';

import { keyLabel } from '../../../app/fpb/info/keyboardShortcuts.js';

/**
 * Keys in the language of the interface (016h V8): each named key of a
 * combination is translated on its own, letters, symbols and the separators
 * stay as they are.
 */

const t = (s) => ({ 'key: Ctrl': 'Strg', 'key: Shift': 'Umschalt', 'key: Delete': 'Entf', 'key: Arrow Keys': 'Pfeiltasten', 'key: Space': 'Leertaste', 'key: Mouse': 'Maus' }[s] || s);

describe('keyLabel', () => {

  it('translates each named key', () => {
    expect(keyLabel('Ctrl+Shift+L', t)).toBe('Strg+Umschalt+L');
    expect(keyLabel('Delete', t)).toBe('Entf');
  });

  it('keeps symbols, letters and the separators', () => {
    expect(keyLabel('⌘+Arrow Keys', t)).toBe('⌘+Pfeiltasten');
    expect(keyLabel('Space + Mouse', t)).toBe('Leertaste + Maus');
    expect(keyLabel('Alt+↓', t)).toBe('Alt+↓');
  });

  it('gives the keys unchanged without translate', () => {
    expect(keyLabel('Ctrl+O')).toBe('Ctrl+O');
  });

  it('keeps the English name where translate has no entry', () => {
    expect(keyLabel('Ctrl+Delete', (s) => s)).toBe('Ctrl+Delete');
  });
});
