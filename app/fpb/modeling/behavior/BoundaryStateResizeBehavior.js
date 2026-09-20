import inherits from 'inherits';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import { isAny } from '../../help/utils';
import { checkIfOnSystemBorder } from '../../help/helpUtils';

const STATE_TYPES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];

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
      // step as the resize.
      modeling.moveElements([state], delta, shape);
    });
  });
}

inherits(BoundaryStateResizeBehavior, CommandInterceptor);

BoundaryStateResizeBehavior.$inject = [
  'eventBus',
  'modeling'
];
