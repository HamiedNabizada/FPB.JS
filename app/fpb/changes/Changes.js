import { serializeModel } from '../export/serializeModel';

/**
 * What changed and what is in no file (032a V4, V5).
 *
 * The content counts, as the browser backup compares it: a layer switch or an
 * undo history cleared at a layer change is no change, an edit outside the
 * command stack (the removal of a decomposition after its question) is one.
 * The comparison runs once per task after the commands of that task.
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

  const self = this;

  eventBus.on('commandStack.changed', function () {
    self._schedule();
  });

  // dialogs change the model outside of any command
  eventBus.on('confirmation.confirmed', 200, function () {
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
    }
  });

  eventBus.on('import.done', function (event) {
    const run = event && event.run;
    const content = self._serialize();
    self._importing = false;
    self._last = content;
    self._baseline = self._restored.has(run) ? null : content;
    self._restored.delete(run);
    self._setDirty(self._isDirty(content));
  });

  eventBus.on('model.new', function () {
    const content = self._serialize();
    self._importing = false;
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
 * backup and the question before opening another file too.
 */
Changes.prototype.markSaved = function () {
  this._check();
  this._eventBus.fire('model.downloaded', { format: null, fileName: null, baseline: this._serialize() });
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
  if (this._importing) {
    return;
  }
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
