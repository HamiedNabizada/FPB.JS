import { fitToViewport } from '../help/viewport';
import { LAYER_COMMANDS } from '../modeling/behavior/LayerUndoBoundary';

/**
 * The view of each layer (016d V3): leaving a layer keeps its section and
 * zoom, returning restores them, the first visit fits the layer; the same
 * for every way between layers (switch, decompose, compose). Memory
 * only; an import or a new model forgets everything. Switches marked
 * fpbTransient (the PDF export walks every layer) keep nothing, and the
 * layer they started from looks as before when they return to it.
 */
export default function LayerViews(eventBus, canvas) {
  this._canvas = canvas;
  this._views = new Map();
  this._transientStart = null;
  this._importing = false;
  this._leaving = null;

  const self = this;

  eventBus.on('FPBJS.import', function () {
    self._importing = true;
  });
  eventBus.on(['import.done', 'import.error'], function () {
    self._importing = false;
    self.forget();
  });
  eventBus.on(['layerPanel.reset', 'model.new'], function () {
    self.forget();
  });

  // switching, decomposing and composing all lead into another layer
  const on = function (phase, callback) {
    LAYER_COMMANDS.forEach(function (command) {
      eventBus.on('commandStack.' + command + '.' + phase, callback);
    });
  };

  on('preExecute', function (event) {
    self._leaving = null;
    if (self._importing) {
      return;
    }
    const left = canvas.getRootElement();
    if (!left || !left.businessObject) {
      return;
    }
    self._leaving = left.id;
    if (isTransient(event.context)) {
      if (!self._transientStart) {
        self._transientStart = { id: left.id, view: self._current() };
      }
      return;
    }
    self._views.set(left.id, self._current());
  });

  on('postExecuted', function (event) {
    const leaving = self._leaving;
    self._leaving = null;
    const process = canvas.getRootElement();
    // aborted (a decomposition without system limit) or still the same layer
    if (self._importing || event.context.aborted || !leaving || !process || process.id === leaving) {
      return;
    }
    if (isTransient(event.context)) {
      const start = self._transientStart;
      if (start && start.id === process.id) {
        self._transientStart = null;
        self._show(start.view);
      }
      return;
    }
    self._transientStart = null;
    const view = self._views.get(process.id);
    if (view) {
      self._show(view);
    } else {
      fitToViewport(canvas);
    }
  });
}

LayerViews.$inject = ['eventBus', 'canvas'];

function isTransient(context) {
  return !!(context && context.hints && context.hints.fpbTransient);
}

LayerViews.prototype.forget = function () {
  this._views.clear();
  this._transientStart = null;
};

/** Origin and zoom, so a resized window shows the same part at the same size */
LayerViews.prototype._current = function () {
  const box = this._canvas.viewbox();
  return { x: box.x, y: box.y, scale: box.scale };
};

LayerViews.prototype._show = function (view) {
  const outer = this._canvas.viewbox().outer;
  this._canvas.viewbox({
    x: view.x,
    y: view.y,
    width: outer.width / view.scale,
    height: outer.height / view.scale
  });
};
