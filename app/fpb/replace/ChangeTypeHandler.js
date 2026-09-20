import { is, isAny } from '../help/utils';
import { getElementsFromElementsContainer } from '../help/helpUtils';
import { collectProcessShapes } from '../help/processShapes';
import {
  runJournaled,
  revertJournal,
  setTracked,
  addTracked,
  removeTracked
} from '../modeling/updater/ModelJournal';

export const STATE_TYPES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];
export const BRANCH_FLOW_TYPES = ['fpb:ParallelFlow', 'fpb:AlternativeFlow'];

// Not copied: identity and type come from the new object, di is moved explicitly.
const NOT_COPIED = ['$type', 'id', 'di'];

/**
 * Command 'fpb.changeType': changes the type of a state or of a branching,
 * keeping ids and connections.
 *
 * A moddle business object cannot change its $type (read-only), so each
 * affected object is replaced by a new one of the new type with the same
 * properties, and every reference to the old one is moved over. All changes go
 * through the model journal and are reverted on undo.
 *
 * - State: the state in every layer (boundary states share the id, each layer
 *   has its own object) becomes Product, Energy or Information.
 * - Flow: the whole branching at the source changes between ParallelFlow and
 *   AlternativeFlow, as the branching type is defined at the source.
 * - context.scope 'connection': only this one connection changes, including
 *   Flow to a branching type and back. Used by ReplaceConnectionBehavior, which
 *   used to delete the connection and create a new one with a new id.
 */
export default function ChangeTypeHandler(fpbFactory, fpbjs, canvas, modeling) {
  this._fpbFactory = fpbFactory;
  this._fpbjs = fpbjs;
  this._canvas = canvas;
  this._modeling = modeling;
}

ChangeTypeHandler.$inject = ['fpbFactory', 'fpbjs', 'canvas', 'modeling'];

ChangeTypeHandler.prototype.execute = function (context) {
  const self = this;
  const element = context.element;
  const newType = context.newType;
  let shapes = [];

  context.journal = runJournaled(function () {
    if (context.scope === 'connection') {
      shapes = self._changeConnections([element], newType);
    } else if (is(element, 'fpb:State')) {
      shapes = self._changeState(element, newType);
    } else if (isAny(element, BRANCH_FLOW_TYPES)) {
      shapes = self._changeBranching(element, newType);
    }
  });
  context.changedShapes = shapes;

  return this._onCanvas(shapes);
};

/**
 * The look of a branching comes from the layouter, not from the renderer: an
 * alternative flow runs straight from source to target, a parallel one bends
 * onto the common bar of its tandem. After the type change the connections are
 * therefore laid out again, otherwise the branching would still look like the
 * old type. Runs in postExecute, so it belongs to the same undo step.
 */
ChangeTypeHandler.prototype.postExecute = function (context) {
  const modeling = this._modeling;
  const connections = (context.changedShapes || []).filter(function (shape) {
    return shape && shape.waypoints && shape.parent;
  });
  // twice: the first flow aligns to a partner that is laid out after it
  connections.forEach(function (connection) { modeling.layoutConnection(connection, { fpbRelayout: true }); });
  connections.forEach(function (connection) { modeling.layoutConnection(connection, { fpbRelayout: true }); });
};

ChangeTypeHandler.prototype.revert = function (context) {
  revertJournal(context.journal);
  return this._onCanvas(context.changedShapes || []);
};

