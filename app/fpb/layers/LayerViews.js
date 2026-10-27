import { fitToViewport } from '../help/viewport';

/**
 * The view of each layer (016d V3): leaving a layer keeps its section and
 * zoom, returning restores them, the first visit fits the layer. Memory
 * only; an import or a new model forgets everything. Switches marked
 * fpbTransient (the PDF export walks every layer) keep nothing, and the
 * layer they started from looks as before when they return to it.
 */
export default function LayerViews(eventBus, canvas) {
  this._canvas = canvas;
  this._views = new Map();
  this._transientStart = null;
  this._importing = false;

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

  eventBus.on('commandStack.process.switch.preExecute', function (event) {
    if (self._importing) {
      return;
    }
    const left = canvas.getRootElement();
    if (!left || !left.businessObject) {
      return;
    }
    if (isTransient(event.context)) {
      if (!self._transientStart) {
        self._transientStart = { id: left.id, view: self._current() };
      }
      return;
    }
    self._views.set(left.id, self._current());
  });

  eventBus.on('commandStack.process.switch.postExecuted', function (event) {
    if (self._importing) {
      return;
    }
    const process = event.context.process;
    if (isTransient(event.context)) {
      const start = self._transientStart;
      if (start && process && start.id === process.id) {
        self._transientStart = null;
        self._show(start.view);
      }
      return;
    }
    self._transientStart = null;
    const view = process && self._views.get(process.id);
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
