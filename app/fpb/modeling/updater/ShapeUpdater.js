import inherits from 'inherits';

import { getElementById, checkIfOnSystemBorder, getSystemLimit } from '../../help/helpUtils';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import {
  runJournaled,
  revertJournal,
  addTracked,
  removeTracked,
  setTracked,
  onRevert
} from './ModelJournal';

import {
  isLabel
} from 'diagram-js/lib/util/ModelUtil';

import {
  is,
  isAny
} from '../../help/utils';


/**
 * Handles business-model updates for shape events:
 * - shape.create: Process initialization, elementsContainer, Szenario 4 (boundary detection)
 * - shape.delete: State/PO/SL/TR removal, cascading layer sync
 * - shape.move: elementsContainer update, Szenario 6 (boundary move detection)
 */
export default function ShapeUpdater(
  eventBus, fpbFactory, canvas, elementFactory, config, fpbjs) {

  CommandInterceptor.call(this, eventBus);

  this._fpbFactory = fpbFactory;
  this._canvas = canvas;
  this._elementFactory = elementFactory;
  this._config = config;
  this._eventBus = eventBus;
  this._fpbjs = fpbjs;

  const self = this;

  // Model changes are journaled in the command context and replayed backwards
  // on undo (see ModelJournal). Before, undo moved the shapes back but left the
  // model as it was: an undone create stayed in the export, an undone delete
  // was missing there, and the layers below kept what the delete had removed.
  function onShapeEvent(e) {
    const context = e.context;
    const command = e.command;
    context.fpbJournal = runJournaled(function () {
      self._handleShapeCommand(command, context);
    });
  }

  this.executed([
    'shape.move',
    'shape.create',
    'shape.delete'
  ], ifFpb(onShapeEvent));

  this.reverted([
    'shape.move',
    'shape.create',
    'shape.delete'
  ], ifFpb(function (e) {
    revertJournal(e.context.fpbJournal);
  }));
}

inherits(ShapeUpdater, CommandInterceptor);

ShapeUpdater.$inject = [
  'eventBus',
  'fpbFactory',
  'canvas',
  'elementFactory',
  'config.configFile',
  'fpbjs'
];


ShapeUpdater.prototype._handleShapeCommand = function (command, context) {
  const element = context.shape;
  const process_rootElement = this._canvas.getRootElement();

  if (isLabel(element)) {
    return;
  }

  if (command === 'shape.create') {
    this._handleCreate(element, process_rootElement);
  }

  if (command === 'shape.delete') {
    this._handleDelete(element, process_rootElement);
  }

  if (command === 'shape.move') {
    this._handleMove(element, process_rootElement, context);
  }
};


ShapeUpdater.prototype._handleCreate = function (element, process_rootElement) {
  // Check if current root element is a Process; if not, we are in the
  // initial modeling phase and a Process needs to be created.
  if (!is(process_rootElement, 'fpb:Process') && !(process_rootElement.type === 'fpb:Process')) {

    process_rootElement = this._elementFactory.create('root', { type: 'fpb:Process' });

    const projectDefintion = this._fpbFactory.create('fpb:Project', {
      name: this._config.ProjectDefintion.name,
      targetNamespace: this._config.ProjectDefintion.targetNamespace,
      entryPoint: process_rootElement
    });
    this._eventBus.fire('dataStore.addedProjectDefinition', {
      projectDefinition: projectDefintion
    });
    process_rootElement.businessObject.ProjectAssignment = projectDefintion;
    process_rootElement.businessObject.parent = projectDefintion;

    // Set new Process as root element of the canvas
    this._canvas.setRootElement(process_rootElement, true);
    element.parent = process_rootElement;
    this._fpbjs.setProjectDefinition(projectDefintion);

    this._eventBus.fire('dataStore.newProcess', {
      newProcess: process_rootElement,
      parentProcess: null
    });
    this._eventBus.fire('layerPanel.newProcess', {
      newProcess: process_rootElement,
      parentProcess: null
    });
  }

  // ProcessOperators and States are added to the SystemLimit's elementsContainer
  if (isAny(element, ['fpb:State', 'fpb:ProcessOperator'])) {
    const processSystemLimit = getSystemLimit(process_rootElement);
    if (!processSystemLimit) return;
    addTracked(processSystemLimit.businessObject.elementsContainer, element);
    if (is(element, 'fpb:State')) {
      addTracked(process_rootElement.businessObject.consistsOfStates, element.businessObject);

      // Scenario 4: If a State is placed on the system boundary of a child layer,
      // show a confirmation dialog
      if (process_rootElement.businessObject.isDecomposedProcessOperator) {
        const borderPosition = checkIfOnSystemBorder(processSystemLimit, element);
        if (borderPosition === 'onUpperBorder' || borderPosition === 'onBottomBorder') {
          this._eventBus.fire('confirmation.required', {
            title: 'Confirm boundary placement',
            message: 'This state will become an input/output of the parent process operator.',
            details: 'The state will be created on the parent process and connected to the process operator.',
            isBlocked: false,
            action: {
              type: 'create_on_boundary',
              element: element,
              borderPosition: borderPosition,
              processRootElement: process_rootElement
            }
          });
        }
      }
    } else {
      addTracked(process_rootElement.businessObject.consistsOfProcessOperator, element.businessObject);
    }
  }

  // SystemLimit and TechnicalResource in the Process's elementsContainer
  if (isAny(element, ['fpb:TechnicalResource', 'fpb:SystemLimit'])) {
    addTracked(process_rootElement.businessObject.elementsContainer, element);
    if (is(element, 'fpb:SystemLimit')) {
      setTracked(process_rootElement.businessObject, 'consistsOfSystemLimit', element.businessObject);
    }
  }
};


