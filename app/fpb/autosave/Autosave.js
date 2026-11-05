import { markText } from '../i18n/markText';
import { serializeModel } from '../export/serializeModel.js';
import { createBackupStore } from './BackupStore.js';
import { createTabPresence } from './TabPresence.js';

const DEFAULTS = {
  enabled: false,
  storageKey: 'fpbjs.autosave',
  delay: 1000
};

// Backups of closed tabs kept at most; older ones are dropped
const MAX_BACKUPS = 10;

// URL parameter that makes a new tab restore a backup (see openInNewTab)
const RESTORE_PARAM = 'fpbRestore';

/**
 * Keeps unsaved work in the browser and warns before the page is left with
 * changes that are in no file yet.
 *
 * Off unless the host turns it on (`autosave: true` or `autosave: { ... }` in
 * the modeler options). The web app does, embeddings such as the AML editor
 * plugin do not: they store the model themselves.
 *
 * One backup per tab. Every page load is a new tab (TabPresence); at start a
 * tab offers the backups of tabs that are gone (closed, reloaded, crashed),
 * never those of tabs still open. Nothing is loaded without the user's choice.
 *
 * Only unsaved work is kept: once the model is in a file again (imported,
 * downloaded, back to that state by undo), the tab's backup is removed.
 * "Unsaved" is compared on the serialized model, so switching layers does not
 * count as a change.
 *
 * Backups live in IndexedDB (BackupStore), which answers asynchronously. So
 * that the last changes survive closing the tab, the page writes a rescue
 * copy to localStorage when it goes away; the next start moves it over.
 *
 * Events: `autosave.changed` ({ pending, dirty }) when the offered backups or
 * the unsaved state change, `autosave.failed` ({ error }) when the browser
 * refuses to store.
 */
export default function Autosave(eventBus, fpbjs, config, injector) {
  this._eventBus = eventBus;
  this._fpbjs = fpbjs;
  // an AML file kept for the AML export goes into the backup too (feature 028)
  this._amlSupport = injector ? injector.get('amlSupport', false) : null;
  this._config = normalizeConfig(config);

  this._pending = [];
  this._dirty = false;
  this._baseline = serializeModel([], { indent: 0 });
  this._latest = null;
  this._written = null;
  this._restoring = null;
  this._restoringEntry = null;
  this._timer = null;

  if (!this._config.enabled || !localStorageAvailable()) {
    this._config.enabled = false;
    this._ready = Promise.resolve();
    return;
  }

  const key = this._config.storageKey;
  this._store = this._config.store || createBackupStore(key);
  this._presence = this._config.presence || createTabPresence(key);
  this._id = this._presence.id;
  this._rescuePrefix = key + '.rescue.';

  // The first version kept a single backup under the plain key
  removeLocal(key);

  const self = this;

  eventBus.on('commandStack.changed', function () {
    self._schedule();
  });

  // The importer refuses invalid content right away and keeps the model it
  // had. A backup that fails to load is offered again, and the next import
  // is an ordinary one.
  eventBus.on('import.error', function () {
    if (self._restoring) {
      const entry = self._restoringEntry;
      self._restoring = null;
      self._restoringEntry = null;
      if (entry) {
        self._pending = self._pending.concat(entry)
          .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
        self._changed();
      }
    }
  });

  eventBus.on('import.done', function () {
    if (self._restoring) {
      // The restored model is now this tab's; it stays unsaved
      const restored = self._restoring;
      self._restoring = null;
      self._restoringEntry = null;
      self._enqueue(() => self._store.remove(restored));
    } else {
      self._baseline = self._serialize();
    }
    self.flush();
  });

  // a save of fpbFiles says what went into the file: changes made while it
  // was written stay unsaved (016g A1)
  eventBus.on('model.downloaded', function (event) {
    self._baseline = event && event.baseline ? event.baseline : self._serialize();
    self.flush();
  });

  eventBus.on('model.new', function () {
    self._clearTimer();
    self._baseline = self._serialize();
    self.flush();
  });

  if (typeof window !== 'undefined') {
    this._onBeforeUnload = function (event) {
      self._leaving();
      if (self._dirty) {
        event.preventDefault();
        // Older browsers show the dialog only with a returnValue
        event.returnValue = '';
      }
    };
    this._onPageHide = function () {
      self._leaving();
    };
    window.addEventListener('beforeunload', this._onBeforeUnload);
    window.addEventListener('pagehide', this._onPageHide);

    eventBus.on('diagram.destroy', function () {
      window.removeEventListener('beforeunload', self._onBeforeUnload);
      window.removeEventListener('pagehide', self._onPageHide);
      self._clearTimer();
      self._presence.stop();
    });
  }

  this._ready = this._init();
  this._queue = this._ready;
}

