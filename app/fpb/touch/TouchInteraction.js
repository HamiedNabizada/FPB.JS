import { closest as domClosest } from 'min-dom';

/**
 * Touch input for the canvas.
 *
 * diagram-js 15 starts every drag from a mouse event and learns the element
 * under the pointer from mouseover, so on a touch screen taps work but nothing
 * can be dragged. This module translates touch gestures:
 *
 * - one finger on an element and drag: move it (element.mousedown with the
 *   TouchEvent as original event, so Dragging binds its touch listeners),
 * - one finger from a palette or context pad entry: create or connect,
 * - one finger on free space: pan,
 * - two fingers: zoom around their midpoint.
 *
 * While a touch drag is active the element under the finger is reported as
 * element.hover / element.out, which Create and Connect rely on to find their
 * target. Taps stay with the browser, which turns them into clicks.
 */

const DRAG_THRESHOLD = 8;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DISTANCE = 20;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

export default function TouchInteraction(eventBus, canvas, elementRegistry, palette, contextPad, dragging) {
  this._eventBus = eventBus;
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;
  this._palette = palette;
  this._contextPad = contextPad;
  this._dragging = dragging;

  this._touch = null;
  this._pinch = null;
  this._hovered = null;

  this._onTouchStart = this._onTouchStart.bind(this);
  this._onTouchMove = this._onTouchMove.bind(this);
  this._onTouchEnd = this._onTouchEnd.bind(this);

  eventBus.on('canvas.init', () => this._bind());
  eventBus.on('diagram.destroy', () => this._unbind());
}

TouchInteraction.$inject = ['eventBus', 'canvas', 'elementRegistry', 'palette', 'contextPad', 'dragging'];

TouchInteraction.prototype._bind = function () {
  const container = this._canvas.getContainer();
  container.addEventListener('touchstart', this._onTouchStart, { passive: false });
  // Capture phase on the document: Dragging stops propagation of the touch
  // events it handles, and it registers later, so this still runs first.
  document.addEventListener('touchmove', this._onTouchMove, { capture: true, passive: false });
  document.addEventListener('touchend', this._onTouchEnd, true);
  document.addEventListener('touchcancel', this._onTouchEnd, true);
};

TouchInteraction.prototype._unbind = function () {
  const container = this._canvas.getContainer();
  container.removeEventListener('touchstart', this._onTouchStart);
  document.removeEventListener('touchmove', this._onTouchMove, true);
  document.removeEventListener('touchend', this._onTouchEnd, true);
  document.removeEventListener('touchcancel', this._onTouchEnd, true);
};

// --- gesture handling --------------------------------------------------------

TouchInteraction.prototype._onTouchStart = function (event) {
  if (event.touches.length === 2) {
    this._touch = null;
    this._startPinch(event);
    return;
  }
  if (event.touches.length !== 1 || this._touch) {
    return;
  }
  const point = toClientPoint(event.touches[0]);
  const paletteEntry = domClosest(event.target, '.djs-palette .entry', true);
  const padEntry = domClosest(event.target, '.djs-context-pad .entry', true);
  const element = paletteEntry || padEntry ? null : this._elementAt(point);

  this._touch = { event, start: point, last: point, paletteEntry, padEntry, element, mode: null };
};

TouchInteraction.prototype._onTouchMove = function (event) {
  if (this._pinch) {
    if (event.touches.length === 2) {
      this._movePinch(event);
      event.preventDefault();
    }
    return;
  }
  const touch = this._touch;
  if (!touch || event.touches.length !== 1) {
    return;
  }
  const point = toClientPoint(event.touches[0]);

  if (!touch.mode) {
    if (distance(point, touch.start) < DRAG_THRESHOLD) {
      return;
    }
    touch.mode = this._startDrag(touch) ? 'drag' : 'pan';
  }

  if (touch.mode === 'pan') {
    this._canvas.scroll({ dx: point.x - touch.last.x, dy: point.y - touch.last.y });
    touch.last = point;
    event.preventDefault();
  } else {
    this._updateHover(point, event);
  }
};

TouchInteraction.prototype._onTouchEnd = function (event) {
  if (this._pinch && event.touches.length < 2) {
    this._pinch = null;
  }
  const touch = this._touch;
  if (touch && event.touches.length === 0) {
    if (!touch.mode) {
      if (!this._finishTapDrag(touch, event)) {
        this._tap(touch, event);
      }
      this._clearHover(event);
    } else {
      // Dragging registered its touchend listener after ours and runs next;
      // it still needs the hover as drop target, so clear it afterwards.
      setTimeout(() => this._clearHover(event), 0);
    }
    this._touch = null;
  }
};

/**
 * A tap on a palette or context pad entry starts a create or connect through
 * the browser's click, and that operation then follows the mouse. A second tap
 * on the canvas finishes it here: move the operation to the tap and end it.
 * Touch started drags are left to Dragging, which listens to the touch itself.
 */
/**
 * A tap becomes a click, two quick taps at one spot a double click. Chrome
 * does not send its mouse compatibility events for the first tap after a
 * touch drag, so taps are turned into clicks here and the browser's own
 * emulation is suppressed.
 */
TouchInteraction.prototype._tap = function (touch, event) {
  const point = touch.last;
  const target = document.elementFromPoint(point.x, point.y) || touch.event.target;
  const now = Date.now();
  const last = this._lastTap;
  const double = !!last && now - last.time < DOUBLE_TAP_MS && distance(point, last.point) < DOUBLE_TAP_DISTANCE;
  this._lastTap = double ? null : { time: now, point };

  const click = (type) => target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: point.x,
    clientY: point.y,
    button: 0,
    detail: type === 'dblclick' ? 2 : 1
  }));
  click('click');
  if (double) {
    click('dblclick');
  }
  event.preventDefault();
};

