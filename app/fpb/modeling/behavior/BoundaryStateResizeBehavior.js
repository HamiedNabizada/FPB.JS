import inherits from 'inherits';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import { computeChildrenBBox } from 'diagram-js/lib/features/resize/ResizeUtil';

import { isAny } from '../../help/utils';
import { checkIfOnSystemBorder } from '../../help/helpUtils';

const STATE_TYPES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];

// Room left between the innermost elements and the border when shrinking
const CHILDREN_PADDING = 20;
const MIN_SIZE = 100;

/**
 * Keeps the boundary states on the border when the system limit is resized
 * (part of bug B01).
 *
 * A state on the border of the system limit is a boundary state: it stands for
 * the input or output of the decomposed operator one layer up. Resizing the
 * system limit left those states where they were, so after dragging the bottom
 * edge down they hung inside the limit, and the model check reported them
 * (rule B6, "boundary state on the border of the system limit").
 *
 * Only the states on a border follow the resize. Everything else keeps its
 * place on purpose: resizing the frame should not rearrange the process.
 */
export default function BoundaryStateResizeBehavior(eventBus, modeling) {
  CommandInterceptor.call(this, eventBus);

  /**
   * A boundary state stands on the line, so half of it hangs outside the system
   * limit. diagram-js takes the box around all children as the smallest size the
   * limit may have, and those overhanging halves made that box larger than the
   * limit itself: every resize snapped to it, the limit grew by the overhang
   * instead of following the mouse, and it could not be made smaller at all.
   *
   * The documented way in is 'resize.start' (see Resize.js): the states that
   * ride on the border are left out of the box, they follow the border anyway.
   */
  eventBus.on('resize.start', 1500, function (event) {
    const context = event.context;
    const shape = context.shape;

    if (!shape || shape.type !== 'fpb:SystemLimit') {
      return;
    }

    const inner = (shape.children || []).filter(function (child) {
      return !child.waypoints && !child.labelTarget && !checkIfOnSystemBorder(shape, child);
    });

    context.minBounds = inner.length
      ? computeChildrenBBox(inner, CHILDREN_PADDING)
      : { x: shape.x, y: shape.y, width: MIN_SIZE, height: MIN_SIZE };
  });

  this.preExecute('shape.resize', function (event) {
    const context = event.context;
    const shape = context.shape;

    if (shape.type !== 'fpb:SystemLimit') {
      return;
    }

    const container = (shape.businessObject && shape.businessObject.elementsContainer) || [];

    context.fpbBoundaryStates = container
      .filter(function (element) {
        return isAny(element, STATE_TYPES);
      })
      .map(function (state) {
        return { state: state, border: checkIfOnSystemBorder(shape, state) };
      })
      .filter(function (entry) {
        return entry.border;
      })
      .map(function (entry) {
        // Distance to the left edge as a fraction, so a wider limit spreads
        // the states instead of piling them up on the left.
        entry.relativeX = shape.width ? (entry.state.x - shape.x) / shape.width : 0;
        return entry;
      });
  });

  this.postExecute('shape.resize', function (event) {
    const context = event.context;
    const shape = context.shape;
    const entries = context.fpbBoundaryStates || [];

    entries.forEach(function (entry) {
      const state = entry.state;
      const targetY = entry.border === 'onUpperBorder'
        ? shape.y - (state.height || 50) / 2
        : shape.y + shape.height - (state.height || 50) / 2;
      const targetX = shape.x + entry.relativeX * shape.width;
      const delta = { x: Math.round(targetX - state.x), y: Math.round(targetY - state.y) };

      if (delta.x === 0 && delta.y === 0) {
        return;
      }
      // A command of its own inside postExecute: it belongs to the same undo
      // step as the resize. The hint says the state only follows its border;
      // without it ShapeUpdater takes the move for a state newly placed on the
      // border and asks the user to confirm it (see Szenario 6 there).
      modeling.moveShape(state, delta, shape, { fpbBoundaryFollow: true });
    });
  });
}

inherits(BoundaryStateResizeBehavior, CommandInterceptor);

BoundaryStateResizeBehavior.$inject = [
  'eventBus',
  'modeling'
];
