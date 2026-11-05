import { describe, it, expect } from 'vitest';

import { normalizeLanguage, fill, translateMessage } from '../../../app/fpb/i18n/language.js';

/**
 * The pure helpers of the translation (016h T1, T3, plan F1 decisions 3 and
 * 6): which language a value names, placeholders as in diagram-js, and
 * messages whose values are messages of their own.
 */

describe('normalizeLanguage', () => {

  it('normalizes language values', () => {
    expect(normalizeLanguage('de')).toBe('de');
    expect(normalizeLanguage('DE')).toBe('de');
    expect(normalizeLanguage('de-AT')).toBe('de');
    expect(normalizeLanguage(' en_GB ')).toBe('en');
    expect(normalizeLanguage('en')).toBe('en');
  });

  it('names no language for anything else', () => {
    expect(normalizeLanguage('fr')).toBe(null);
    expect(normalizeLanguage('user')).toBe(null);
    expect(normalizeLanguage('')).toBe(null);
    expect(normalizeLanguage(undefined)).toBe(null);
    expect(normalizeLanguage(7)).toBe(null);
    expect(normalizeLanguage('denglish')).toBe(null);
  });
});

describe('fill', () => {

  it('fills placeholders like diagram-js', () => {
    expect(fill('Remove {type}', { type: 'Product' })).toBe('Remove Product');
    expect(fill('{a} and {a}', { a: 1 })).toBe('1 and 1');
  });

  it('leaves unknown placeholders as they are', () => {
    expect(fill('Remove {type}', {})).toBe('Remove {type}');
    expect(fill('Remove {type}')).toBe('Remove {type}');
  });
});

describe('translateMessage', () => {

  const catalog = { 'Delete {what}': 'Lösche {what}', 'the state': 'den Zustand' };
  const t = (s, r) => fill(catalog[s] || s, r);

  it('translates nested messages, data stays', () => {
    expect(translateMessage(t, { template: 'Delete {what}', args: { what: { template: 'the state' } } })).toBe('Lösche den Zustand');
    expect(translateMessage(t, { template: 'Delete {what}', args: { what: 'Erhitzen' } })).toBe('Lösche Erhitzen');
  });

  it('gives a message without template as it is', () => {
    expect(translateMessage(t, { message: 'plain' })).toBe('plain');
    expect(translateMessage(t, 'the state')).toBe('the state');
    expect(translateMessage(t, null)).toBe('');
  });
});