ShapeUpdater.prototype._handleDelete = function (element, process_rootElement) {
  // Deleted element is a State or ProcessOperator
  if (isAny(element, ['fpb:State', 'fpb:ProcessOperator'])) {
    const processSystemLimit = getSystemLimit(process_rootElement);
    if (!processSystemLimit) return;
    removeTracked(processSystemLimit.businessObject.elementsContainer, element);

    if (is(element, 'fpb:State')) {
      removeTracked(process_rootElement.businessObject.consistsOfStates, element.businessObject);

      // Layer consistency: Propagate state deletion to child layers
      const connectedDecomposedProcesses = [];
      element.businessObject.isAssignedTo?.forEach(function(processOperator) {
        if (processOperator.decomposedView) {
          connectedDecomposedProcesses.push(processOperator.decomposedView);
        }
      });

      // Recursively traverse all child layers and delete the state there as well
      while (connectedDecomposedProcesses.length > 0) {
        const childProcess = connectedDecomposedProcesses.shift();
        const childSystemLimit = getSystemLimit(childProcess);
        if (childSystemLimit && childSystemLimit.businessObject.elementsContainer) {
          const stateInChild = getElementById(childSystemLimit.businessObject.elementsContainer, element.businessObject.id);
          if (stateInChild) {
            // Delete the state's flows in the child layer
            if (stateInChild.outgoing) {
              stateInChild.outgoing.forEach(function(flow) {
                removeTracked(childSystemLimit.businessObject.elementsContainer, flow);
                if (flow.businessObject.targetRef) {
                  removeTracked(flow.businessObject.targetRef.incoming, flow.businessObject);
                  if (flow.businessObject.targetRef.decomposedView) {
                    connectedDecomposedProcesses.push(flow.businessObject.targetRef.decomposedView);
                  }
                }
                // Shape references as well. A flow left in target.incoming is
                // invisible but still counts as a connection, and canConnect
                // then refuses every new connection to that element.
                if (flow.target) {
                  removeTracked(flow.target.incoming, flow);
                }
              });
            }
            if (stateInChild.incoming) {
              stateInChild.incoming.forEach(function(flow) {
                removeTracked(childSystemLimit.businessObject.elementsContainer, flow);
                if (flow.businessObject.sourceRef) {
                  removeTracked(flow.businessObject.sourceRef.outgoing, flow.businessObject);
                  if (flow.businessObject.sourceRef.decomposedView) {
                    connectedDecomposedProcesses.push(flow.businessObject.sourceRef.decomposedView);
                  }
                }
                if (flow.source) {
                  removeTracked(flow.source.outgoing, flow);
                }
              });
            }
            // Remove state from child layer
            removeTracked(childSystemLimit.businessObject.elementsContainer, stateInChild);
            removeTracked(childProcess.businessObject.consistsOfStates, stateInChild.businessObject);
          }
        }
      }

      // Layer consistency: Only remove the connection on the parent layer (state stays!)
      if (process_rootElement.businessObject.isDecomposedProcessOperator) {
        const parentProcessOperator = process_rootElement.businessObject.isDecomposedProcessOperator;
        const parentProcess = process_rootElement.businessObject.parent;

        if (parentProcess) {
          const parentSystemLimit = getSystemLimit(parentProcess);

          if (parentSystemLimit) {
            const parentState = getElementById(
              parentSystemLimit.businessObject.elementsContainer,
              element.businessObject.id
            );

            const parentProcessOperatorShape = getElementById(
              parentSystemLimit.businessObject.elementsContainer,
              parentProcessOperator.id
            );

            if (parentState) {
              const flowsToRemove = [];
              if (parentState.outgoing) {
                parentState.outgoing.forEach(function(flow) {
                  if (flow.businessObject.targetRef === parentProcessOperator) {
                    flowsToRemove.push(flow);
                  }
                });
              }
              if (parentState.incoming) {
                parentState.incoming.forEach(function(flow) {
                  if (flow.businessObject.sourceRef === parentProcessOperator) {
                    flowsToRemove.push(flow);
                  }
                });
              }

              flowsToRemove.forEach(function(flow) {
                removeTracked(parentSystemLimit.businessObject.elementsContainer, flow);
                removeTracked(parentState.businessObject.outgoing, flow.businessObject);
                removeTracked(parentState.businessObject.incoming, flow.businessObject);
                removeTracked(parentProcessOperator.outgoing, flow.businessObject);
                removeTracked(parentProcessOperator.incoming, flow.businessObject);
                removeTracked(parentState.businessObject.isAssignedTo, parentProcessOperator);

                // Remove shape references
                removeTracked(parentState.outgoing, flow);
                removeTracked(parentState.incoming, flow);
                if (parentProcessOperatorShape) {
                  removeTracked(parentProcessOperatorShape.outgoing, flow);
                  removeTracked(parentProcessOperatorShape.incoming, flow);
                }
              });
            }
          }
        }
      }
    } else {
      removeTracked(process_rootElement.businessObject.consistsOfProcessOperator, element.businessObject);
      // If ProcessOperator had been decomposed
      if (element.businessObject.decomposedView) {
        this._eventBus.fire('toolTips.decomposedProcessOperator', {
          command: 'deleted',
          processOperator: element
        });

        this._eventBus.fire('dataStore.processDeleted', {
          deletedProcess: element.businessObject.decomposedView
        });
        this._eventBus.fire('layerPanel.processDeleted', {
          deletedProcess: element.businessObject.decomposedView
        });
        const eventBus = this._eventBus;
        const deletedProcess = element.businessObject.decomposedView;
        const canvas = this._canvas;
        onRevert(function () {
          eventBus.fire('dataStore.newProcess', { newProcess: deletedProcess, parentProcess: process_rootElement });
          eventBus.fire('layerPanel.newProcess', { newProcess: deletedProcess, parentProcess: process_rootElement });
          // layerPanel.newProcess selects the process it announces; the canvas stays here.
          eventBus.fire('layerPanel.processSwitched', { selectedProcess: canvas.getRootElement() });
        });
        removeTracked(process_rootElement.businessObject.consistsOfProcesses, element.businessObject.decomposedView);
      }
    }
  }

  if (isAny(element, ['fpb:TechnicalResource', 'fpb:SystemLimit'])) {
    removeTracked(process_rootElement.businessObject.elementsContainer, element);
    if (is(element, 'fpb:SystemLimit')) {
      setTracked(process_rootElement.businessObject, 'consistsOfSystemLimit', null);
      setTracked(process_rootElement.businessObject, 'consistsOfStates', []);
      setTracked(process_rootElement.businessObject, 'consistsOfProcesses', []);
      setTracked(process_rootElement.businessObject, 'consistsOfProcessOperator', []);
    }
  }
};


