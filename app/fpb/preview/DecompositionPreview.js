import { previewGeometry } from './PreviewGeometry';
import { COLORS, DASH_PATTERNS } from '../core/FpbConstants';

const OVERLAY_TYPE = 'fpb-decomposition-preview';
const BOX = { width: 240, height: 150 };
const PADDING = 8;
const DELAY = 450;
// short grace period so the pointer can travel from the element onto the preview
const HIDE_DELAY = 250;

const FILLS = {
  product: COLORS.FPB_PRODUCT,
  energy: COLORS.FPB_ENERGY,
  information: COLORS.FPB_INFORMATION,
  operator: COLORS.FPB_PROCESS_OPERATOR,
  resource: COLORS.FPB_TECHNICAL_RESOURCE
};

/**
 * Preview of the decomposition when hovering a decomposed ProcessOperator.
 *
 * Shows the layer below as a miniature, drawn from the geometry of its
 * elements, so it also works for a layer that is not on the canvas. A click on
 * the preview switches to that layer.
 */
export default function DecompositionPreview(eventBus, overlays, canvas, modeling) {
  this._overlays = overlays;
  this._canvas = canvas;
  this._modeling = modeling;
  this._timer = null;
  this._hideTimer = null;
  this._shown = null;

  const self = this;

  eventBus.on('element.hover', function (event) {
    self._scheduleFor(event.element);
  });

  eventBus.on('element.out', function () {
    self._scheduleHide();
  });

  eventBus.on(['element.mousedown', 'canvas.viewbox.changing'], function () {
    self.hide();
  });

  // not while dragging, creating or switching layers
  eventBus.on(['drag.init', 'create.init', 'connect.init', 'root.set', 'canvas.destroy'], function () {
    self.hide();
  });
}

DecompositionPreview.$inject = ['eventBus', 'overlays', 'canvas', 'modeling'];

DecompositionPreview.prototype._scheduleFor = function (element) {
  const child = decompositionOf(element);
  clearTimeout(this._hideTimer);
  if (!child || this._shown === element) {
    return;
  }
  this.hide();
  const self = this;
  this._timer = setTimeout(function () {
    self.show(element);
  }, DELAY);
};

DecompositionPreview.prototype.show = function (element) {
  const child = decompositionOf(element);
  if (!child) {
    return;
  }
  const geometry = previewGeometry(child, BOX);
  if (!geometry) {
    return;
  }

  const node = document.createElement('div');
  node.className = 'fpb-decomposition-preview';
  node.title = 'Click to open this layer';

  const heading = document.createElement('div');
  heading.className = 'fpb-decomposition-preview-title';
  heading.textContent = (element.businessObject.name || 'Decomposition') + ': '
    + geometry.shapes.filter(function (s) { return s.kind !== 'systemLimit'; }).length + ' elements';

  node.appendChild(heading);
  node.appendChild(draw(geometry));

  const self = this;
  node.addEventListener('click', function () {
    self.hide();
    self._modeling.switchProcess(child);
  });
  node.addEventListener('mouseenter', function () {
    clearTimeout(self._hideTimer);
  });
  node.addEventListener('mouseleave', function () {
    self.hide();
  });

  this._overlays.add(element, OVERLAY_TYPE, {
    position: { top: element.height + PADDING, left: 0 },
    html: node
  });
  this._shown = element;
};

DecompositionPreview.prototype._scheduleHide = function () {
  const self = this;
  clearTimeout(this._timer);
  clearTimeout(this._hideTimer);
  this._hideTimer = setTimeout(function () {
    self.hide();
  }, HIDE_DELAY);
};

DecompositionPreview.prototype.hide = function () {
  clearTimeout(this._timer);
  clearTimeout(this._hideTimer);
  this._timer = null;
  if (this._shown) {
    this._overlays.remove({ type: OVERLAY_TYPE });
    this._shown = null;
  }
};

function decompositionOf(element) {
  const child = element && element.businessObject && element.businessObject.decomposedView;
  return child && child.businessObject ? child : null;
}

function draw(geometry) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', geometry.width);
  svg.setAttribute('height', geometry.height);
  svg.setAttribute('viewBox', '0 0 ' + geometry.width + ' ' + geometry.height);

  const add = function (name, attrs) {
    const node = document.createElementNS(svgNs, name);
    Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    svg.appendChild(node);
    return node;
  };

  geometry.shapes.filter(function (shape) { return shape.kind === 'systemLimit'; }).forEach(function (shape) {
    add('rect', {
      x: shape.x, y: shape.y, width: shape.width, height: shape.height,
      fill: 'none', stroke: COLORS.FPB_STROKE, 'stroke-width': 1, 'stroke-dasharray': DASH_PATTERNS.SYSTEM_LIMIT
    });
  });

  geometry.connections.forEach(function (connection) {
    add('polyline', {
      points: connection.points.map(function (p) { return p.x + ',' + p.y; }).join(' '),
      fill: 'none',
      stroke: COLORS.FPB_STROKE,
      'stroke-width': 1,
      'stroke-dasharray': connection.kind === 'usage' ? '3, 3' : 'none'
    });
  });

  geometry.shapes.forEach(function (shape) {
    const fill = FILLS[shape.kind];
    if (!fill) {
      return;
    }
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    const rx = shape.width / 2;
    const ry = shape.height / 2;
    const common = { fill: fill, stroke: COLORS.FPB_STROKE, 'stroke-width': 0.8 };

    if (shape.kind === 'product') {
      add('circle', Object.assign({ cx: cx, cy: cy, r: Math.min(rx, ry) }, common));
    } else if (shape.kind === 'energy') {
      add('polygon', Object.assign({ points: [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]].join(' ') }, common));
    } else if (shape.kind === 'information') {
      const dx = rx / 2;
      add('polygon', Object.assign({
        points: [[cx - dx, cy - ry], [cx + dx, cy - ry], [cx + rx, cy], [cx + dx, cy + ry], [cx - dx, cy + ry], [cx - rx, cy]].join(' ')
      }, common));
    } else if (shape.kind === 'resource') {
      add('rect', Object.assign({ x: shape.x, y: shape.y, width: shape.width, height: shape.height, rx: Math.min(6, ry) }, common));
    } else {
      add('rect', Object.assign({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }, common));
    }
  });

  return svg;
}
