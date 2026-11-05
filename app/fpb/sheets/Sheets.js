// the narrow touch screens of 016f V8: phones and tablets
const MEDIA = '(max-width: 900px) and (pointer: coarse)';
// a sheet at its tallest leaves this much of the page above it
const TOP_GAP = 56;
// every sheet starts at half the page; let go below a quarter, it closes
const START = 0.5;
const CLOSE_BELOW = 0.25;
const STEP = 0.1;
// a press on the head that moves less is a tap, not a drag (016g G4)
const DRAG_FROM = 3;

const CLOSE_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/**
 * One sheet from the bottom at a time on narrow touch screens (016f E2,
 * V8 to V11, T7). The host gives a container below the canvas
 * (`sheets: { container, media }`); the sheet takes its height from the
 * canvas instead of lying on it. The parts show themselves in the body of
 * the open sheet: they listen to `sheets.changed` ({ active, current, body }).
 * Without a container, or while the media query does not match, there are
 * no sheets and `open` does nothing. With the default query the screen must
 * also be upright: a phone held sideways is too low for a sheet and has room
 * for the side panel (final review of E2). That is the screen, not the page:
 * an on-screen keyboard that makes the page lower than wide must not close
 * the sheet one is typing in.
 */
export default function Sheets(eventBus, config, translate, injector) {
  const options = (config && config.sheets) || {};
  const self = this;

  this._eventBus = eventBus;
  this._translate = translate;
  this._container = options.container || null;
  this._current = null;
  this._frame = null;
  this._height = 0;
  this._opener = null;
  this._injector = injector;
  this._titleKey = '';

  // an open sheet speaks the new language at once (016h V3)
  eventBus.on('i18n.changed', function () {
    self._label();
  });

  // Escape on the button that opened the sheet closes it (016g G1)
  this._onOpenerKey = function (event) {
    if (event.key === 'Escape' && !event.defaultPrevented && self._current &&
        self._opener && document.activeElement === self._opener) {
      self.close();
    }
  };

  this._query = this._container && typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(options.media || MEDIA)
    : null;
  const upright = options.media ? function () { return true; } : uprightScreen;
  this._applies = function () {
    return !!(self._query && self._query.matches && upright());
  };
  this._active = this._applies();

  if (!this._query) {
    return;
  }

  const onMedia = function () {
    self._setActive(self._applies());
  };
  const onResize = function () {
    self._setActive(self._applies());
    self._fit();
  };
  const orientation = window.screen && window.screen.orientation;
  listen(this._query, onMedia);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onMedia);
  if (orientation && orientation.addEventListener) {
    orientation.addEventListener('change', onMedia);
  }

  // light and dark, and Ctrl+S in a field of a sheet, as in the panels
  const theme = injector.get('fpbTheme', false);
  if (theme) {
    theme.addContainer(this._container);
  }
  // lang for screen readers (016h T8)
  const i18n = injector.get('fpbI18n', false);
  if (i18n) {
    i18n.addContainer(this._container);
  }
  const files = injector.get('fpbFiles', false);
  const unbindKeys = files ? files.bindKeys(this._container) : function () {};

  eventBus.on('diagram.destroy', function () {
    document.removeEventListener('keydown', self._onOpenerKey);
    unlisten(self._query, onMedia);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onMedia);
    if (orientation && orientation.removeEventListener) {
      orientation.removeEventListener('change', onMedia);
    }
    unbindKeys();
    self._unmount();
    self._current = null;
  });
}

Sheets.$inject = ['eventBus', 'config', 'translate', 'injector'];

/** Whether sheets are in use now: a container and a matching media query */
Sheets.prototype.isActive = function () {
  return this._active;
};

/** The name of the open sheet, or null */
Sheets.prototype.current = function () {
  return this._current;
};

/** The body of the open sheet, where its part shows itself, or null */
Sheets.prototype.body = function () {
  return this._frame ? this._frame.querySelector('.fpb-sheet-body') : null;
};

/**
 * Open the sheet `name` with `title` (an English text of the catalog, shown
 * in the language in effect, 016h); an open other sheet closes first
 */
Sheets.prototype.open = function (name, options) {
  if (!this._active) {
    return;
  }
  this._titleKey = (options && options.title) || '';
  const title = this._titleKey ? this._translate(this._titleKey) : '';
  if (this._current === name) {
    this._label();
    return;
  }
  if (this._current) {
    this.close();
  }
  this._opener = document.activeElement;
  this._current = name;
  this._height = Math.round(window.innerHeight * START);
  this._mount(name, title);
  document.addEventListener('keydown', this._onOpenerKey);
  this._fit();
  this._changed();
};

/**
 * Closes the open sheet. Was the focus in it, the keyboard goes on where it
 * was before the sheet opened; with `toCanvas` (the sheets end, the opener
 * goes with them) on the canvas (016g G2).
 */
Sheets.prototype.close = function (options) {
  if (!this._current) {
    return;
  }
  const hadFocus = this._frame && this._frame.contains(document.activeElement);
  document.removeEventListener('keydown', this._onOpenerKey);
  this._unmount();
  this._current = null;
  this._changed();
  if (hadFocus) {
    const opener = this._opener;
    const canvas = this._injector.get('canvas', false);
    if (options && options.toCanvas && canvas) {
      canvas.focus();
    } else if (opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus();
    }
  }
  this._opener = null;
};

Sheets.prototype.toggle = function (name, options) {
  if (this._current === name) {
    this.close();
  } else {
    this.open(name, options);
  }
};

Sheets.prototype._changed = function () {
  this._eventBus.fire('sheets.changed', {
    active: this._active,
    current: this._current,
    body: this.body()
  });
};