Autosave.$inject = ['eventBus', 'fpbjs', 'config.autosave', 'injector'];

Autosave.prototype.isEnabled = function () {
  return this._config.enabled;
};

/** Resolves when the backups of other tabs are known */
Autosave.prototype.ready = function () {
  return this._ready;
};

/** True if the model has changes that are in no file */
Autosave.prototype.isDirty = function () {
  return this._dirty;
};

/**
 * Backups of tabs that are gone, newest first.
 *
 * @return {Array<{ id: string, savedAt: string, title: string, model: Array }>}
 */
Autosave.prototype.getPending = function () {
  return this._pending;
};

/**
 * Load a backup into this tab. If another tab took it in the meantime, it
 * only leaves the list, so no model ends up open twice.
 *
 * @return {Promise<boolean>} whether the backup was loaded
 */
Autosave.prototype.restore = function (id) {
  const entry = this._take(id);
  if (!entry) {
    return Promise.resolve(false);
  }

  return this._store.get(id).then((record) => {
    if (!record) {
      return false;
    }
    this._restoring = id;
    this._restoringEntry = entry;
    this._eventBus.fire('FPBJS.import', { data: record.model, amlSource: record.aml || null });
    // cleared by import.error if the importer refused it
    return this._restoring === id;
  }).catch((error) => {
    this._failed(error);
    return false;
  });
};

/**
 * Load a backup into a new tab, so the unsaved model of this tab stays
 * untouched. The new tab removes the backup once it has it.
 */
Autosave.prototype.openInNewTab = function (id) {
  const record = this._take(id);
  if (!record) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set(RESTORE_PARAM, id);
  window.open(url.toString(), '_blank');
};

/** Delete a backup without loading it */
Autosave.prototype.discard = function (id) {
  if (!this._take(id)) {
    return;
  }

  this._enqueue(() => this._store.remove(id));
};

/**
 * Write this tab's backup now instead of after the delay.
 *
 * @return {Promise} resolves when the backup is stored
 */
Autosave.prototype.flush = function () {
  this._clearTimer();

  if (!this._config.enabled) {
    return Promise.resolve();
  }

  const content = this._serialize();
  this._setDirty(content !== this._baseline);
  this._latest = {
    content,
    keep: this._dirty && hasContent(this._fpbjs),
    title: titleOf(this._fpbjs)
  };

  return this._enqueue(() => this._write());
};

Autosave.prototype._init = function () {
  let alive;
  return this._presence.start()
    .then(() => this._presence.aliveIds())
    .then((ids) => {
      alive = ids;
      return this._moveRescueCopies(alive);
    })
    .then(() => this._store.list())
    .then((records) => {
      const orphans = records
        .filter((record) => record.id !== this._id && !alive.has(record.id) &&
          Array.isArray(record.model) && record.model.length)
        .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));

      this._pending = orphans.slice(0, MAX_BACKUPS);
      const dropped = orphans.slice(MAX_BACKUPS);
      this._changed();

      return Promise.all(dropped.map((record) => this._store.remove(record.id)));
    })
    .then(() => this._restoreRequested())
    .catch((error) => this._failed(error));
};

/** A tab opened by openInNewTab restores the backup it was opened for */
Autosave.prototype._restoreRequested = function () {
  let url;
  try {
    url = new URL(window.location.href);
  } catch (error) {
    return;
  }

  const id = url.searchParams.get(RESTORE_PARAM);
  if (!id) {
    return;
  }

  url.searchParams.delete(RESTORE_PARAM);
  window.history.replaceState(window.history.state, '', url.toString());

  this.restore(id);
};

Autosave.prototype._take = function (id) {
  const record = this._pending.find((entry) => entry.id === id);
  if (!record) {
    return null;
  }

  this._pending = this._pending.filter((entry) => entry !== record);
  this._changed();
  return record;
};

