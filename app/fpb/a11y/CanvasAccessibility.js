/**
 * Makes the drawing area usable without a mouse and understandable to a screen
 * reader (feature 022, WCAG 2.1 Level A).
 *
 * Three things were missing:
 * - the canvas announced itself as nothing at all, so a screen reader read the
 *   surrounding page and stopped,
 * - the palette could only be clicked: its entries were not in the tab order
 *   and did not react to Enter or Space,
 * - the elements on the canvas carried no name, so moving through them told
 *   the user nothing.
 *
 * The palette keeps its mouse behaviour untouched; keyboard activation goes
 * through the same `triggerEntry` the click handler uses.
 */
const CANVAS_LABEL = 'Process diagram, editable drawing area';

export default function CanvasAccessibility(canvas, palette, eventBus) {
  this._canvas = canvas;
  this._palette = palette;

  const self = this;

  eventBus.on('diagram.init', function () {
    self._describeCanvas();
  });

  // The palette renders after its provider registered, and again on changes.
  eventBus.on(['canvas.init', 'palette.changed'], function () {
    self._makePaletteFocusable();
  });

  // Elements get their name as a label when they are drawn. The priority is
  // above the one of FpbRenderer (2000): a renderer returns the drawn shape,
  // and a returned value ends the propagation, so a lower priority would never
  // be reached. Returning nothing here leaves the rendering itself alone.
  eventBus.on(['render.shape', 'render.connection'], 2500, function (event) {
    self._describeElement(event.element, event.gfx);
  });
}

CanvasAccessibility.$inject = ['canvas', 'palette', 'eventBus'];

CanvasAccessibility.prototype._describeCanvas = function () {
  const container = this._canvas.getContainer();

  if (!container) {
    return;
  }
  // "application" tells assistive technology that arrow keys and shortcuts
  // belong to this widget instead of the reading cursor.
  container.setAttribute('role', 'application');
  container.setAttribute('aria-label', CANVAS_LABEL);
  container.setAttribute('tabindex', '0');
};

CanvasAccessibility.prototype._makePaletteFocusable = function () {
  const palette = this._palette;
  const container = palette._container;

  if (!container) {
    return;
  }

  Array.prototype.forEach.call(container.querySelectorAll('.entry'), function (entry) {
    if (entry.getAttribute('tabindex') !== null) {
      return;
    }
    entry.setAttribute('tabindex', '0');
    entry.setAttribute('role', 'button');

    entry.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      palette.triggerEntry(entry.getAttribute('data-action'), 'click', event);
    });
  });
};

CanvasAccessibility.prototype._describeElement = function (element, gfx) {
  if (!gfx || !element || !element.businessObject) {
    return;
  }

  const type = (element.type || '').replace('fpb:', '');
  const name = element.businessObject.name;

  gfx.setAttribute('role', 'img');
  gfx.setAttribute('aria-label', name ? type + ': ' + name : type);
};