Sheets.prototype._setActive = function (active) {
  if (active === this._active) {
    return;
  }
  this._active = active;
  if (!active && this._current) {
    this.close({ toCanvas: true });
    return;
  }
  this._changed();
};

/** Title, grip and close of the open sheet in the language in effect */
Sheets.prototype._label = function () {
  if (!this._frame) {
    return;
  }
  const translate = this._translate;
  const title = this._titleKey ? translate(this._titleKey) : '';
  this._frame.setAttribute('aria-label', title);
  this._frame.querySelector('.fpb-sheet-title').textContent = title;
  this._frame.querySelector('.fpb-sheet-grip').setAttribute('aria-label', translate('Height of the sheet'));
  this._frame.querySelector('.fpb-sheet-close').setAttribute('aria-label', translate('Close'));
};

Sheets.prototype._mount = function (name, title) {
  const self = this;
  const translate = this._translate;
  const frame = this._frame = document.createElement('section');
  frame.className = 'fpb-sheet';
  frame.setAttribute('data-sheet', name);
  frame.setAttribute('aria-label', title);
  frame.innerHTML =
    '<div class="fpb-sheet-head">' +
      '<div class="fpb-sheet-grip" role="separator" aria-orientation="horizontal" tabindex="0"></div>' +
      '<h2 class="fpb-sheet-title"></h2>' +
      '<button type="button" class="fpb-sheet-close">' + CLOSE_ICON + '</button>' +
    '</div>' +
    '<div class="fpb-sheet-body"></div>';
  frame.querySelector('.fpb-sheet-title').textContent = title;
  frame.querySelector('.fpb-sheet-grip').setAttribute('aria-label', translate('Height of the sheet'));
  const close = frame.querySelector('.fpb-sheet-close');
  close.setAttribute('aria-label', translate('Close'));
  close.addEventListener('click', function () {
    self.close();
  });
  // a field that uses Escape itself (the search of the tree) keeps it
  frame.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      self.close();
    }
  });
  frame.querySelector('.fpb-sheet-grip').addEventListener('keydown', function (event) {
    const step = Math.round(window.innerHeight * STEP);
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const min = Math.round(window.innerHeight * CLOSE_BELOW);
      self._height = Math.max(min, self._height + (event.key === 'ArrowUp' ? step : -step));
      self._fit();
    }
  });
  this._grip(frame.querySelector('.fpb-sheet-head'));
  this._container.appendChild(frame);
};

Sheets.prototype._unmount = function () {
  if (this._frame) {
    this._frame.remove();
    this._frame = null;
  }
  if (this._container) {
    this._container.style.height = '';
  }
};

/** The head drags the sheet: its top follows the finger */
Sheets.prototype._grip = function (head) {
  const self = this;
  let drag = null;

  head.addEventListener('pointerdown', function (event) {
    if (event.target.closest('.fpb-sheet-close') || (event.button !== undefined && event.button > 0)) {
      return;
    }
    const top = self._frame.getBoundingClientRect().top;
    drag = { id: event.pointerId, offset: event.clientY - top, from: event.clientY, moved: false };
    try {
      head.setPointerCapture(event.pointerId);
    } catch (error) {
      // a synthetic pointer: the moves still come
    }
    event.preventDefault();
  });
  head.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.id) {
      return;
    }
    if (!drag.moved && Math.abs(event.clientY - drag.from) < DRAG_FROM) {
      return;
    }
    drag.moved = true;
    const bottom = self._container.getBoundingClientRect().bottom;
    self._height = Math.max(0, Math.round(bottom - (event.clientY - drag.offset)));
    self._fit();
  });
  const end = function (event) {
    if (!drag || event.pointerId !== drag.id) {
      return;
    }
    const moved = drag.moved;
    drag = null;
    if (moved && self._height < window.innerHeight * CLOSE_BELOW) {
      self.close();
    }
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
};

/**
 * Keep the sheet within the page: at most the page height minus the gap
 * at the top, also when the page gets lower (on-screen keyboard, turning);
 * a field with the focus in the sheet stays in view.
 */
Sheets.prototype._fit = function () {
  if (!this._frame) {
    return;
  }
  const page = window.innerHeight;
  this._height = Math.min(this._height, Math.max(0, page - TOP_GAP));
  this._container.style.height = this._height + 'px';
  const grip = this._frame.querySelector('.fpb-sheet-grip');
  grip.setAttribute('aria-valuenow', String(Math.round(this._height / page * 100)));
  const focused = document.activeElement;
  if (focused && focused !== document.body && this._frame.contains(focused) && focused.scrollIntoView) {
    focused.scrollIntoView({ block: 'nearest' });
  }
};

/**
 * Whether the screen stands upright. iOS keeps screen.width and height in
 * portrait, so the orientation API counts first; either sign of landscape
 * means landscape.
 */
function uprightScreen() {
  const screen = window.screen || {};
  const type = screen.orientation && screen.orientation.type;
  const angle = typeof window.orientation === 'number' ? window.orientation : 0;
  const landscape = (type && type.indexOf('landscape') === 0) ||
    angle % 180 !== 0 ||
    (screen.width > screen.height);
  return !landscape;
}

function listen(query, listener) {
  if (query.addEventListener) {
    query.addEventListener('change', listener);
  } else if (query.addListener) {
    query.addListener(listener);
  }
}

function unlisten(query, listener) {
  if (query.removeEventListener) {
    query.removeEventListener('change', listener);
  } else if (query.removeListener) {
    query.removeListener(listener);
  }
}
