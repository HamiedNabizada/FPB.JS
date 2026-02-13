import inherits from 'inherits';

import { getElementsFromElementsContainer, getElementById, createStateShapeForNewLayer } from '../../help/helpUtils';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

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

  function onConnectionEvent(e) {
    const context = e.context;
    const command = e.command;
    self._handleConnectionCommand(command, context);
  }

  this.executed([
    'connection.create',
    'connection.delete'
  ], ifFpb(onConnectionEvent));

  // NOTE: The revert path for updateProcessInformation was non-functional in the
  // original FpbUpdater.js. Not registering a revert handler preserves that behavior.

  // attach / detach connection (sourceRef/targetRef) //////////////////////

  function updateConnection(e) {
    self.updateConnection(e.context);
  }

  this.executed([
    'connection.create',
    'connection.move',
    'connection.delete',
    'connection.reconnectEnd',
    'connection.reconnectStart'
  ], ifFpb(updateConnection));

  this.reverted([
    'connection.create',
    'connection.move',
    'connection.delete',
    'connection.reconnectEnd',
    'connection.reconnectStart'
  ], ifFpb(updateConnection));

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
    collectionAdd(processSystemLimit.businessObject.elementsContainer, element);

    let stateShape;
    let processOperatorShape;
    if (is(context.source, 'fpb:State')) {
      stateShape = context.source;
      processOperatorShape = context.target;
    } else {
      stateShape = context.target;
      processOperatorShape = context.source;
    }
    collectionAdd(stateShape.businessObject.isAssignedTo, processOperatorShape.businessObject);

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
          collectionAdd(decomposedProcess.businessObject.consistsOfStates, newStateShape.businessObject);
          collectionAdd(childSystemLimit.businessObject.elementsContainer, newStateShape);

          // Set position based on direction (incoming/outgoing)
          const isIncoming = is(context.source, 'fpb:State'); // State -> ProcessOperator = incoming
          const stateWidth = 50;
          const stateSpacing = 20;

          // Count already existing states on the respective boundary
          let existingStatesOnBorder = 0;
          const targetY = isIncoming
            ? childSystemLimit.y - 25  // Upper boundary
            : childSystemLimit.y + childSystemLimit.height - 25;  // Lower boundary

          (childSystemLimit.businessObject.elementsContainer || []).forEach(function(el) {
            if (isAny(el, ['fpb:Product', 'fpb:Energy', 'fpb:Information'])) {
              if (Math.abs(el.y - targetY) < 30) {
                existingStatesOnBorder++;
              }
            }
          });

          const startX = childSystemLimit.x + 50;
          newStateShape.x = startX + (existingStatesOnBorder * (stateWidth + stateSpacing));
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
              flow.businessObject.inTandemWith = [];
            }
            collectionAdd(flow.businessObject.inTandemWith, element.businessObject);
            collectionAdd(element.businessObject.inTandemWith, flow.businessObject);
          }
        });
      }
    }
  }

  // Connection to Technical Resource
  if (is(context.source, 'fpb:TechnicalResource') || is(context.target, 'fpb:TechnicalResource')) {
    collectionAdd(process_rootElement.businessObject.elementsContainer, element);
    if (!Array.isArray(context.source.businessObject.isAssignedTo)) {
      context.source.businessObject.isAssignedTo = [context.source.businessObject.isAssignedTo];
    }
    collectionAdd(context.source.businessObject.isAssignedTo, context.target.businessObject);
    if (!Array.isArray(context.target.businessObject.isAssignedTo)) {
      context.target.businessObject.isAssignedTo = [context.target.businessObject.isAssignedTo];
    }
    collectionAdd(context.target.businessObject.isAssignedTo, context.source.businessObject);
  }
};


