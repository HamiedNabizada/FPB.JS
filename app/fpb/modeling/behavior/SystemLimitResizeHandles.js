/**
 * Makes the whole edge of the system limit grab the resize handle.
 *
 * diagram-js puts a handle of 20 by 20 pixels at each corner and at the middle
 * of each edge. Everywhere else the edge belongs to whatever lies there, and on
 * the system limit that is usually a boundary state: it sits centred on the
 * line. Aiming at the edge to resize then grabbed the state instead and pulled
 * it off the border, which is how states "fell off" while resizing.
 *
 * The hit area of the four edge handles is stretched along its edge, keeping
 * its thickness. The line resizes, and the halves of a state that stick out
 * above and below the band can still be grabbed to move it.
 *
 * The corner handles are drawn after the edge ones and therefore stay on top;
 * the stretched areas keep an inset so the corners are not swallowed.
 */
const CORNER_INSET = 20;

const EDGES = {
  n: 'horizontal',
  s: 'horizontal',
  e: 'vertical',
  w: 'vertical'
};

export default function SystemLimitResizeHandles(eventBus, selection, canvas) {
  this._selection = selection;
  this._canvas = canvas;

  const self = this;

  // Low priority: ResizeHandles draws on the same events, we come afterwards.
  eventBus.on([
    'selection.changed',
    'element.changed',
    'shape.changed',
    'resize.cleanup'
  ], 100, function () {
    self._stretchHandles();
  });
}

SystemLimitResizeHandles.$inject = ['eventBus', 'selection', 'canvas'];

SystemLimitResizeHandles.prototype._stretchHandles = function () {
  const container = this._canvas.getContainer();

  if (!container) {
    return;
  }

  this._selection.get().forEach(function (element) {
    if (element.type !== 'fpb:SystemLimit') {
      return;
    }

    Object.keys(EDGES).forEach(function (direction) {
      const group = container.querySelector(
        '.djs-resizer-' + element.id + '.djs-resizer-' + direction
      );
      const hit = group && group.querySelector('.djs-resizer-hit');

      if (!hit) {
        return;
      }

      if (EDGES[direction] === 'horizontal') {
        const width = Math.max(element.width - 2 * CORNER_INSET, 0);
        hit.setAttribute('x', String(-width / 2));
        hit.setAttribute('width', String(width));
      } else {
        const height = Math.max(element.height - 2 * CORNER_INSET, 0);
        hit.setAttribute('y', String(-height / 2));
        hit.setAttribute('height', String(height));
      }
    });
  });
};
