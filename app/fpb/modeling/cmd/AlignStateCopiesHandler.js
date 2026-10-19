import { getSystemLimit } from '../../help/helpUtils';
import { stateCopies } from '../../help/processShapes';

/**
 * Model check F9: the copies of a boundary state differ, as an older file may
 * have left them (each layer saved on its own, 020 §2). The user chooses the
 * copy whose values are right; every copy takes its name, identification and
 * characteristics. Afterwards they share the identification and the list of
 * characteristics, as the copies of a new boundary state do
 * (helpUtils.createStateShapeForNewLayer, B14). One command, so one undo
 * brings every layer back.
 *
 * Context: { stateId, process } with `process` the layer of the chosen copy.
 */
export default function AlignStateCopiesHandler(fpbjs, elementRegistry) {
  this._fpbjs = fpbjs;
  this._elementRegistry = elementRegistry;
}

AlignStateCopiesHandler.$inject = ['fpbjs', 'elementRegistry'];

const KEYS = ['name', 'identification', 'characteristics'];

AlignStateCopiesHandler.prototype.execute = function (context) {
  const systemLimit = getSystemLimit(context.process);
  const source = ((systemLimit && systemLimit.businessObject.elementsContainer) || [])
    .find((element) => element && element.id === context.stateId);
  if (!source) {
    context.changes = [];
    return [];
  }

  const copies = stateCopies(this._fpbjs.getProjectDefinition(), source);
  context.changes = copies.map((copy) => {
    const businessObject = copy.businessObject;
    const old = {};
    KEYS.forEach((key) => {
      old[key] = businessObject[key];
      businessObject[key] = source.businessObject[key];
    });
    return { copy, old };
  });
  return this._onCanvas([source].concat(copies));
};

AlignStateCopiesHandler.prototype.revert = function (context) {
  const changes = context.changes || [];
  changes.forEach(({ copy, old }) => {
    KEYS.forEach((key) => {
      copy.businessObject[key] = old[key];
    });
  });
  return this._onCanvas(changes.map((change) => change.copy));
};

/** The copies shown on the canvas and their labels, to draw them again */
AlignStateCopiesHandler.prototype._onCanvas = function (states) {
  const registry = this._elementRegistry;
  return states
    .filter((state) => registry.get(state.id) === state)
    .reduce((all, state) => all.concat(state.label ? [state, state.label] : [state]), []);
};
