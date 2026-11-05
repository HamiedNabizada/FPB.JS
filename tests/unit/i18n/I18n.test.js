import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import EventBus from 'diagram-js/lib/core/EventBus';

import I18n from '../../../app/fpb/i18n/I18n.js';
import de from '../../../app/fpb/i18n/de.js';

// the setup mocks the event bus; these tests need the real one
vi.unmock('diagram-js/lib/core/EventBus');

/**
 * The language of FPB.js (016h V1, V3, V4, V9, T1, T3, T7, T8, T14): English
 * unless the host or the user says otherwise, German from the catalog, the
 * user's choice kept like the theme's.
 */

const KEY = 'Test text {name}';
const STORAGE_KEY = 'fpbjs.language';

const canvas = (container = null) => ({ getContainer: () => container });

function create(config = {}, eventBus = new EventBus(), host = null) {
  return { i18n: new I18n(config, eventBus, canvas(host)), eventBus };
}

describe('I18n', () => {

  beforeEach(() => {
    de[KEY] = 'Testtext {name}';
    window.localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    delete de[KEY];
    window.localStorage.removeItem(STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('starts in English without an option', () => {
    const { i18n } = create();
    expect(i18n.get()).toBe('en');
    expect(i18n.isUserChoice()).toBe(false);
  });

  it('starts in German with language: de', () => {
    expect(create({ language: 'de' }).i18n.get()).toBe('de');
  });

  it('starts in German with language: de-DE', () => {
    expect(create({ language: 'de-DE' }).i18n.get()).toBe('de');
  });

  it('warns once and uses English for an unknown language', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { i18n } = create({ language: 'fr' });
    expect(i18n.get()).toBe('en');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe('FPB.js: language "fr" is not available, using English.');
  });

  it('set fires i18n.changed once, only on a change', () => {
    const { i18n, eventBus } = create();
    const events = [];
    eventBus.on('i18n.changed', (event) => {
      events.push(event.language);
    });
    expect(i18n.set('de')).toBe('de');
    expect(i18n.set('DE')).toBe('de');
    expect(events).toEqual(['de']);
  });

  it('translate looks up German and falls back to English', () => {
    const { i18n } = create({ language: 'de' });
    expect(i18n.translate(KEY, { name: 'X' })).toBe('Testtext X');
    expect(i18n.translate('No such text {n}', { n: 2 })).toBe('No such text 2');
    i18n.set('en');
    expect(i18n.translate(KEY, { name: 'X' })).toBe('Test text X');
  });

  it('getMissing lists keys asked in German without an entry, not in English', () => {
    const { i18n } = create();
    i18n.translate('Missing in English');
    expect(i18n.getMissing()).toEqual([]);
    i18n.set('de');
    i18n.translate(KEY);
    i18n.translate('Missing in German');
    i18n.translate('Missing in German');
    expect(i18n.getMissing()).toEqual(['Missing in German']);
  });

  it('user mode starts with the stored choice and stores choose()', () => {
    window.localStorage.setItem(STORAGE_KEY, 'de');
    const { i18n } = create({ language: 'user' });
    expect(i18n.get()).toBe('de');
    expect(i18n.isUserChoice()).toBe(true);
    expect(i18n.choose('en')).toBe('en');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('en');
  });

  it('user mode without a stored choice starts in English', () => {
    expect(create({ language: 'user' }).i18n.get()).toBe('en');
  });

  it('user mode survives a throwing localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { i18n } = create({ language: 'user' });
    expect(i18n.get()).toBe('en');
    expect(() => i18n.choose('de')).not.toThrow();
    expect(i18n.get()).toBe('de');
  });

  it('set by the host ends the user\'s choice', () => {
    const { i18n } = create({ language: 'user' });
    i18n.set('de');
    expect(i18n.isUserChoice()).toBe(false);
    i18n.choose('en');
    expect(i18n.get()).toBe('en');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(null);
  });

  // final review, Important 3: the button goes also when the language stays
  it('set fires i18n.modeChanged when it ends the choice of the user, also with the same language', () => {
    const { i18n, eventBus } = create({ language: 'user' });
    const modes = [];
    eventBus.on('i18n.modeChanged', (event) => {
      modes.push(event.userChoice);
    });
    i18n.set('en');
    i18n.set('en');
    expect(modes).toEqual([false]);
  });

  it('choose outside user mode changes the language without storing it', () => {
    const { i18n } = create();
    i18n.choose('de');
    expect(i18n.get()).toBe('de');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(null);
  });

  it('addContainer sets lang now and on every change', () => {
    const { i18n } = create({ language: 'de' });
    const element = document.createElement('div');
    i18n.addContainer(element);
    expect(element.getAttribute('lang')).toBe('de');
    i18n.set('en');
    expect(element.getAttribute('lang')).toBe('en');
  });

  it('marks the host element of the canvas and takes lang back on destroy', () => {
    const host = document.createElement('div');
    const svgContainer = document.createElement('div');
    host.appendChild(svgContainer);
    const eventBus = new EventBus();
    const i18n = new I18n({ language: 'de' }, eventBus, canvas(svgContainer));
    expect(host.getAttribute('lang')).toBe('de');
    i18n.addContainer(document.createElement('div'));
    eventBus.fire('diagram.destroy');
    expect(host.hasAttribute('lang')).toBe(false);
  });
});
