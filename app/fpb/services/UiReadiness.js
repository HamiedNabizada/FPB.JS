/**
 * Keeps track of which user interface components have finished mounting.
 *
 * The import used to wait a fixed two seconds before announcing its processes,
 * so the React panels would be listening by then. That was two seconds of
 * nothing for every import, and still only a guess: on a slow machine the
 * panels could take longer.
 *
 * Now every panel says when it is there, and the import continues as soon as
 * the panels that exist are ready. The timeout stays as a safety net, for a
 * panel that never announces itself (an older integration, or one that failed
 * to mount).
 *
 * Panels talk to this service through the event bus, because they hold the
 * modeler, not this service:
 *   eventBus.fire('ui.componentRegistered', { component: 'layerPanel' })
 *   eventBus.fire('ui.componentReady', { component: 'layerPanel' })
 */
export default function UiReadiness(eventBus) {
  this._expected = new Set();
  this._ready = new Set();
  this._waiting = [];

  const self = this;

  eventBus.on('ui.componentRegistered', function (event) {
    if (event.component) {
      self._expected.add(event.component);
    }
  });

  eventBus.on('ui.componentReady', function (event) {
    if (!event.component) {
      return;
    }
    self._expected.add(event.component);
    self._ready.add(event.component);
    self._release();
  });
}

UiReadiness.$inject = ['eventBus'];

/** True once every component that announced itself has mounted. */
UiReadiness.prototype.isReady = function () {
  const ready = this._ready;

  return [...this._expected].every(function (component) {
    return ready.has(component);
  });
};

/**
 * Call `callback` once the interface is ready, at the latest after `timeout`.
 * Always asynchronous, so the caller finishes its own work first.
 */
UiReadiness.prototype.whenReady = function (callback, timeout) {
  const self = this;

  if (this.isReady()) {
    setTimeout(callback, 0);
    return;
  }

  const entry = {
    callback: callback,
    timer: setTimeout(function () {
      self._run(entry);
    }, timeout)
  };
  this._waiting.push(entry);
};

UiReadiness.prototype._release = function () {
  if (!this.isReady()) {
    return;
  }
  this._waiting.slice().forEach(this._run, this);
};

UiReadiness.prototype._run = function (entry) {
  const index = this._waiting.indexOf(entry);

  if (index === -1) {
    return; // already run, through the timeout or a ready component
  }
  this._waiting.splice(index, 1);
  clearTimeout(entry.timer);
  entry.callback();
};
