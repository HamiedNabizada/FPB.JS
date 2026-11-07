import { is } from '../help/utils';
import { cloneModdle } from '../help/moddleClone';

/**
 * Command 'fpb.paste': creates the copied elements and their connections.
 * Everything runs in preExecute, so one undo takes the whole paste back.
 */
export default function PasteHandler(modeling, elementFactory, fpbFactory) {
  this._modeling = modeling;
  this._elementFactory = elementFactory;
  this._fpbFactory = fpbFactory;
}

PasteHandler.$inject = ['modeling', 'elementFactory', 'fpbFactory'];

PasteHandler.prototype.preExecute = function (context) {
  const modeling = this._modeling;
  const fpbFactory = this._fpbFactory;
  const { clipboard, systemLimit, root, origin } = context;
  const created = [];
  const inside = insideOffset(clipboard, systemLimit, origin);

  clipboard.shapes.forEach((entry) => {
    const shape = this._elementFactory.createShape({ type: entry.type });
    // Technical resources belong outside the system limit
    const parent = is(shape, 'fpb:TechnicalResource') ? root : systemLimit;
    const shift = parent === systemLimit ? inside : { x: 0, y: 0 };
    const position = {
      x: origin.x + shift.x + entry.dx + entry.width / 2,
      y: origin.y + shift.y + entry.dy + entry.height / 2
    };
    const element = modeling.createShape(shape, position, parent);

    const bo = element.businessObject;
    if (entry.identification) {
      const identification = cloneModdle(fpbFactory, entry.identification);
      identification.uniqueIdent = element.id;
      bo.identification = identification;
    }
    if (entry.characteristics && entry.characteristics.length) {
      bo.characteristics = cloneModdle(fpbFactory, entry.characteristics);
    }
    if (entry.name) {
      // updateLabel keeps name, label and shortName in sync
      modeling.updateLabel(element, entry.name);
    }
    created.push(element);
  });

  clipboard.connections.forEach(function (connection) {
    const source = created[connection.from];
    const target = created[connection.to];
    if (source && target) {
      modeling.connect(source, target, { type: connection.type });
    }
  });

  context.created = created;
};

// Room between the copy and the border: a state whose centre lies within
// 30 px of the border is a boundary state (checkIfOnSystemBorder), so its
// edge stays 10 px inside
const MARGIN = 10;

/**
 * How far the states and operators of the copy move so that they lie inside
 * the system limit (monkey test 2026-11-07: the copy of a state on the lower
 * border landed 40 px below it). A copy larger than the system limit keeps
 * its top left corner inside.
 */
function insideOffset(clipboard, systemLimit, origin) {
  const inner = clipboard.shapes.filter((entry) => entry.type !== 'fpb:TechnicalResource');
  if (!inner.length) {
    return { x: 0, y: 0 };
  }
  const axis = (start, size, pos, extent) => {
    const low = Math.min.apply(null, inner.map((e) => origin[pos] + e[start]));
    const high = Math.max.apply(null, inner.map((e) => origin[pos] + e[start] + e[extent]));
    const min = systemLimit[pos] + MARGIN;
    const max = systemLimit[pos] + systemLimit[size] - MARGIN;
    if (high > max) {
      return Math.max(max - high, min - low);
    }
    return low < min ? min - low : 0;
  };
  return { x: axis('dx', 'width', 'x', 'width'), y: axis('dy', 'height', 'y', 'height') };
}

PasteHandler.prototype.execute = function () {};
PasteHandler.prototype.revert = function () {};
