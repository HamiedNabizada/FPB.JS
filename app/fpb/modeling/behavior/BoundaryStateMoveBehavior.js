import { isAny } from '../../help/utils';
import { checkIfOnSystemBorder, getSystemLimit } from '../../help/helpUtils';

const STATE_TYPES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];

// Above the move handler of diagram-js (500), which takes the hover as target
const PRIORITY = 1000;

/**
 * Boundary states on a child layer can be slid along the border (Szenario 5).
 *
 * The target of a move is the element under the pointer. A boundary state sits
 * half outside the system limit, so grabbed at its outer half the pointer is
 * over the layer itself; the move rule only lets states stay in their system
 * limit and refused the slide with "must remain on the system boundary". When
 * only boundary states move and the pointer is over the layer, their system
 * limit counts as target. Dragging them off the border stays refused by the
 * rule, which measures the vertical movement.
 */
export default function BoundaryStateMoveBehavior(eventBus, canvas) {

  eventBus.on('shape.move.move', PRIORITY, function (event) {
    const root = canvas.getRootElement();

    if (event.hover !== root || !root.businessObject || !root.businessObject.isDecomposedProcessOperator) {
      return;
    }

    const systemLimit = getSystemLimit(root);
    const context = event.context || {};
    const shapes = context.validatedShapes || context.shapes || [];

    if (!systemLimit || !shapes.length) {
      return;
    }

    const allOnBorder = shapes.every(function (shape) {
      return isAny(shape, STATE_TYPES) && shape.parent === systemLimit &&
        !!checkIfOnSystemBorder(systemLimit, shape);
    });

    if (allOnBorder) {
      event.hover = systemLimit;
    }
  });
}

BoundaryStateMoveBehavior.$inject = ['eventBus', 'canvas'];