ShapeUpdater.prototype._handleMove = function (element, process_rootElement, context) {
  if (isAny(element, ['fpb:State', 'fpb:ProcessOperator'])) {
    const processSystemLimit = getSystemLimit(process_rootElement);
    if (processSystemLimit) {
      const elementFromElementsContainer = getElementById(processSystemLimit.businessObject.elementsContainer, element.businessObject.id);
      // Otherwise there are issues when switching between layers
      removeTracked(processSystemLimit.businessObject.elementsContainer, elementFromElementsContainer);
      addTracked(processSystemLimit.businessObject.elementsContainer, element);
    }
  }

  if (isAny(element, ['fpb:SystemLimit', 'fpb:TechnicalResource'])) {
    const elementFromElementsContainer = getElementById(process_rootElement.businessObject.elementsContainer, element.businessObject.id);
    removeTracked(process_rootElement.businessObject.elementsContainer, elementFromElementsContainer);
    addTracked(process_rootElement.businessObject.elementsContainer, element);
  }

  // Scenario 6: Internal state is moved to the system boundary
  if (isAny(element, ['fpb:Product', 'fpb:Energy', 'fpb:Information'])) {
    if (process_rootElement.businessObject.isDecomposedProcessOperator) {
      const processSystemLimit = getSystemLimit(process_rootElement);

      if (processSystemLimit && context.delta) {
        // Calculate old position
        const oldX = element.x - context.delta.x;
        const oldY = element.y - context.delta.y;
        const oldElement = { x: oldX, y: oldY, width: element.width, height: element.height };

        const wasOnBorder = checkIfOnSystemBorder(processSystemLimit, oldElement);
        const isNowOnBorder = checkIfOnSystemBorder(processSystemLimit, element);

        // Only if state was moved from inside to the boundary
        if (!wasOnBorder && (isNowOnBorder === 'onUpperBorder' || isNowOnBorder === 'onBottomBorder')) {
          this._eventBus.fire('confirmation.required', {
            title: 'Confirm boundary placement',
            message: 'This state will become an input/output of the parent process operator.',
            details: 'The state will be created on the parent process and connected to the process operator.',
            isBlocked: false,
            action: {
              type: 'move_to_boundary',
              element: element,
              oldPosition: { x: oldX, y: oldY },
              borderPosition: isNowOnBorder,
              processRootElement: process_rootElement
            }
          });
        }
      }
    }
  }
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