TouchInteraction.prototype._finishTapDrag = function (touch, event) {
  const context = this._dragging.context();
  if (!context || context.isTouch) {
    return false;
  }
  const point = touch.last;
  const synthetic = {
    type: 'touchend',
    clientX: point.x,
    clientY: point.y,
    target: document.elementFromPoint(point.x, point.y),
    preventDefault() {},
    stopPropagation() {}
  };
  this._updateHover(point, synthetic);
  this._dragging.move(synthetic, true);
  this._dragging.end(synthetic);
  // No emulated click after this tap, it would land on whatever was created.
  event.preventDefault();
  return true;
};

/**
 * Hands the gesture to diagram-js. Returns false if nothing takes it, in which
 * case the finger pans the canvas instead.
 */
TouchInteraction.prototype._startDrag = function (touch) {
  const original = touch.event;
  const root = this._canvas.getRootElement();

  // Dragging reads the primary button from the original event; a TouchEvent
  // has none, so give it one. Palette and context pad look for the entry
  // on delegateTarget.
  defineOn(original, 'button', 0);

  if (touch.paletteEntry) {
    defineOn(original, 'delegateTarget', touch.paletteEntry);
    this._palette.trigger('dragstart', original);
    return true;
  }
  if (touch.padEntry) {
    defineOn(original, 'delegateTarget', touch.padEntry);
    // The pad closes as soon as the drag clears the selection. The browser
    // keeps sending this touch to the entry it started on, and events on a
    // detached node never reach the document, so forward them from there.
    forwardDetachedTouches(touch.padEntry);
    this._contextPad.trigger('dragstart', original);
    return true;
  }
  if (touch.element && touch.element !== root) {
    const gfx = this._elementRegistry.getGraphics(touch.element);
    this._eventBus.fire('element.mousedown', { element: touch.element, gfx, originalEvent: original });
    return true;
  }
  return false;
};

// --- pinch zoom -----------------------------------------------------------------

TouchInteraction.prototype._startPinch = function (event) {
  const [a, b] = [toClientPoint(event.touches[0]), toClientPoint(event.touches[1])];
  this._pinch = { distance: distance(a, b), zoom: this._canvas.zoom() };
};

TouchInteraction.prototype._movePinch = function (event) {
  const [a, b] = [toClientPoint(event.touches[0]), toClientPoint(event.touches[1])];
  const current = distance(a, b);
  if (!this._pinch.distance || !current) {
    return;
  }
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this._pinch.zoom * current / this._pinch.distance));
  const rect = this._canvas.getContainer().getBoundingClientRect();
  this._canvas.zoom(zoom, { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top });
};

// --- hover synthesis ---------------------------------------------------------------

/**
 * The diagram element under a point. Drag previews and the connection being
 * drawn lie on top of everything and are skipped, a label stands for the
 * element it belongs to.
 */
TouchInteraction.prototype._elementAt = function (point) {
  const nodes = document.elementsFromPoint ? document.elementsFromPoint(point.x, point.y) : [document.elementFromPoint(point.x, point.y)];
  for (const node of nodes) {
    if (!node || domClosest(node, '.djs-dragger, .djs-drag-group, .djs-connection-preview, .djs-context-pad, .djs-palette', true)) {
      continue;
    }
    const gfx = domClosest(node, '[data-element-id]', true);
    if (!gfx) {
      continue;
    }
    const element = this._elementRegistry.get(gfx.getAttribute('data-element-id'));
    if (element) {
      return element.labelTarget || element;
    }
  }
  return null;
};

TouchInteraction.prototype._updateHover = function (point, originalEvent) {
  const element = this._elementAt(point);
  if (element === this._hovered) {
    return;
  }
  this._clearHover(originalEvent);
  if (element) {
    this._hovered = element;
    this._eventBus.fire('element.hover', { element, gfx: this._elementRegistry.getGraphics(element), originalEvent });
  }
};

TouchInteraction.prototype._clearHover = function (originalEvent) {
  const element = this._hovered;
  if (!element) {
    return;
  }
  this._hovered = null;
  this._eventBus.fire('element.out', { element, gfx: this._elementRegistry.getGraphics(element), originalEvent });
};

// --- helpers ----------------------------------------------------------------------------

function toClientPoint(touch) {
  return { x: touch.clientX, y: touch.clientY };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function defineOn(event, name, value) {
  Object.defineProperty(event, name, { value, configurable: true });
}

/**
 * Re-dispatches the remaining touch events of a gesture on the document once
 * the node they are delivered to has left the DOM. Removes itself when the
 * gesture ends.
 */
function forwardDetachedTouches(node) {
  const forward = (event) => {
    if (!node.isConnected && typeof TouchEvent === 'function') {
      document.dispatchEvent(new TouchEvent(event.type, {
        bubbles: true,
        cancelable: true,
        view: window,
        touches: Array.from(event.touches),
        targetTouches: Array.from(event.targetTouches),
        changedTouches: Array.from(event.changedTouches)
      }));
    }
    if (event.type !== 'touchmove') {
      ['touchmove', 'touchend', 'touchcancel'].forEach((type) => node.removeEventListener(type, forward));
    }
  };
  ['touchmove', 'touchend', 'touchcancel'].forEach((type) => node.addEventListener(type, forward));
}
