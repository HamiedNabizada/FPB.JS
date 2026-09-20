import { isAny } from '../help/utils';
import { getSystemLimit } from '../help/helpUtils';
import { cloneModdle } from '../help/moddleClone';

const COPYABLE = ['fpb:State', 'fpb:ProcessOperator', 'fpb:TechnicalResource'];
const CONNECTIONS = ['fpb:Flow', 'fpb:ParallelFlow', 'fpb:AlternativeFlow', 'fpb:Usage'];
const OFFSET = 40;

/**
 * Copy and paste of elements within the model (Feature 024 H).
 *
 * Copied are states, process operators and technical resources, together with
 * the connections between them. The copy gets new ids and its own data
 * (identification, characteristics), so editing it does not change the
 * original. A decomposition is not copied: the copy of a decomposed operator
 * is a plain operator.
 *
 * Own implementation instead of the diagram-js clipboard because FPB elements
 * carry their own business objects and the containers of the layer.
 */
export default function FpbCopyPaste(canvas, elementFactory, fpbFactory, commandStack, selection) {
  this._canvas = canvas;
  this._elementFactory = elementFactory;
  this._fpbFactory = fpbFactory;
  this._commandStack = commandStack;
  this._selection = selection;
  this._clipboard = null;
}

FpbCopyPaste.$inject = ['canvas', 'elementFactory', 'fpbFactory', 'commandStack', 'selection'];

FpbCopyPaste.prototype.isEmpty = function () {
  return !this._clipboard || !this._clipboard.shapes.length;
};

/** Copies the elements (default: the selection). Returns what was copied. */
FpbCopyPaste.prototype.copy = function (elements) {
  const source = (elements || this._selection.get() || []).filter(function (element) {
    return element && isAny(element, COPYABLE) && element.type !== 'label';
  });
  if (!source.length) {
    return null;
  }

  const left = Math.min.apply(null, source.map(function (e) { return e.x; }));
  const top = Math.min.apply(null, source.map(function (e) { return e.y; }));
  const fpbFactory = this._fpbFactory;

  const shapes = source.map(function (element) {
    const bo = element.businessObject;
    return {
      type: element.type,
      dx: element.x - left,
      dy: element.y - top,
      width: element.width,
      height: element.height,
      name: bo.name || '',
      identification: bo.identification ? cloneModdle(fpbFactory, bo.identification) : null,
      characteristics: bo.characteristics ? cloneModdle(fpbFactory, bo.characteristics) : []
    };
  });

  const connections = [];
  source.forEach(function (element, index) {
    (element.outgoing || []).forEach(function (connection) {
      const targetIndex = source.indexOf(connection.target);
      if (targetIndex !== -1 && isAny(connection, CONNECTIONS)) {
        connections.push({ type: connection.type, from: index, to: targetIndex });
      }
    });
  });

  this._clipboard = { shapes: shapes, connections: connections, left: left, top: top, pastes: 0 };
  return this._clipboard;
};

/** Pastes the copy into the current layer, slightly offset, and selects it. */
FpbCopyPaste.prototype.paste = function () {
  if (this.isEmpty()) {
    return [];
  }
  const systemLimit = this._systemLimit();
  if (!systemLimit) {
    return [];
  }
  const steps = this._clipboard.pastes + 1;
  const context = {
    clipboard: this._clipboard,
    systemLimit: systemLimit,
    root: this._canvas.getRootElement(),
    // next to the original, and the next paste next to that one
    origin: { x: this._clipboard.left + OFFSET * steps, y: this._clipboard.top + OFFSET * steps }
  };
  this._commandStack.execute('fpb.paste', context);
  this._clipboard.pastes = steps;

  if (context.created && context.created.length) {
    this._selection.select(context.created);
  }
  return context.created || [];
};

FpbCopyPaste.prototype._systemLimit = function () {
  const root = this._canvas.getRootElement();
  if (!root || !root.businessObject || !root.businessObject.elementsContainer) {
    return null;
  }
  return getSystemLimit(root);
};
