import inherits from 'inherits';

import { getElementsFromElementsContainer, getElementById, createStateShapeForNewLayer } from '../../help/helpUtils';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import {
  runJournaled,
  revertJournal,
  addTracked,
  removeTracked,
  setTracked
} from './ModelJournal';

import {
  add as collectionAdd,
  remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

import {
  isLabel
} from 'diagram-js/lib/util/ModelUtil';

import {
  getBusinessObject,
  is,
  isAny
} from '../../help/utils';


/**
 * Handles business-model updates for connection events:
 * - connection.create: elementsContainer, isAssignedTo, layer sync (Szenario 3),
 *   parallel/alternative flow tandem
 * - connection.delete: cleanup of all references, cascading layer sync
 * - updateConnection: sourceRef/targetRef management for all connection types
 * - updateConnectionWaypoints: DI waypoint synchronisation
 * - updateDiConnection: DI source/target element synchronisation
 */
export default function ConnectionUpdater(
  eventBus, canvas, elementFactory, fpbFactory) {

  CommandInterceptor.call(this, eventBus);

  this._canvas = canvas;
  this._elementFactory = elementFactory;
  this._fpbFactory = fpbFactory;
  this._eventBus = eventBus;

  const self = this;

  // connection business logic (from updateProcessInformation) //////////////////////

  // Every model change made while creating or deleting a connection is journaled
  // in the command context. diagram-js only reverts the canvas; undo replays the
  // journal backwards so the business model follows. Without it an undone create
  // stayed in the model (and in the export), an undone delete was missing there.
  function onConnectionEvent(e) {
    const context = e.context;
    const command = e.command;
    context.fpbJournal = runJournaled(function () {
      self._handleConnectionCommand(command, context);
      self.updateConnection(context);
    });
  }

  this.executed([
    'connection.create',
    'connection.delete'
  ], ifFpb(onConnectionEvent));

  this.reverted([
    'connection.create',
    'connection.delete'
  ], ifFpb(function (e) {
    revertJournal(e.context.fpbJournal);
    if (e.command === 'connection.delete') {
      self.updateConnectionWaypoints(e.context.connection);
    }
  }));

  // attach / detach connection (sourceRef/targetRef) //////////////////////

  function updateConnection(e) {
    self.updateConnection(e.context);
  }

  // 'connection.reconnect' is the command diagram-js actually executes when an
  // end is dragged. Without it sourceRef/targetRef kept pointing at the old
  // element: the drawing followed, the model and the export did not.
  // create and delete run updateConnection inside their journal (see above).
  this.executed([
    'connection.move',
    'connection.reconnectEnd',
    'connection.reconnectStart'
  ], ifFpb(updateConnection));

  this.reverted([
    'connection.move',
    'connection.reconnectEnd',
    'connection.reconnectStart'
  ], ifFpb(updateConnection));

  // Dragging an end changes which flows share a source, so the tandem of
  // parallel and alternative flows has to follow. Journaled like create and
  // delete, otherwise undo would put the drawing back but not the model.
  this.executed('connection.reconnect', ifFpb(function (e) {
    const context = e.context;
    context.fpbJournal = runJournaled(function () {
      self._handleReconnect(context);
      self.updateConnection(context);
    });
  }));

  this.reverted('connection.reconnect', ifFpb(function (e) {
    revertJournal(e.context.fpbJournal);
    self.updateConnection(e.context);
  }));

  // update waypoints //////////////////////

  function updateConnectionWaypoints(e) {
    self.updateConnectionWaypoints(e.context.connection);
  }

  this.executed([
    'connection.layout',
    'connection.move',
    'connection.updateWaypoints',
  ], ifFpb(updateConnectionWaypoints));

  this.reverted([
    'connection.layout',
    'connection.move',
    'connection.updateWaypoints',
  ], ifFpb(updateConnectionWaypoints));
}

inherits(ConnectionUpdater, CommandInterceptor);

ConnectionUpdater.$inject = [
  'eventBus',
  'canvas',
  'elementFactory',
  'fpbFactory'
];


ConnectionUpdater.prototype._handleConnectionCommand = function (command, context) {
  const element = context.connection;
  const process_rootElement = this._canvas.getRootElement();

  if (isLabel(element)) {
    return;
  }

  if (command === 'connection.create') {
    this._handleCreate(element, context, process_rootElement);
  }

  if (command === 'connection.delete') {
    this._handleDelete(element, context, process_rootElement);
  }
};


ConnectionUpdater.prototype._handleCreate = function (element, context, process_rootElement) {
  // Connections to States
  if (is(context.source, 'fpb:State') || is(context.target, 'fpb:State')) {
    const processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
    if (!processSystemLimit) return;
    addTracked(processSystemLimit.businessObject.elementsContainer, element);

    let stateShape;
    let processOperatorShape;
    if (is(context.source, 'fpb:State')) {
      stateShape = context.source;
      processOperatorShape = context.target;
    } else {
      stateShape = context.target;
      processOperatorShape = context.source;
    }
    addTracked(stateShape.businessObject.isAssignedTo, processOperatorShape.businessObject);

    if (processOperatorShape.businessObject.decomposedView) {
      this._eventBus.fire('toolTips.decomposedProcessOperator', {
        command: 'newStateConnected',
        processOperator: processOperatorShape
      });

      // Layer consistency: Create state on child layer if not already present
      const decomposedProcess = processOperatorShape.businessObject.decomposedView;
      const childSystemLimit = getElementsFromElementsContainer(decomposedProcess.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
      if (childSystemLimit && childSystemLimit.businessObject.elementsContainer) {
        const existingStateInChild = getElementById(childSystemLimit.businessObject.elementsContainer, stateShape.businessObject.id);
        if (!existingStateInChild) {
          // Create state on child layer
          const newStateShape = createStateShapeForNewLayer(this._elementFactory, stateShape.businessObject.$type, stateShape.businessObject);
          addTracked(decomposedProcess.businessObject.consistsOfStates, newStateShape.businessObject);
          addTracked(childSystemLimit.businessObject.elementsContainer, newStateShape);

          // Set position based on direction (incoming/outgoing)
          const isIncoming = is(context.source, 'fpb:State'); // State -> ProcessOperator = incoming
          const stateWidth = 50;
          const stateSpacing = 20;

          const targetY = isIncoming
            ? childSystemLimit.y - 25  // Upper boundary
            : childSystemLimit.y + childSystemLimit.height - 25;  // Lower boundary

          // Place right of the outermost state already sitting on that boundary.
          // Counting them and multiplying by a fixed spacing assumed they were
          // packed from the left, which put the new state on top of an existing
          // one whenever they were not.
          let rightEdge = null;
          (childSystemLimit.businessObject.elementsContainer || []).forEach(function(el) {
            if (el === newStateShape) {
              return;
            }
            if (isAny(el, ['fpb:Product', 'fpb:Energy', 'fpb:Information'])) {
              if (Math.abs(el.y - targetY) < 30) {
                const edge = el.x + (el.width || stateWidth);
                if (rightEdge === null || edge > rightEdge) {
                  rightEdge = edge;
                }
              }
            }
          });

          const startX = childSystemLimit.x + 50;
          newStateShape.x = rightEdge === null ? startX : rightEdge + stateSpacing;
          newStateShape.y = targetY;
        }
      }
    }

    if (isAny(element, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
      let replaceFlow;
      (context.source.outgoing || []).forEach(function (flow) {
        if (!isAny(flow, ['fpb:ParallelFlow', 'fpb:AlternativeFlow', 'fpb:Usage'])) {
          replaceFlow = getElementById(processSystemLimit.businessObject.elementsContainer, flow.id);
        }
      });
      // If a normal Flow still exists, it will first be replaced in ReplaceConnectionBehavior
      if (!replaceFlow) {
        (context.source.outgoing || []).forEach(function (flow) {
          if (flow !== element && isAny(flow, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
            if (!flow.businessObject.inTandemWith) {
              setTracked(flow.businessObject, 'inTandemWith', []);
            }
            addTracked(flow.businessObject.inTandemWith, element.businessObject);
            addTracked(element.businessObject.inTandemWith, flow.businessObject);
          }
        });
      }
    }
  }

  // Connection to Technical Resource
  if (is(context.source, 'fpb:TechnicalResource') || is(context.target, 'fpb:TechnicalResource')) {
    addTracked(process_rootElement.businessObject.elementsContainer, element);
    if (!Array.isArray(context.source.businessObject.isAssignedTo)) {
      setTracked(context.source.businessObject, 'isAssignedTo', context.source.businessObject.isAssignedTo ? [context.source.businessObject.isAssignedTo] : []);
    }
    addTracked(context.source.businessObject.isAssignedTo, context.target.businessObject);
    if (!Array.isArray(context.target.businessObject.isAssignedTo)) {
      setTracked(context.target.businessObject, 'isAssignedTo', context.target.businessObject.isAssignedTo ? [context.target.businessObject.isAssignedTo] : []);
    }
    addTracked(context.target.businessObject.isAssignedTo, context.source.businessObject);
  }
};


/**
 * Move a branching flow to another source: it leaves the tandem it was in and
 * joins the branching flows of its new source.
 *
 * A tandem means "these flows start at the same source". After dragging an end
 * onto another element that no longer held, but both sides still listed each
 * other, and the stale id landed in the export (the same kind of damage as
 * bug B07, just through another door).
 *
 * Whether a flow left alone behind becomes a normal flow again is decided by
 * ReplaceConnectionBehavior, which runs on the same command.
 */
ConnectionUpdater.prototype._handleReconnect = function (context) {
  const connection = context.connection;
  const newSource = context.newSource;

  if (!newSource || newSource === context.oldSource || isLabel(connection)) {
    return;
  }
  if (!isAny(connection, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
    return;
  }

  const bo = connection.businessObject;

  (bo.inTandemWith || []).slice().forEach(function (partner) {
    if (!partner || typeof partner === 'string') {
      return;
    }
    removeTracked(partner.inTandemWith, bo);
    removeTracked(bo.inTandemWith, partner);
  });

  (newSource.outgoing || []).forEach(function (flow) {
    if (flow === connection || !isAny(flow, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
      return;
    }
    if (!flow.businessObject.inTandemWith) {
      setTracked(flow.businessObject, 'inTandemWith', []);
    }
    if (!bo.inTandemWith) {
      setTracked(bo, 'inTandemWith', []);
    }
    addTracked(flow.businessObject.inTandemWith, bo);
    addTracked(bo.inTandemWith, flow.businessObject);
  });
};


ConnectionUpdater.prototype._handleDelete = function (element, context, process_rootElement) {
  const self = this;
  const connection = element;

  // Connections to States
  if (is(context.source, 'fpb:State') || is(context.target, 'fpb:State')) {
    const processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
    if (!processSystemLimit) return;
    removeTracked(processSystemLimit.businessObject.elementsContainer, connection);

    let stateShape;
    let processOperatorShape;
    if (is(context.source, 'fpb:State')) {
      stateShape = context.source;
      processOperatorShape = context.target;
      removeTracked(processOperatorShape.businessObject.incoming, connection.businessObject);
      removeTracked(stateShape.businessObject.outgoing, connection.businessObject);
    } else {
      stateShape = context.target;
      processOperatorShape = context.source;
      removeTracked(processOperatorShape.businessObject.outgoing, connection.businessObject);
      removeTracked(stateShape.businessObject.incoming, connection.businessObject);
    }
    removeTracked(stateShape.businessObject.isAssignedTo, processOperatorShape.businessObject);

    // Deep delete in the layers below. Not when the flow is only replaced by one
    // of another type: the state stays connected, and the child layer would lose
    // the state's flows although nothing changed there.
    const replacing = context.hints && context.hints.fpbReplaceConnection;
    if (processOperatorShape.businessObject.decomposedView && !replacing) {
      const decomposedProcesses = [processOperatorShape.businessObject.decomposedView];
      while (decomposedProcesses.length > 0) {
        const decomposedProcess = decomposedProcesses.shift();
        const decomposedProcessSystemLimit = getElementsFromElementsContainer(decomposedProcess.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
        if (!decomposedProcessSystemLimit) continue;
        const stateInDecomposedProcess = getElementById(decomposedProcessSystemLimit.businessObject.elementsContainer, stateShape.id);

        if (!stateInDecomposedProcess) {
          continue;
        }

        const removedFlows = (stateInDecomposedProcess.outgoing || []).concat(stateInDecomposedProcess.incoming || []);

        (stateInDecomposedProcess.outgoing || []).forEach(function (flow) {
          const flowElement = getElementById(decomposedProcessSystemLimit.businessObject.elementsContainer, flow.id);
          removeTracked(decomposedProcessSystemLimit.businessObject.elementsContainer, flowElement);
          if (flow.businessObject.targetRef) {
            removeTracked(flow.businessObject.targetRef.incoming, flow.businessObject);
            if (flow.businessObject.targetRef.decomposedView) {
              decomposedProcesses.push(flow.businessObject.targetRef.decomposedView);
            }
          }
          // Shape references as well. A flow left behind in target.incoming is
          // invisible but still counts as a connection, so canConnect refuses
          // every new connection to that element afterwards.
          if (flow.target) {
            removeTracked(flow.target.incoming, flow);
          }
        });

        (stateInDecomposedProcess.incoming || []).forEach(function (flow) {
          const flowElement = getElementById(decomposedProcessSystemLimit.businessObject.elementsContainer, flow.id);
          removeTracked(decomposedProcessSystemLimit.businessObject.elementsContainer, flowElement);
          if (flow.businessObject.sourceRef) {
            removeTracked(flow.businessObject.sourceRef.outgoing, flow.businessObject);
            if (flow.businessObject.sourceRef.decomposedView) {
              decomposedProcesses.push(flow.businessObject.sourceRef.decomposedView);
            }
          }
          if (flow.source) {
            removeTracked(flow.source.outgoing, flow);
          }
        });
        removeTracked(decomposedProcessSystemLimit.businessObject.elementsContainer, stateInDecomposedProcess);
        removeTracked(decomposedProcess.businessObject.consistsOfStates, stateInDecomposedProcess.businessObject);
        self._unlinkRemovedTandems(removedFlows, decomposedProcessSystemLimit);
      }
    }

    // Partners are taken from inTandemWith itself: looking only at the current
    // source missed a partner whose start had been moved to another element.
    if (isAny(element, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
      (element.businessObject.inTandemWith || []).slice().forEach(function (partner) {
        if (!partner || typeof partner === 'string') {
          return;
        }
        removeTracked(partner.inTandemWith, element.businessObject);
        removeTracked(element.businessObject.inTandemWith, partner);
      });
    }
  }

  if (is(context.source, 'fpb:TechnicalResource') || is(context.target, 'fpb:TechnicalResource')) {
    removeTracked(context.source.businessObject.isAssignedTo, context.target.businessObject);
    removeTracked(context.target.businessObject.isAssignedTo, context.source.businessObject);
    removeTracked(process_rootElement.businessObject.elementsContainer, connection);
    if (context.source.businessObject.outgoing) {
      removeTracked(context.source.businessObject.outgoing, connection.businessObject);
    }
    if (context.target.businessObject.incoming) {
      removeTracked(context.target.businessObject.incoming, connection.businessObject);
    }
  }
};


/**
 * The deep delete in child layers removes flows without a command, so neither
 * the tandem cleanup of _handleDelete nor ReplaceConnectionBehavior runs for them.
 * Unlink the removed flows from their partners and turn a partner left alone
 * back into a plain Flow. Otherwise the partner kept the id of a flow that no
 * longer exists, and a flow drawn again later was linked next to it.
 */
ConnectionUpdater.prototype._unlinkRemovedTandems = function (removedFlows, systemLimit) {
  const self = this;
  const removed = removedFlows.map(function (flow) {
    return flow.businessObject;
  });
  const orphaned = [];

  removed.forEach(function (bo) {
    if (!isAny(bo, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
      return;
    }
    (bo.inTandemWith || []).slice().forEach(function (partner) {
      if (!partner || typeof partner === 'string' || removed.indexOf(partner) !== -1) {
        return;
      }
      removeTracked(partner.inTandemWith, bo);
      removeTracked(bo.inTandemWith, partner);
      collectionAdd(orphaned, partner);
    });
  });

  orphaned.forEach(function (partner) {
    const remaining = (partner.inTandemWith || []).filter(function (other) {
      return other && typeof other !== 'string';
    });
    if (remaining.length === 0) {
      self._replaceWithPlainFlow(getElementById(systemLimit.businessObject.elementsContainer, partner.id), systemLimit);
    }
  });
};

// Swap a connection that is not on the canvas for a plain Flow with the same id.
ConnectionUpdater.prototype._replaceWithPlainFlow = function (connection, systemLimit) {
  if (!connection || !isAny(connection, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
    return;
  }
  const oldBo = connection.businessObject;
  const plain = this._elementFactory.create('connection', {
    type: 'fpb:Flow',
    id: connection.id,
    waypoints: connection.waypoints
  });
  const bo = plain.businessObject;
  Object.keys(oldBo).forEach(function (key) {
    if (['$type', 'id', 'di', 'inTandemWith'].indexOf(key) === -1) {
      bo[key] = oldBo[key];
    }
  });
  if (oldBo.di && oldBo.di.waypoint) {
    bo.di.waypoint = oldBo.di.waypoint;
  }

  const swap = function (collection, oldEntry, newEntry) {
    const idx = removeTracked(collection, oldEntry);
    if (idx !== -1) {
      addTracked(collection, newEntry, idx);
    }
  };
  swap(systemLimit.businessObject.elementsContainer, connection, plain);
  swap(oldBo.sourceRef && oldBo.sourceRef.outgoing, oldBo, bo);
  swap(oldBo.targetRef && oldBo.targetRef.incoming, oldBo, bo);

  const source = connection.source;
  const target = connection.target;
  setTracked(connection, 'source', null);
  setTracked(connection, 'target', null);
  setTracked(plain, 'source', source);
  setTracked(plain, 'target', target);
};

// update existing sourceElement and targetElement di information
ConnectionUpdater.prototype.updateDiConnection = function (di, newSource, newTarget) {
  if (di.sourceElement === undefined) {
    setTracked(di, 'sourceElement', newSource && newSource.di);
  }
  if (di.sourceElement && di.sourceElement.fpbjsElement !== newSource) {
    setTracked(di, 'sourceElement', newSource && newSource.di);
  }
  if (di.targetElement === undefined) {
    setTracked(di, 'targetElement', newTarget && newTarget.di);
  }
  if (di.targetElement && di.targetElement.fpbjsElement !== newTarget) {
    setTracked(di, 'targetElement', newTarget && newTarget.di);
  }
};


ConnectionUpdater.prototype.updateConnectionWaypoints = function (connection) {
  connection.businessObject.di.set('waypoint', this._fpbFactory.createDiWaypoints(connection.waypoints));
};


ConnectionUpdater.prototype.updateConnection = function (context) {
  const connection = context.connection,
    businessObject = getBusinessObject(connection),
    newSource = getBusinessObject(connection.source),
    newTarget = getBusinessObject(connection.target);

  // Connections originating from Product, Energy or Information
  if (is(newSource, 'fpb:State')) {
    if (is(newTarget, 'fpb:ProcessOperator')) {
      const inverseSet = is(businessObject, 'fpb:Flow');
      if (businessObject.sourceRef !== newSource) {
        if (inverseSet) {
          removeTracked(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        setTracked(businessObject, 'sourceRef', newSource);
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          setTracked(businessObject.sourceRef, 'outgoing', []);
        }
        addTracked(businessObject.sourceRef.outgoing, businessObject);
      }

      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          removeTracked(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }
        setTracked(businessObject, 'targetRef', newTarget);
        if (businessObject.targetRef.get('incoming') === undefined) {
          setTracked(businessObject.targetRef, 'incoming', []);
        }
        addTracked(businessObject.targetRef.incoming, businessObject);
      } else {
        addTracked(businessObject.targetRef.incoming, businessObject);
      }
    }
  }

  // Connections originating from ProcessOperator
  if (is(newSource, 'fpb:ProcessOperator')) {
    // TODO: Extract into a separate function (Don't repeat yourself)
    if (is(newTarget, 'fpb:State')) {
      const inverseSet = is(businessObject, 'fpb:Flow');
      if (businessObject.sourceRef !== newSource) {
        if (inverseSet) {
          removeTracked(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        setTracked(businessObject, 'sourceRef', newSource);
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          setTracked(businessObject.sourceRef, 'outgoing', []);
        }
        addTracked(businessObject.sourceRef.outgoing, businessObject);
      } else {
        addTracked(businessObject.sourceRef.outgoing, businessObject);
      }
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          removeTracked(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }
        setTracked(businessObject, 'targetRef', newTarget);
        if (businessObject.targetRef.get('incoming') === undefined) {
          setTracked(businessObject.targetRef, 'incoming', []);
        }
        addTracked(businessObject.targetRef.incoming, businessObject);
      } else {
        addTracked(businessObject.targetRef.incoming, businessObject);
      }
    }

    if (is(newTarget, 'fpb:TechnicalResource')) {
      const inverseSet = is(businessObject, 'fpb:Usage');
      if (businessObject.sourceRef !== newSource) {
        if (inverseSet) {
          removeTracked(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        setTracked(businessObject, 'sourceRef', newSource);
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          setTracked(businessObject.sourceRef, 'outgoing', []);
        }
        addTracked(businessObject.sourceRef.outgoing, businessObject);
      }
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          removeTracked(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }
        setTracked(businessObject, 'targetRef', newTarget);
        if (businessObject.targetRef.get('incoming') === undefined) {
          setTracked(businessObject.targetRef, 'incoming', []);
        }
        if (!Array.isArray(businessObject.targetRef.incoming)) {
          setTracked(businessObject.targetRef, 'incoming', [businessObject.targetRef.incoming]);
        }
        addTracked(businessObject.targetRef.incoming, businessObject);

        if (!Array.isArray(businessObject.targetRef.isAssignedTo)) {
          setTracked(businessObject.targetRef, 'isAssignedTo', businessObject.targetRef.isAssignedTo ? [businessObject.targetRef.isAssignedTo] : []);
        }
        addTracked(businessObject.targetRef.isAssignedTo, businessObject.sourceRef);
      }
    }
  }

  // Connections originating from TechnicalResource
  if (is(newSource, 'fpb:TechnicalResource')) {
    if (is(newTarget, 'fpb:ProcessOperator')) {
      const inverseSet = is(businessObject, 'fpb:Usage');
      if (businessObject.sourceRef !== newSource) {
        if (inverseSet) {
          removeTracked(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        setTracked(businessObject, 'sourceRef', newSource);
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          setTracked(businessObject.sourceRef, 'outgoing', []);
        }
        addTracked(businessObject.sourceRef.outgoing, businessObject);
      }
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          removeTracked(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }

        setTracked(businessObject, 'targetRef', newTarget);
        if (businessObject.targetRef.get('incoming') === undefined) {
          setTracked(businessObject.targetRef, 'incoming', []);
        }
        if (!Array.isArray(businessObject.targetRef.incoming)) {
          setTracked(businessObject.targetRef, 'incoming', [businessObject.targetRef.incoming]);
        }
        addTracked(businessObject.targetRef.incoming, businessObject);
      }
    }
  }

  this.updateConnectionWaypoints(connection);
  this.updateDiConnection(businessObject.di, newSource, newTarget);
};


/////// helpers ///////////////////////////////////


function ifFpb(fn) {
  return function (event) {
    const context = event.context,
      element = context.shape || context.connection;

    if (is(element, 'fpb:BaseElement')) {
      fn(event);
    }
  };
}
