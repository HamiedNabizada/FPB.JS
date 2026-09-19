import { is, isAny } from '../help/utils';
import { getElementsFromElementsContainer } from '../help/helpUtils';

const GAP = 70;
const STEP = 70;
const MARGIN = 10;
const MAX_TRIES = 12;

export const APPEND_MENU = 'fpb-append';

export const APPEND_STATE_TYPES = [
  { type: 'fpb:Product', label: 'Product' },
  { type: 'fpb:Energy', label: 'Energy' },
  { type: 'fpb:Information', label: 'Information' }
];

/**
 * Appends a new element below an existing one and connects it (Feature 024 G).
 *
 * Direction follows the VDI 3682 convention used throughout FPB.JS: the flow
 * runs from top to bottom, so the new element goes below its source. If the
 * spot is taken, the element moves to the right until it is free, inside the
 * system limit.
 */
export default function FpbAppend(canvas, elementFactory, commandStack, selection, injector) {
  this._canvas = canvas;
  this._elementFactory = elementFactory;
  this._commandStack = commandStack;
  this._selection = selection;
  this._directEditing = injector.get('directEditing', false);
}

FpbAppend.$inject = ['canvas', 'elementFactory', 'commandStack', 'selection', 'injector'];

/** What can be appended to the element: a state type list, an operator, or nothing. */
FpbAppend.prototype.getOptions = function (element) {
  if (is(element, 'fpb:State')) {
    return [{ type: 'fpb:ProcessOperator', label: 'Process operator' }];
  }
  if (is(element, 'fpb:ProcessOperator')) {
    return APPEND_STATE_TYPES.slice();
  }
  return [];
};

FpbAppend.prototype.canAppend = function (element) {
  return this.getOptions(element).length > 0 && !!this._systemLimit();
};

FpbAppend.prototype.append = function (source, type) {
  const systemLimit = this._systemLimit();
  if (!systemLimit) {
    return null;
  }
  const shape = this._elementFactory.createShape({ type: type });
  const context = {
    source: source,
    shape: shape,
    systemLimit: systemLimit,
    position: this._freePosition(source, shape, systemLimit),
    // Keep the branching type of the source, otherwise a normal flow would be
    // mixed with parallel or alternative flows (rule C9).
    connectionType: branchTypeOf(source)
  };
  this._commandStack.execute('fpb.append', context);

  this._selection.select(context.created);
  // Straight to naming it, as after creating from the palette
  if (this._directEditing) {
    this._directEditing.activate(context.created);
  }
  return context.created;
};

FpbAppend.prototype._systemLimit = function () {
  const root = this._canvas.getRootElement();
  if (!root || !root.businessObject || !root.businessObject.elementsContainer) {
    return null;
  }
  return getElementsFromElementsContainer(root.businessObject.elementsContainer, 'fpb:SystemLimit')[0] || null;
};

/** Centre below the source, moved right while the spot is taken. */
FpbAppend.prototype._freePosition = function (source, shape, systemLimit) {
  const others = this._canvas.getRootElement().children.filter(function (child) {
    return child !== source && !child.waypoints && child.type !== 'label'
      && !is(child, 'fpb:SystemLimit') && typeof child.x === 'number';
  });

  const start = this._clampToSystemLimit({
    x: source.x + source.width / 2,
    y: source.y + source.height + GAP + shape.height / 2
  }, shape, systemLimit);
  let x = start.x;
  const y = start.y;

  for (let i = 0; i < MAX_TRIES; i++) {
    const box = { x: x - shape.width / 2, y: y - shape.height / 2, width: shape.width, height: shape.height };
    const taken = others.some(function (other) { return overlaps(box, other); });
    if (!taken) {
      break;
    }
    x = this._clampToSystemLimit({ x: x + STEP, y: y }, shape, systemLimit).x;
  }

  return { x: x, y: y };
};

/**
 * Horizontally inside the system limit. Downwards nothing is clamped: if the
 * element does not fit, the command grows the system limit (AppendHandler).
 * A state may sit on the lower border, an operator has to stay inside.
 */
FpbAppend.prototype._clampToSystemLimit = function (position, shape, systemLimit) {
  const minX = systemLimit.x + shape.width / 2 + MARGIN;
  const maxX = systemLimit.x + systemLimit.width - shape.width / 2 - MARGIN;
  const maxY = is(shape, 'fpb:State')
    ? systemLimit.y + systemLimit.height
    : Number.POSITIVE_INFINITY;
  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(position.y, maxY)
  };
};

function branchTypeOf(source) {
  const branch = (source.outgoing || []).find(function (connection) {
    return isAny(connection, ['fpb:ParallelFlow', 'fpb:AlternativeFlow']);
  });
  return branch ? branch.type : 'fpb:Flow';
}

function overlaps(box, other) {
  return box.x < other.x + other.width + MARGIN && other.x < box.x + box.width + MARGIN
    && box.y < other.y + other.height + MARGIN && other.y < box.y + box.height + MARGIN;
}

export function canAppendTo(element) {
  return isAny(element, ['fpb:State', 'fpb:ProcessOperator']);
}