ChangeTypeHandler.prototype._changeState = function (element, newType) {
  const self = this;
  const shapes = [];
  collectProcessShapes(this._fpbjs.getProjectDefinition()).forEach(function (process) {
    const systemLimit = getElementsFromElementsContainer(process.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
    if (!systemLimit) {
      return;
    }
    (systemLimit.businessObject.elementsContainer || []).forEach(function (candidate) {
      if (candidate && candidate.id === element.id && is(candidate, 'fpb:State')) {
        shapes.push({ shape: candidate, process: process });
      }
    });
  });
  // The shape on the canvas is not necessarily the object in elementsContainer.
  if (!shapes.some(function (entry) { return entry.shape === element; })) {
    shapes.push({ shape: element, process: this._canvas.getRootElement() });
  }

  // The canvas shape and its elementsContainer entry may share one object.
  const replaced = new Map();
  shapes.forEach(function (entry) {
    const oldBo = entry.shape.businessObject;
    if (!replaced.has(oldBo)) {
      const newBo = self._copy(oldBo, newType);
      replaced.set(oldBo, newBo);
      replaceIn(entry.process.businessObject.consistsOfStates, oldBo, newBo);
      (oldBo.isAssignedTo || []).forEach(function (operator) {
        replaceIn(operator && operator.isAssignedTo, oldBo, newBo);
      });
      (oldBo.incoming || []).concat(oldBo.outgoing || []).forEach(function (flow) {
        if (!flow || typeof flow === 'string') {
          return;
        }
        if (flow.sourceRef === oldBo) setTracked(flow, 'sourceRef', newBo);
        if (flow.targetRef === oldBo) setTracked(flow, 'targetRef', newBo);
      });
    }
    self._swapShape(entry.shape, replaced.get(oldBo), newType);
  });

  return shapes.map(function (entry) { return entry.shape; });
};

ChangeTypeHandler.prototype._changeBranching = function (element, newType) {
  const group = (element.source && element.source.outgoing || []).filter(function (flow) {
    return isAny(flow, BRANCH_FLOW_TYPES);
  });
  return this._changeConnections(group, newType);
};

/**
 * Changes the type of the given connections and keeps inTandemWith right:
 * a connection that becomes a branching joins the branching at its source, one
 * that becomes a plain Flow leaves it.
 */
ChangeTypeHandler.prototype._changeConnections = function (connections, newType) {
  const self = this;
  const becomesBranch = BRANCH_FLOW_TYPES.indexOf(newType) !== -1;

  connections.forEach(function (flow) {
    const oldBo = flow.businessObject;
    const newBo = self._copy(oldBo, newType);
    if (becomesBranch) {
      newBo.inTandemWith = (oldBo.inTandemWith || []).slice();
    }
    replaceIn(oldBo.sourceRef && oldBo.sourceRef.outgoing, oldBo, newBo);
    replaceIn(oldBo.targetRef && oldBo.targetRef.incoming, oldBo, newBo);
    (oldBo.inTandemWith || []).forEach(function (partner) {
      if (!partner || typeof partner === 'string') {
        return;
      }
      if (becomesBranch) {
        replaceIn(partner.inTandemWith, oldBo, newBo);
      } else {
        // no longer part of a branching
        removeTracked(partner.inTandemWith, oldBo);
      }
    });
    if (!becomesBranch && newBo.inTandemWith) {
      setTracked(newBo, 'inTandemWith', []);
    }
    self._swapShape(flow, newBo, newType);
  });

  if (becomesBranch) {
    connections.forEach(function (flow) {
      self._linkTandem(flow);
    });
  }
  return connections;
};

/** Links the connection with the other branching flows of its source. */
ChangeTypeHandler.prototype._linkTandem = function (flow) {
  const bo = flow.businessObject;
  (flow.source && flow.source.outgoing || []).forEach(function (other) {
    if (other === flow || !isAny(other, BRANCH_FLOW_TYPES)) {
      return;
    }
    const otherBo = other.businessObject;
    if (!bo.inTandemWith) {
      setTracked(bo, 'inTandemWith', []);
    }
    if (!otherBo.inTandemWith) {
      setTracked(otherBo, 'inTandemWith', []);
    }
    addTracked(bo.inTandemWith, otherBo);
    addTracked(otherBo.inTandemWith, bo);
  });
};

/** New business object of the new type with the same id and properties. */
ChangeTypeHandler.prototype._copy = function (oldBo, newType) {
  const newBo = this._fpbFactory.create(newType, {}, oldBo.id);
  Object.keys(oldBo).forEach(function (key) {
    if (NOT_COPIED.indexOf(key) === -1 && key !== 'inTandemWith') {
      newBo[key] = oldBo[key];
    }
  });
  newBo.di = oldBo.di;
  return newBo;
};

ChangeTypeHandler.prototype._swapShape = function (shape, newBo, newType) {
  setTracked(shape, 'businessObject', newBo);
  setTracked(shape, 'type', newType);
  (shape.labels || []).forEach(function (label) {
    setTracked(label, 'businessObject', newBo);
  });
};

/** The shapes among the given that are drawn on the canvas now. */
ChangeTypeHandler.prototype._onCanvas = function (shapes) {
  const root = this._canvas.getRootElement();
  return shapes.filter(function (shape) {
    return shape && shape.parent && findRoot(shape) === root;
  });
};

function findRoot(element) {
  while (element.parent) {
    element = element.parent;
  }
  return element;
}

function replaceIn(collection, oldEntry, newEntry) {
  if (!collection) {
    return;
  }
  const idx = collection.indexOf(oldEntry);
  if (idx !== -1) {
    setTracked(collection, idx, newEntry);
  }
}
