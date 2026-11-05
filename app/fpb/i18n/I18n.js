import de from './de';
import { fill, normalizeLanguage } from './language';

const STORAGE_KEY = 'fpbjs.language';
const CATALOGS = { de };

function stored() {
  try {
    return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    return null;
  }
}

function store(language) {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch (error) {
    // only a convenience
  }
}

/** The language a value names; English and a warning for anything else */
function resolve(value) {
  const language = normalizeLanguage(value);
  if (!language) {
    console.warn('FPB.js: language "' + value + '" is not available, using English.');
    return 'en';
  }
  return language;
}

/**
 * The language of FPB.js (016h V1, V3, V4, V9, T1, T3, T7, T8, T14), as the
 * theme decides light and dark (ThemeService):
 * - no option: English, no button;
 * - the host, with `language: 'en' | 'de'` (also 'de-DE' and the like) or
 *   `set()` (the facade's setLanguage): nothing is stored, no button;
 * - the user, with `language: 'user'` (the web app): the choice of the button
 *   (`choose()`) is stored under fpbjs.language and comes back on the next
 *   start; without one English. A later `set()` of the host ends it.
 *
 * Switching fires `i18n.changed` with { language }, the event the palette of
 * diagram-js already redraws on; every part of the interface does the same.
 * Texts are keyed by their English; a text without a German entry stays
 * English and is listed by getMissing().
 */
export default function I18n(config, eventBus, canvas) {
  const option = config && config.language;
  const self = this;

  this._eventBus = eventBus;
  this._containers = [];
  this._missing = [];

  if (option === 'user') {
    this._mode = 'user';
    this._language = stored() || 'en';
  } else if (option === undefined || option === null) {
    this._mode = 'default';
    this._language = 'en';
  } else {
    this._mode = 'host';
    this._language = resolve(option);
  }

  // the host's element; the canvas is attached to it only after the start
  const container = canvas && canvas.getContainer();
  this.addContainer((config && config.container) || (container && container.parentNode));

  eventBus.on('diagram.destroy', function () {
    self._containers.forEach(function (element) {
      element.removeAttribute('lang');
    });
    self._containers = [];
  });
}

I18n.$inject = ['config', 'eventBus', 'canvas'];

/** The language in effect: 'en' or 'de' */
I18n.prototype.get = function () {
  return this._language;
};

/** Whether the user decides with the button (language: 'user') */
I18n.prototype.isUserChoice = function () {
  return this._mode === 'user';
};

/** The host sets the language; from now on the host decides */
I18n.prototype.set = function (language) {
  const wasUser = this._mode === 'user';
  this._mode = 'host';
  const result = this._switch(resolve(language));
  // the button goes also when the language stays (fires after i18n.changed)
  if (wasUser) {
    this._eventBus.fire('i18n.modeChanged', { userChoice: false });
  }
  return result;
};

/** The user chooses with the button; kept for the next start in user mode */
I18n.prototype.choose = function (language) {
  const next = resolve(language);
  if (this._mode === 'user') {
    store(next);
  }
  return this._switch(next);
};

I18n.prototype._switch = function (language) {
  if (language !== this._language) {
    this._language = language;
    this._apply();
    this._eventBus.fire('i18n.changed', { language: language });
  }
  return this._language;
};

/** The text in the language in effect, its {name} placeholders filled */
I18n.prototype.translate = function (template, replacements) {
  if (typeof template !== 'string') {
    return template;
  }
  const catalog = CATALOGS[this._language];
  let text = template;
  if (catalog) {
    if (Object.prototype.hasOwnProperty.call(catalog, template)) {
      text = catalog[template];
    } else if (this._missing.indexOf(template) === -1) {
      this._missing.push(template);
    }
  }
  return fill(text, replacements);
};

/** The keys asked for in a language other than English that have no entry */
I18n.prototype.getMissing = function () {
  return this._missing.slice();
};

/** An element of FPB.js whose lang follows the language (016h T8) */
I18n.prototype.addContainer = function (element) {
  if (element && element.setAttribute && this._containers.indexOf(element) === -1) {
    this._containers.push(element);
    element.setAttribute('lang', this._language);
  }
};

I18n.prototype._apply = function () {
  const language = this._language;
  this._containers.forEach(function (element) {
    element.setAttribute('lang', language);
  });
};
