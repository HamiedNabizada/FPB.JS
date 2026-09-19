import { is } from '../help/utils';
import { checkIfOnSystemBorder } from '../help/helpUtils';

const MARGIN = 20;

/**
 * Command 'fpb.append': creates the new element, makes room for it and connects
 * it. The steps run in preExecute, so all of it belongs to one entry in the
 * command stack and a single undo takes the whole append back.
 */
export default function AppendHandler(modeling, canvas) {
  this._modeling = modeling;
  this._canvas = canvas;
}

AppendHandler.$inject = ['modeling', 'canvas'];

AppendHandler.prototype.preExecute = function (context) {
  const modeling = this._modeling;
  const { shape, position, systemLimit, source, connectionType } = context;

  // Grow the system limit downwards if the element would not fit. The output
  // states on its lower border move along, except the source: appending below
  // it turns it into an intermediate state, it stays where it is.
  const needed = position.y + shape.height / 2 + MARGIN;
  const bottom = systemLimit.y + systemLimit.height;
  if (!is(shape, 'fpb:State') && needed > bottom) {
    const delta = needed - bottom;
    const onBorder = (systemLimit.businessObject.elementsContainer || []).filter(function (element) {
      return element !== source && is(element, 'fpb:State') && element.parent
        && checkIfOnSystemBorder(systemLimit, element) === 'onBottomBorder';
    });
    modeling.resizeShape(systemLimit, {
      x: systemLimit.x,
      y: systemLimit.y,
      width: systemLimit.width,
      height: systemLimit.height + delta
    });
    if (onBorder.length) {
      modeling.moveElements(onBorder, { x: 0, y: delta });
    }
  }

  context.created = modeling.createShape(shape, position, systemLimit);
  modeling.connect(source, context.created, { type: connectionType });
};

AppendHandler.prototype.execute = function () {};
AppendHandler.prototype.revert = function () {};
