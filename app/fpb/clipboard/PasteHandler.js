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

  clipboard.shapes.forEach((entry) => {
    const shape = this._elementFactory.createShape({ type: entry.type });
    // Technical resources belong outside the system limit
    const parent = is(shape, 'fpb:TechnicalResource') ? root : systemLimit;
    const position = {
      x: origin.x + entry.dx + entry.width / 2,
      y: origin.y + entry.dy + entry.height / 2
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

PasteHandler.prototype.execute = function () {};
PasteHandler.prototype.revert = function () {};