ConnectionUpdater.prototype._handleDelete = function (element, context, process_rootElement) {
  const connection = element;

  // Connections to States
  if (is(context.source, 'fpb:State') || is(context.target, 'fpb:State')) {
    const processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
    collectionRemove(processSystemLimit.businessObject.elementsContainer, connection);

    let stateShape;
    let processOperatorShape;
    if (is(context.source, 'fpb:State')) {
      stateShape = context.source;
      processOperatorShape = context.target;
      collectionRemove(processOperatorShape.businessObject.incoming, connection.businessObject);
      collectionRemove(stateShape.businessObject.outgoing, connection.businessObject);
    } else {
      stateShape = context.target;
      processOperatorShape = context.source;
      collectionRemove(processOperatorShape.businessObject.outgoing, connection.businessObject);
      collectionRemove(stateShape.businessObject.incoming, connection.businessObject);
    }
    collectionRemove(stateShape.businessObject.isAssignedTo, processOperatorShape.businessObject);

    // Deep delete in the layers below
    if (processOperatorShape.businessObject.decomposedView) {
      const decomposedProcesses = [processOperatorShape.businessObject.decomposedView];
      while (decomposedProcesses.length > 0) {
        const decomposedProcess = decomposedProcesses.shift();
        const decomposedProcessSystemLimit = getElementsFromElementsContainer(decomposedProcess.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
        const stateInDecomposedProcess = getElementById(decomposedProcessSystemLimit.businessObject.elementsContainer, stateShape.id);

        if (!stateInDecomposedProcess) {
          continue;
        }

        (stateInDecomposedProcess.outgoing || []).forEach(function (flow) {
          const flowElement = getElementById(decomposedProcessSystemLimit.businessObject.elementsContainer, flow.id);
          collectionRemove(decomposedProcessSystemLimit.businessObject.elementsContainer, flowElement);
          collectionRemove(flow.businessObject.targetRef.incoming, flow.businessObject);
          if (flow.businessObject.targetRef.decomposedView) {
            decomposedProcesses.push(flow.businessObject.targetRef.decomposedView);
          }
        });

        (stateInDecomposedProcess.incoming || []).forEach(function (flow) {
          collectionRemove(decomposedProcessSystemLimit.businessObject.elementsContainer, flow);
          collectionRemove(flow.businessObject.sourceRef.outgoing, flow.businessObject);
          if (flow.businessObject.sourceRef.decomposedView) {
            decomposedProcesses.push(flow.businessObject.sourceRef.decomposedView);
          }
        });
        collectionRemove(decomposedProcessSystemLimit.businessObject.elementsContainer, stateInDecomposedProcess);
        collectionRemove(decomposedProcess.businessObject.consistsOfStates, stateInDecomposedProcess.businessObject);
      }
    }

    if (isAny(element, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
      (context.source.outgoing || []).forEach(function (flow) {
        if (flow !== element) {
          if (isAny(flow, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
            if (flow.businessObject.inTandemWith) {
              collectionRemove(flow.businessObject.inTandemWith, element);
            }
            if (element.businessObject.inTandemWith) {
              collectionRemove(element.businessObject.inTandemWith, flow);
            }
          }
        }
      });
    }
  }

  if (is(context.source, 'fpb:TechnicalResource') || is(context.target, 'fpb:TechnicalResource')) {
    collectionRemove(context.source.businessObject.isAssignedTo, context.target.businessObject);
    collectionRemove(context.target.businessObject.isAssignedTo, context.source.businessObject);
    collectionRemove(process_rootElement.businessObject.elementsContainer, connection);
    if (context.source.businessObject.outgoing) {
      collectionRemove(context.source.businessObject.outgoing, connection.businessObject);
    }
    if (context.target.businessObject.incoming) {
      collectionRemove(context.target.businessObject.incoming, connection.businessObject);
    }
  }
};


// update existing sourceElement and targetElement di information
ConnectionUpdater.prototype.updateDiConnection = function (di, newSource, newTarget) {
  if (di.sourceElement === undefined) {
    di.sourceElement = newSource && newSource.di;
  }
  if (di.sourceElement && di.sourceElement.fpbjsElement !== newSource) {
    di.sourceElement = newSource && newSource.di;
  }
  if (di.targetElement === undefined) {
    di.targetElement = newTarget && newTarget.di;
  }
  if (di.targetElement && di.targetElement.fpbjsElement !== newTarget) {
    di.targetElement = newTarget && newTarget.di;
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
          collectionRemove(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        businessObject.sourceRef = newSource;
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          businessObject.sourceRef.outgoing = [];
        }
        collectionAdd(businessObject.sourceRef.outgoing, businessObject);
      }

      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          collectionRemove(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }
        businessObject.targetRef = newTarget;
        if (businessObject.targetRef.get('incoming') === undefined) {
          businessObject.targetRef.incoming = [];
        }
        businessObject.targetRef.incoming.push(businessObject);
      } else {
        collectionAdd(businessObject.targetRef.incoming, businessObject);
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
          collectionRemove(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        businessObject.sourceRef = newSource;
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          businessObject.sourceRef.outgoing = [];
        }
        businessObject.sourceRef.outgoing.push(businessObject);
      } else {
        collectionAdd(businessObject.sourceRef.outgoing, businessObject);
      }
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          collectionRemove(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }
        businessObject.targetRef = newTarget;
        if (businessObject.targetRef.get('incoming') === undefined) {
          businessObject.targetRef.incoming = [];
        }
        businessObject.targetRef.incoming.push(businessObject);
      } else {
        collectionAdd(businessObject.targetRef.incoming, businessObject);
      }
    }

    if (is(newTarget, 'fpb:TechnicalResource')) {
      const inverseSet = is(businessObject, 'fpb:Usage');
      if (businessObject.sourceRef !== newSource) {
        if (inverseSet) {
          collectionRemove(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        businessObject.sourceRef = newSource;
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          businessObject.sourceRef.outgoing = [];
        }
        businessObject.sourceRef.outgoing.push(businessObject);
      }
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          collectionRemove(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }
        businessObject.targetRef = newTarget;
        if (businessObject.targetRef.get('incoming') === undefined) {
          businessObject.targetRef.incoming = [];
        }
        if (!Array.isArray(businessObject.targetRef.incoming)) {
          businessObject.targetRef.incoming = [businessObject.targetRef.incoming];
        }
        collectionAdd(businessObject.targetRef.incoming, businessObject);
        businessObject.targetRef = newTarget;

        if (!Array.isArray(businessObject.targetRef.isAssignedTo)) {
          businessObject.targetRef.isAssignedTo = [businessObject.targetRef.isAssignedTo];
        }
        collectionAdd(businessObject.targetRef.isAssignedTo, businessObject.sourceRef);
      }
    }
  }

  // Connections originating from TechnicalResource
  if (is(newSource, 'fpb:TechnicalResource')) {
    if (is(newTarget, 'fpb:ProcessOperator')) {
      const inverseSet = is(businessObject, 'fpb:Usage');
      if (businessObject.sourceRef !== newSource) {
        if (inverseSet) {
          collectionRemove(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        businessObject.sourceRef = newSource;
        businessObject.sourceRef.outgoing.push(businessObject);
      }
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          collectionRemove(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }

        businessObject.targetRef = newTarget;
        if (businessObject.targetRef.get('incoming') === undefined) {
          businessObject.targetRef.incoming = [];
        }
        if (!Array.isArray(businessObject.targetRef.incoming)) {
          businessObject.targetRef.incoming = [businessObject.targetRef.incoming];
        }
        collectionAdd(businessObject.targetRef.incoming, businessObject);
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
