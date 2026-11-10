import { serializeModel } from '../export/serializeModel';

/**
 * What changed and what is in no file (032a V4, V5).
 *
 * The content counts, as the browser backup compares it: a layer switch or an
 * undo history cleared at a layer change is no change, an edit outside the
 * command stack (the removal of a decomposition after its question) is one.
 * The comparison runs once per task after the commands of that task, and
 * only after a command or a confirmed dialog announced a change (2.1.1): a
 * change written into the model objects without either is not seen.
 *
 * Events: `model.changed` after an edit that changed the model (not for an
 * import or New model), `model.dirtyChanged` ({ dirty }) when the unsaved
 * state flips. Saved means: as opened, as written by fpbFiles, or as the host
 * said with markSaved (all of them fire `model.downloaded` with the content).
 */
export default function Changes(eventBus, fpbjs, injector) {
  this._eventBus = eventBus;
  this._fpbjs = fpbjs;
  this._injector = injector;

  // the content as announced last and as saved last; null: in no file. At
  // the start there is no model yet.
  this._last = serializeModel([], { indent: 0 });
  this._baseline = this._last;
  this._dirty = false;
  this._timer = null;
  // between the start of an import and its end the canvas is rebuilt: no edit
  this._importing = false;
  // runs of imports that restore a backup: their model is in no file
  this._restored = new Set();
  // something may have changed since the last comparison (2.1.1: isDirty()
  // serialized the whole model on every call)
  this._stale = true;
  // the outermost command of the running execution, and how deep it is
  this._topCommand = null;
  this._depth = 0;
  // markSaved is announcing model.downloaded (a listener may save again)
  this._announcingSave = false;

  const self = this;

  // every command, nested ones too; the first of an execution is the outermost
  eventBus.on('commandStack.preExecute', function (event) {
    if (self._depth === 0) {
      self._topCommand = event && event.command;
    }
    self._depth++;
  });

  eventBus.on('commandStack.changed', function (event) {
    // a cleared undo history changes no content; LayerUndoBoundary clears it
    // from within the changed event of a layer switch, so the outermost
    // command is still needed after it
    const trigger = event && event.trigger;
    if (trigger === 'clear') {
      return;
    }
    const top = self._topCommand;
    self._topCommand = null;
    self._depth = 0;
    // a layer switch changes no content either (2.1.1: each one serialized
    // the model)
    if (trigger === 'execute' && top === 'process.switch') {
      return;
    }
    self._stale = true;
    self._schedule();
  });

  // dialogs change the model outside of any command
  eventBus.on('confirmation.confirmed', 200, function () {
    self._stale = true;
    self._schedule();
  });

  // before the importer: whatever it rebuilds is no edit
  eventBus.on('FPBJS.import', 3000, function () {
    self._importing = true;
    self._clearTimer();
  });

  // after the importer: the run it gave this import
  eventBus.on('FPBJS.import', 1, function (event) {
    const importer = self._importer();
    if (event && event.restored && importer) {
      self._restored.add(importer.getLastRun());
    }
  });

  eventBus.on('import.error', function () {
    // an older import still waiting for the panels ends with its import.done
    const importer = self._importer();
    if (!importer || !importer.isBusy()) {
      self._importing = false;
      // an edit in the same task as the refused import was put off while the
      // import ran: compare now (2.1.1, it waited for the next edit)
      self._stale = true;
      self._schedule();
    }
  });

  eventBus.on('import.done', function (event) {
    const run = event && event.run;
    const content = self._serialize();
    self._importing = false;
    self._stale = false;
    self._last = content;
    self._baseline = self._restored.has(run) ? null : content;
    self._restored.delete(run);
    self._setDirty(self._isDirty(content));
  });

  eventBus.on('model.new', function () {
    const content = self._serialize();
    self._importing = false;
    self._stale = false;
    self._clearTimer();
    self._last = content;
    self._baseline = content;
    self._setDirty(false);
  });

  eventBus.on('model.downloaded', function (event) {
    const content = self._serialize();
    self._baseline = event && event.baseline ? event.baseline : content;
    self._setDirty(self._isDirty(content));
  });
}

Changes.$inject = ['eventBus', 'fpbjs', 'injector'];

/** True if the model has changes that are in no file */
Changes.prototype.isDirty = function () {
  this._check();
  return this._dirty;
};

/**
 * The host saved the model: from now on it counts as saved, for the browser
 * backup and the question before opening another file too. `saved` is what
 * the host wrote, as toJSON() gave it: edits made while it was written stay
 * unsaved (as with fpbFiles, 016g A1). Without it the model as it is now
 * counts as saved.
 *
 * @param {Array} [saved] the data of toJSON() the host saved
 */
Changes.prototype.markSaved = function (saved) {
  this._check();
  // toJSON() is JSON.parse of the serialized model: stringified it is that text again
  const baseline = saved === undefined || saved === null ? this._serialize() : JSON.stringify(saved);
  // a listener on model.downloaded that saves again: take its baseline, do
  // not announce again (2.1.1: it called itself until the stack overflowed)
  if (this._announcingSave) {
    this._baseline = baseline;
    this._setDirty(this._isDirty(this._serialize()));
    return;
  }
  this._announcingSave = true;
  try {
    this._eventBus.fire('model.downloaded', { format: null, fileName: null, baseline });
  } finally {
    this._announcingSave = false;
  }
};

Changes.prototype._importer = function () {
  return this._injector ? this._injector.get('jsonImporter', false) : null;
};

Changes.prototype._schedule = function () {
  if (this._importing || this._timer) {
    return;
  }
  const self = this;
  this._timer = setTimeout(function () {
    self._timer = null;
    self._check();
  }, 0);
};

Changes.prototype._clearTimer = function () {
  clearTimeout(this._timer);
  this._timer = null;
};

/** Compare now: model.changed when the content differs from the one announced */
Changes.prototype._check = function () {
  this._clearTimer();
  if (this._importing || !this._stale) {
    return;
  }
  this._stale = false;
  const content = this._serialize();
  if (content !== this._last) {
    this._last = content;
    this._eventBus.fire('model.changed', {});
  }
  this._setDirty(this._isDirty(content));
};

Changes.prototype._isDirty = function (content) {
  if (this._baseline === null) {
    return (this._fpbjs.getProcesses() || []).length > 0;
  }
  return content !== this._baseline;
};

Changes.prototype._setDirty = function (dirty) {
  if (dirty !== this._dirty) {
    this._dirty = dirty;
    this._eventBus.fire('model.dirtyChanged', { dirty });
  }
};

/** The model as the browser backup compares it: layer switches are no change */
Changes.prototype._serialize = function () {
  // positions and names are copied into the model objects on this event
  this._eventBus.fire('dataStore.updateAll', {});
  return serializeModel(this._fpbjs.getProcesses() || [], { indent: 0 });
};