Autosave.prototype._write = function () {
  const latest = this._latest;
  if (!latest) {
    return Promise.resolve();
  }

  if (!latest.keep) {
    if (this._written === null) {
      return Promise.resolve();
    }
    return this._store.remove(this._id).then(() => {
      this._written = null;
      removeLocal(this._rescuePrefix + this._id);
    });
  }

  if (latest.content === this._written) {
    return Promise.resolve();
  }

  return this._store.put(this._record(latest)).then(() => {
    this._written = latest.content;
    // stored for real: a rescue copy from a cancelled leave is outdated now
    removeLocal(this._rescuePrefix + this._id);
  });
};

Autosave.prototype._record = function (latest, withAml = true) {
  const record = {
    id: this._id,
    savedAt: new Date().toISOString(),
    title: latest.title,
    model: JSON.parse(latest.content)
  };
  const aml = withAml && this._amlSupport ? this._amlSupport.getSource() : null;
  if (aml) {
    record.aml = aml;
  }
  return record;
};

/**
 * The page goes away: IndexedDB may not finish in time, so an unsaved state
 * that is not stored yet goes to localStorage synchronously.
 */
Autosave.prototype._leaving = function () {
  this._clearTimer();
  const content = this._serialize();
  this._setDirty(content !== this._baseline);

  if (!this._dirty || !hasContent(this._fpbjs) || content === this._written) {
    return;
  }

  const latest = { content, title: titleOf(this._fpbjs) };
  try {
    window.localStorage.setItem(this._rescuePrefix + this._id, JSON.stringify(this._record(latest)));
  } catch (error) {
    // a large AML file may not fit into localStorage: the model at least
    try {
      window.localStorage.setItem(this._rescuePrefix + this._id, JSON.stringify(this._record(latest, false)));
    } catch (again) {
      // nothing more can be done while the page closes
    }
  }
};

/**
 * Rescue copies of tabs that closed before their backup was stored. Copies
 * of tabs still open are left alone: the user may have cancelled leaving,
 * and that tab keeps storing on its own.
 */
Autosave.prototype._moveRescueCopies = function (alive) {
  const copies = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.indexOf(this._rescuePrefix) === 0 && !alive.has(key.slice(this._rescuePrefix.length))) {
        copies.push(key);
      }
    }
  } catch (error) {
    return Promise.resolve();
  }

  return copies.reduce((chain, key) => chain.then(() => {
    let record = null;
    try {
      record = JSON.parse(window.localStorage.getItem(key));
    } catch (error) {
      record = null;
    }
    if (!record || !record.id || !Array.isArray(record.model)) {
      removeLocal(key);
      return null;
    }
    return this._store.get(record.id).then((stored) => {
      if (!stored || String(stored.savedAt) < String(record.savedAt)) {
        return this._store.put(record);
      }
      return null;
    }).then(() => removeLocal(key));
  }), Promise.resolve());
};

Autosave.prototype._enqueue = function (work) {
  this._queue = this._queue
    .then(work)
    .catch((error) => this._failed(error));
  return this._queue;
};

Autosave.prototype._failed = function (error) {
  // Quota exceeded or storage blocked: the model itself is not affected
  console.warn('FPB.js autosave: the browser refused to store the backup', error);
  this._eventBus.fire('autosave.failed', { error });
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

/** Name for the list of backups: the system limit of the top layer */
/** The title of a backup without a name; stored in English, shown translated */
export const UNTITLED = markText('Untitled model');

function titleOf(fpbjs) {
  try {
    // entries are { process, elementDataInformation, ... }; the process is
    // the data object, the top layer is the one no operator decomposes
    const top = (fpbjs.getProcesses() || [])
      .find((entry) => entry.process && !entry.process.isDecomposedProcessOperator);
    const limit = top && (top.elementDataInformation || [])
      .find((element) => element && element.$type === 'fpb:SystemLimit');
    return (limit && limit.name) || UNTITLED;
  } catch (error) {
    return UNTITLED;
  }
}

function removeLocal(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    // storage blocked
  }
}

function localStorageAvailable() {
  try {
    const key = '__fpbjs_autosave_test__';
    window.localStorage.setItem(key, key);
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}
