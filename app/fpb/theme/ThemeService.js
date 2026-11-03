const STORAGE_KEY = 'fpbjs.theme';
const THEMES = ['light', 'dark'];

const isTheme = (value) => THEMES.indexOf(value) !== -1;
// marks the parts of FPB.js; the Bootstrap and bpmn-io mappings of
// theme/tokens.css apply only there, so a host page keeps its own look
const UI_CLASS = 'fpb-ui';

function stored() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch (error) {
    return null;
  }
}

function store(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    // only a convenience
  }
}

const systemQuery = () => (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
const systemTheme = () => {
  const query = systemQuery();
  return query && query.matches ? 'dark' : 'light';
};

/**
 * Light or dark (016b V9, 016c T2, T5, T5a, 030 R14), as `data-theme` that
 * the design values (theme/tokens.css) follow.
 *
 * Who decides:
 * - the host, with the option `theme: 'light' | 'dark'` or `set()` (the
 *   facade's setTheme): the attribute goes on the containers of the modeler,
 *   the host's page keeps its own look, nothing is stored;
 * - the host page, by setting `data-theme` on <html> before FPB.js starts (the
 *   AML editor plugin): FPB.js follows the attribute, also when it changes;
 * - otherwise the user: a choice with the toggle (`choose()`) is stored under
 *   fpbjs.theme; without one, `theme: 'system'` follows the system setting,
 *   and no option means light, as the library always started. The attribute
 *   goes on the containers; only a page that is FPB.js's own (the web app,
 *   `themeScope: 'page'`) gets it on the document.
 *
 * In the first two cases the toggle is hidden (isHostControlled). The old key
 * fpb-theme is never read: app.js filled it with "light" on every first
 * start, so it does not tell a choice from a default. On destroy the service
 * takes back what it set, so a modeler created later starts afresh.
 */
export default function ThemeService(config, eventBus, canvas) {
  const option = config && config.theme;
  const root = document.documentElement;
  const self = this;

  this._eventBus = eventBus;
  this._containers = [];
  this._canvas = canvas;

  // the host's element; the canvas is attached to it only after the start
  const hostElement = (config && config.container) ||
    (canvas.getContainer() && canvas.getContainer().parentNode);
  if (hostElement && hostElement.setAttribute) {
    this._containers.push(hostElement);
    hostElement.classList.add(UI_CLASS);
  }

  if (isTheme(option)) {
    this._mode = 'host';
    this._scope = 'containers';
    this._theme = option;
  } else if (!option && isTheme(root.getAttribute('data-theme'))) {
    this._mode = 'host';
    this._scope = 'page-host';
    this._theme = root.getAttribute('data-theme');
    this._observer = new MutationObserver(function () {
      const next = root.getAttribute('data-theme');
      if (isTheme(next) && next !== self._theme) {
        self._theme = next;
        self._changed();
      }
    });
    this._observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  } else {
    this._mode = option === 'system' ? 'system' : 'default';
    this._scope = config && config.themeScope === 'page' ? 'page' : 'containers';
    this._theme = stored() || (this._mode === 'system' ? systemTheme() : 'light');
    if (this._mode === 'system') {
      this._followSystem();
    }
  }

  if (this._scope === 'page') {
    root.classList.add(UI_CLASS);
  }
  this._apply();

  eventBus.on('diagram.destroy', function () {
    if (self._observer) {
      self._observer.disconnect();
    }
    if (self._query) {
      self._query.removeEventListener('change', self._onSystem);
    }
    self._watchFills(false);
    // take back what this modeler set; a host page keeps its own attribute
    if (self._scope === 'page') {
      root.removeAttribute('data-theme');
      root.classList.remove(UI_CLASS);
    }
    self._containers.forEach(function (element) {
      if (self._scope === 'containers') {
        element.removeAttribute('data-theme');
      }
      element.classList.remove(UI_CLASS);
    });
  });
}

ThemeService.$inject = ['config', 'eventBus', 'canvas'];

/** The theme in effect: 'light' or 'dark' */
ThemeService.prototype.get = function () {
  return this._theme;
};

/** 'host' (option, setTheme or the page), 'system' or 'default' */
ThemeService.prototype.mode = function () {
  return this._mode;
};

ThemeService.prototype.isHostControlled = function () {
  return this._mode === 'host';
};

/**
 * The attribute to put on elements that leave the containers, such as the
 * dialogs under <body>; empty when the page carries it anyway.
 */
ThemeService.prototype.attributes = function () {
  return this._scope === 'containers' ? { 'data-theme': this._theme } : {};
};

/** Another container of FPB.js (the panels of a library host) */
ThemeService.prototype.addContainer = function (element) {
  if (element && this._containers.indexOf(element) === -1) {
    this._containers.push(element);
    element.classList.add(UI_CLASS);
    this._apply();
  }
};

/**
 * The host sets the theme ('light' or 'dark'); from now on the host decides.
 * 'system' hands it back to the system setting.
 */
ThemeService.prototype.set = function (theme) {
  if (theme === 'system') {
    this._mode = 'system';
    // the page of a host keeps its attribute; FPB.js follows the system on
    // its containers from now on
    if (this._scope === 'page-host') {
      this._toContainers();
    }
    this._followSystem();
    this._setTheme(stored() || systemTheme());
    return;
  }
  if (!isTheme(theme)) {
    return;
  }
  this._mode = 'host';
  this._toContainers();
  this._setTheme(theme);
};

/** From the page to the containers of the modeler */
ThemeService.prototype._toContainers = function () {
  if (this._scope === 'containers') {
    return;
  }
  // the page attribute was FPB.js's own; a host page keeps its attribute
  if (this._scope === 'page') {
    document.documentElement.removeAttribute('data-theme');
  }
  if (this._observer) {
    this._observer.disconnect();
    this._observer = null;
  }
  this._scope = 'containers';
  // applied anew, even if the theme stays the same
  this._theme = null;
};

/** Follow changes of the system setting while nothing is chosen */
ThemeService.prototype._followSystem = function () {
  const query = systemQuery();
  if (this._query || !query) {
    return;
  }
  const self = this;
  this._onSystem = function () {
    if (!stored() && self._mode === 'system') {
      self._setTheme(systemTheme());
    }
  };
  query.addEventListener('change', this._onSystem);
  this._query = query;
};

/** The user chose with the toggle: kept for the next start */
ThemeService.prototype.choose = function (theme) {
  if (!isTheme(theme) || this.isHostControlled()) {
    return;
  }
  store(theme);
  this._setTheme(theme);
};

ThemeService.prototype._setTheme = function (theme) {
  if (theme === this._theme) {
    this._changed();
    return;
  }
  this._theme = theme;
  this._apply();
  this._changed();
};

ThemeService.prototype._changed = function () {
  this._watchFills(this._theme === 'dark');
  this._eventBus.fire('theme.changed', { theme: this._theme, mode: this._mode });
};

ThemeService.prototype._apply = function () {
  const theme = this._theme;
  if (this._scope === 'page') {
    document.documentElement.setAttribute('data-theme', theme);
  } else if (this._scope === 'containers') {
    this._containers.forEach(function (element) {
      element.setAttribute('data-theme', theme);
    });
  }
  this._watchFills(theme === 'dark');
};

/**
 * In the dark, diagram-js writes white fills into the style of shapes while
 * dragging; they flashed white (moved here from ThemeToggle).
 */
ThemeService.prototype._watchFills = function (on) {
  if (!on) {
    if (this._fills) {
      this._fills.disconnect();
      this._fills = null;
    }
    return;
  }
  if (this._fills) {
    return;
  }
  const svgContainer = this._canvas.getContainer();
  if (!svgContainer) {
    return;
  }
  this._fills = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      const element = mutation.target;
      const style = element.getAttribute('style');
      if (style && (style.includes('fill: white') || style.includes('fill:#ffffff') ||
          style.includes('background: white') || style.includes('background:#ffffff'))) {
        element.style.setProperty('fill', '#2d2d2d', 'important');
        element.style.setProperty('background', '#2d2d2d', 'important');
      }
    });
  });
  this._fills.observe(svgContainer, { attributes: true, attributeFilter: ['style'], subtree: true });
};
