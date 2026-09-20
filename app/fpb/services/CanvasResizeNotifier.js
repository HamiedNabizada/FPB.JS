/**
 * Tells diagram-js when the drawing area changes size.
 *
 * diagram-js does not watch its container; it only recomputes the viewbox when
 * someone calls `canvas.resized()`. In FPB.JS the panels sit next to the canvas
 * in a grid, so opening the properties panel takes width away from it without
 * anyone saying so: the container was 1033 pixels wide while the viewbox still
 * reported 1281. Everything that measures the visible area worked with the old
 * number, among it fitting the model into view, scrolling to an element and
 * placing the context pad.
 *
 * A ResizeObserver on the container closes that gap. The callback is debounced,
 * because a panel animates its way to its width and would otherwise fire a
 * burst of events.
 */
const DEBOUNCE_INTERVAL = 100;

export default function CanvasResizeNotifier(eventBus, canvas) {
  this._canvas = canvas;
  this._observer = null;

  const self = this;

  eventBus.on('canvas.init', function () {
    self._watch();
  });

  eventBus.on('diagram.destroy', function () {
    self._stop();
  });
}

CanvasResizeNotifier.$inject = ['eventBus', 'canvas'];

CanvasResizeNotifier.prototype._watch = function () {
  const container = this._canvas.getContainer();

  // Not every environment has it (older browsers, some test setups); without
  // it everything stays as it was before.
  if (!container || typeof ResizeObserver === 'undefined') {
    return;
  }

  const canvas = this._canvas;
  let timer = null;
  let lastWidth = container.clientWidth;
  let lastHeight = container.clientHeight;

  this._observer = new ResizeObserver(function () {
    if (container.clientWidth === lastWidth && container.clientHeight === lastHeight) {
      return;
    }
    lastWidth = container.clientWidth;
    lastHeight = container.clientHeight;

    clearTimeout(timer);
    timer = setTimeout(function () {
      // The diagram may be gone by now
      if (canvas.getContainer()) {
        canvas.resized();
      }
    }, DEBOUNCE_INTERVAL);
  });

  this._observer.observe(container);
};

CanvasResizeNotifier.prototype._stop = function () {
  if (this._observer) {
    this._observer.disconnect();
    this._observer = null;
  }
};
