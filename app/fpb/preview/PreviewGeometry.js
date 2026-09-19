import { is, isAny } from '../help/utils';

const FLOW_TYPES = ['fpb:Flow', 'fpb:ParallelFlow', 'fpb:AlternativeFlow'];
const SHAPE_TYPES = ['fpb:State', 'fpb:ProcessOperator', 'fpb:TechnicalResource', 'fpb:SystemLimit'];

/**
 * Scales a layer into a small preview box (Feature 025).
 *
 * Works on the process root shape, so it also covers layers that are not on the
 * canvas: their shapes only live in elementsContainer.
 *
 * Returns { width, height, shapes: [{ kind, type, x, y, width, height, name }],
 * connections: [{ kind, points: [{x, y}] }] } in the coordinates of the box,
 * or null for an empty layer.
 */
export function previewGeometry(process, box) {
  if (!process || !process.businessObject) {
    return null;
  }
  const elements = collect(process);
  const shapes = elements.filter(function (element) {
    return isAny(element, SHAPE_TYPES) && hasBounds(element);
  });
  if (!shapes.length) {
    return null;
  }

  const bounds = outerBounds(shapes);
  const scale = Math.min(box.width / bounds.width, box.height / bounds.height, 1);
  const offsetX = (box.width - bounds.width * scale) / 2;
  const offsetY = (box.height - bounds.height * scale) / 2;
  const toX = function (x) { return round((x - bounds.x) * scale + offsetX); };
  const toY = function (y) { return round((y - bounds.y) * scale + offsetY); };

  const connections = elements.filter(function (element) {
    return element.waypoints && element.waypoints.length > 1
      && (isAny(element, FLOW_TYPES) || is(element, 'fpb:Usage'));
  }).map(function (connection) {
    return {
      kind: is(connection, 'fpb:Usage') ? 'usage' : 'flow',
      points: connection.waypoints.map(function (point) {
        return { x: toX(point.x), y: toY(point.y) };
      })
    };
  });

  return {
    width: box.width,
    height: box.height,
    shapes: shapes.map(function (shape) {
      return {
        kind: kindOf(shape),
        type: shape.type,
        name: (shape.businessObject.name || '').trim(),
        x: toX(shape.x),
        y: toY(shape.y),
        width: round(shape.width * scale),
        height: round(shape.height * scale)
      };
    }),
    connections: connections
  };
}

function collect(process) {
  const top = process.businessObject.elementsContainer || [];
  const systemLimit = top.find(function (element) { return is(element, 'fpb:SystemLimit'); });
  const inner = systemLimit ? (systemLimit.businessObject.elementsContainer || []) : [];
  return top.concat(inner).filter(Boolean);
}

function kindOf(shape) {
  if (is(shape, 'fpb:SystemLimit')) return 'systemLimit';
  if (is(shape, 'fpb:ProcessOperator')) return 'operator';
  if (is(shape, 'fpb:TechnicalResource')) return 'resource';
  if (is(shape, 'fpb:Product')) return 'product';
  if (is(shape, 'fpb:Energy')) return 'energy';
  if (is(shape, 'fpb:Information')) return 'information';
  return 'other';
}

function outerBounds(shapes) {
  const x = Math.min.apply(null, shapes.map(function (s) { return s.x; }));
  const y = Math.min.apply(null, shapes.map(function (s) { return s.y; }));
  const right = Math.max.apply(null, shapes.map(function (s) { return s.x + s.width; }));
  const bottom = Math.max.apply(null, shapes.map(function (s) { return s.y + s.height; }));
  return { x: x, y: y, width: Math.max(right - x, 1), height: Math.max(bottom - y, 1) };
}

function hasBounds(element) {
  return typeof element.x === 'number' && typeof element.y === 'number'
    && element.width > 0 && element.height > 0;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
