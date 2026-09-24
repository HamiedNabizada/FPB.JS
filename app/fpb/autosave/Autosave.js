import { serializeModel } from '../export/serializeModel.js';

const DEFAULTS = {
  enabled: false,
  storageKey: 'fpbjs.autosave',
  delay: 1000
};

const FORMAT_VERSION = 1;

/**
 * Keeps a backup of the model in the browser (localStorage) and warns before
 * the page is left with changes that are in no file yet.
 *
 * Off unless the host turns it on (`autosave: true` or `autosave: { ... }` in
 * the modeler options). The web app does, embeddings such as the AML editor
 * plugin do not: they store the model themselves.
 *
 * Only unsaved work is kept: once the model is in a file again (imported,
 * downloaded, back to that state by undo), the backup is removed, so a
 * reload does not offer what the user already has.
 *
 * A backup found at start is not loaded on its own. It waits in `getPending()`
 * until the user restores or discards it; until then nothing is written, so
 * the backup cannot be overwritten by accident.
 *
 * "Unsaved" means: the model differs from the last one imported, downloaded
 * or started empty. Compared on the serialized model, so switching layers or
 * an undo back to the saved state does not count as a change.
 *
 * Events: `autosave.changed` whenever the pending backup or the unsaved state
 * changes, `autosave.failed` ({ error }) when the browser refuses to store.
 */
export default function Autosave(eventBus, fpbjs, config) {
  this._eventBus = eventBus;
  this._fpbjs = fpbjs;
  this._config = normalizeConfig(config);

  this._pending = null;
  this._restoring = false;
  this._timer = null;
  this._stored = null;
  this._baseline = null;
  this._dirty = false;

  if (!this._config.enabled || !storageAvailable()) {
    this._config.enabled = false;
    return;
  }

  this._pending = this._read();
  // The modeler starts empty; its lists do not exist yet at this point
  this._baseline = serializeModel([], { indent: 0 });

  const self = this;

  eventBus.on('commandStack.changed', function () {
    self._schedule();
  });

  eventBus.on('import.done', function () {
    if (self._restoring) {
      // A restored backup is in no file yet: it stays unsaved
      self._restoring = false;
    } else {
      // Another file replaces a backup that was still waiting
      self._pending = null;
      self._baseline = self._serialize();
    }
    self.flush();
  });

  eventBus.on('model.downloaded', function () {
    self._baseline = self._serialize();
    self.flush();
  });

  eventBus.on('model.new', function () {
    self._pending = null;
    self._clearTimer();
    self._remove();
    self._baseline = self._serialize();
    self._setDirty(false);
  });

  if (typeof window !== 'undefined') {
    this._onBeforeUnload = function (event) {
      self.flush();
      if (self._dirty) {
        event.preventDefault();
        // Older browsers show the dialog only with a returnValue
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', this._onBeforeUnload);

    eventBus.on('diagram.destroy', function () {
      window.removeEventListener('beforeunload', self._onBeforeUnload);
      self._clearTimer();
    });
  }
}

Autosave.$inject = ['eventBus', 'fpbjs', 'config.autosave'];

Autosave.prototype.isEnabled = function () {
  return this._config.enabled;
};

/** True if the model has changes that are in no file */
Autosave.prototype.isDirty = function () {
  return this._dirty;
};

/**
 * The backup found at start, until restored or discarded.
 *
 * @return {{ savedAt: string, model: Array } | null}
 */
Autosave.prototype.getPending = function () {
  return this._pending;
};

/** Load the backup found at start */
Autosave.prototype.restore = function () {
  const pending = this._pending;
  if (!pending) {
    return;
  }

  this._pending = null;
  this._restoring = true;
  this._changed();
  this._eventBus.fire('FPBJS.import', { data: pending.model });
};

/** Drop the backup found at start and back up the current model instead */
Autosave.prototype.discard = function () {
  if (!this._pending) {
    return;
  }

  this._pending = null;
  this._remove();
  this._changed();
  this.flush();
};

/** Write the backup now instead of after the delay */
Autosave.prototype.flush = function () {
  this._clearTimer();

  if (!this._config.enabled) {
    return;
  }

  const serialized = this._serialize();
  this._setDirty(serialized !== this._baseline);

  // Nothing may overwrite a backup the user has not decided on
  if (this._pending) {
    return;
  }

  if (!this._dirty || !hasContent(this._fpbjs)) {
    this._remove();
    return;
  }

  if (serialized === this._stored) {
    return;
  }

  const entry = '{"version":' + FORMAT_VERSION +
    ',"savedAt":' + JSON.stringify(new Date().toISOString()) +
    ',"model":' + serialized + '}';

  try {
    window.localStorage.setItem(this._config.storageKey, entry);
    this._stored = serialized;
  } catch (error) {
    // Quota exceeded or storage blocked: the model itself is not affected
    console.warn('FPB.js autosave: the browser refused to store the backup', error);
    this._eventBus.fire('autosave.failed', { error });
  }
};

Autosave.prototype._schedule = function () {
  const self = this;

  this._clearTimer();
  this._timer = setTimeout(function () {
    self._timer = null;
    self.flush();
  }, this._config.delay);
};

Autosave.prototype._clearTimer = function () {
  if (this._timer) {
    clearTimeout(this._timer);
    this._timer = null;
  }
};

Autosave.prototype._serialize = function () {
  // Positions and names are copied into the model objects on this event
  this._eventBus.fire('dataStore.updateAll', {});
  return serializeModel(this._fpbjs.getProcesses() || [], { indent: 0 });
};

Autosave.prototype._read = function () {
  let raw;
  try {
    raw = window.localStorage.getItem(this._config.storageKey);
  } catch (error) {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const entry = JSON.parse(raw);
    if (entry && entry.version === FORMAT_VERSION && Array.isArray(entry.model) && entry.model.length) {
      return { savedAt: entry.savedAt, model: entry.model };
    }
  } catch (error) {
    // Unreadable: treated like no backup, the next save replaces it
  }

  return null;
};

Autosave.prototype._remove = function () {
  this._stored = null;
  try {
    window.localStorage.removeItem(this._config.storageKey);
  } catch (error) {
    // nothing to remove if storage is blocked
  }
};

Autosave.prototype._setDirty = function (dirty) {
  if (dirty !== this._dirty) {
    this._dirty = dirty;
    this._changed();
  }
};

Autosave.prototype._changed = function () {
  this._eventBus.fire('autosave.changed', {
    pending: this._pending,
    dirty: this._dirty
  });
};

function normalizeConfig(config) {
  if (config === true) {
    return Object.assign({}, DEFAULTS, { enabled: true });
  }

  if (config && typeof config === 'object') {
    return Object.assign({}, DEFAULTS, { enabled: true }, config);
  }

  return Object.assign({}, DEFAULTS);
}

function hasContent(fpbjs) {
  const processes = fpbjs.getProcesses();
  return Boolean(processes && processes.length);
}

function storageAvailable() {
  try {
    const key = '__fpbjs_autosave_test__';
    window.localStorage.setItem(key, key);
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}
