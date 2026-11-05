import { describe, it, expect } from 'vitest';

import { normalizeLanguage, fill, translateMessage, translateIn } from '../../../app/fpb/i18n/language.js';

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

  it('translates a list of values and joins it with commas', () => {
    const list = { template: 'Delete {what}', args: { what: [{ template: 'the state' }, 'Erhitzen'] } };
    expect(translateMessage(t, list)).toBe('Lösche den Zustand, Erhitzen');
  });

  it('gives a message without template as it is', () => {
    expect(translateMessage(t, { message: 'plain' })).toBe('plain');
    expect(translateMessage(t, 'the state')).toBe('the state');
    expect(translateMessage(t, null)).toBe('');
  });
});

describe('translateIn', () => {

  const catalog = { 'AML: Copy': 'Kopie', 'Copy': 'Kopieren' };
  const t = (s, r) => fill(catalog[s] || s, r);

  it('takes the entry of the word in its context', () => {
    expect(translateIn(t, 'AML', 'Copy')).toBe('Kopie');
    expect(t('Copy')).toBe('Kopieren');
  });

  it('keeps the English word where the context has no entry', () => {
    expect(translateIn((s, r) => fill(s, r), 'AML', 'Copy')).toBe('Copy');
    expect(translateIn((s, r) => fill(s, r), 'AML', 'Copy {n}', { n: 2 })).toBe('Copy 2');
  });
});
