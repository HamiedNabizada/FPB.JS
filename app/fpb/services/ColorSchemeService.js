import { SCHEMES, DEFAULT_SCHEME, getScheme, setScheme } from '../core/colorScheme';

const STORAGE_KEY = 'fpb-color-scheme';
const DOCUMENT_ATTRIBUTE = 'data-colors';

/**
 * Holds the colour scheme of the elements and redraws when it changes.
 *
 * The scheme is a display setting: it is remembered per browser (localStorage,
 * like the theme) and never travels with the model. Besides the canvas it sets
 * `data-colors` on the document, which the icons of the palette and of the
 * menus follow, since those are style sheets and not drawn by the renderer.
 */
export default function ColorSchemeService(eventBus, elementRegistry) {
  this._eventBus = eventBus;
  this._elementRegistry = elementRegistry;

  const self = this;

  eventBus.on('diagram.init', function () {
    self.set(read(), { silent: true });
  });
}

ColorSchemeService.$inject = ['eventBus', 'elementRegistry'];

/** Name of the active scheme */
ColorSchemeService.prototype.get = function () {
  return getScheme();
};

/** Available schemes, for a user interface that offers them */
ColorSchemeService.prototype.getSchemes = function () {
  return Object.keys(SCHEMES);
};

/**
 * Switch the scheme, redraw every element and remember the choice.
 * `options.silent` skips storing, used while reading the stored value.
 */
ColorSchemeService.prototype.set = function (name, options) {
  const changed = setScheme(name);
  const scheme = getScheme();

  markDocument(scheme);

  if (!(options && options.silent)) {
    store(scheme);
  }

  if (changed) {
    this._redraw();
    this._eventBus.fire('colorScheme.changed', { scheme: scheme });
  }
  return scheme;
};

ColorSchemeService.prototype._redraw = function () {
  const elements = this._elementRegistry.filter(function (element) {
    return !!element.parent;
  });

  if (elements.length) {
    // change-support redraws every element that is announced here
    this._eventBus.fire('elements.changed', { elements: elements });
  }
};

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SCHEME;
  } catch (error) {
    // private mode, blocked storage: the standard scheme is fine
    return DEFAULT_SCHEME;
  }
}

function store(scheme) {
  try {
    localStorage.setItem(STORAGE_KEY, scheme);
  } catch (error) {
    // nothing to do, the choice then lasts for this session only
  }
}

function markDocument(scheme) {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute(DOCUMENT_ATTRIBUTE, scheme);
  }
}
