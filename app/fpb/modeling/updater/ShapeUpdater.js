import inherits from 'inherits';

import { getElementsFromElementsContainer, getElementById, checkIfOnSystemBorder } from '../../help/helpUtils';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import {
  add as collectionAdd,
  remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

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
  eventBus, fpbFactory, canvas, elementFactory, config) {

  CommandInterceptor.call(this, eventBus);

  this._fpbFactory = fpbFactory;
  this._canvas = canvas;
  this._elementFactory = elementFactory;
  this._config = config;
  this._eventBus = eventBus;

  const self = this;

  function onShapeEvent(e) {
    const context = e.context;
    const command = e.command;
    self._handleShapeCommand(command, context);
  }

  this.executed([
    'shape.move',
    'shape.create',
    'shape.delete'
  ], ifFpb(onShapeEvent));

  // NOTE: The revert path for updateProcessInformation was non-functional in the
  // original FpbUpdater.js (reverseUpdateProcessInformation passed wrong argument types).
  // Not registering a revert handler here preserves that behavior.
}

inherits(ShapeUpdater, CommandInterceptor);

ShapeUpdater.$inject = [
  'eventBus',
  'fpbFactory',
  'canvas',
  'elementFactory',
  'config.configFile'
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
  // Prüfen ob aktuelles Rootelement ein Process ist, falls ja befinden wir uns in der
  // initialen Modellierung und ein Process wird dafür angelegt.
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

    // Neuer Process als RootElement des Canvas setzen
    this._canvas.setRootElement(process_rootElement, true);
    element.parent = process_rootElement;
    fpbjs.setProjectDefinition(projectDefintion);

    this._eventBus.fire('dataStore.newProcess', {
      newProcess: process_rootElement,
      parentProcess: null
    });
    this._eventBus.fire('layerPanel.newProcess', {
      newProcess: process_rootElement,
      parentProcess: null
    });
  }

  // ProcessOperatoren und States werden in den elementsContainer des SystemLimits geschoben
  if (isAny(element, ['fpb:State', 'fpb:ProcessOperator'])) {
    const processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
    collectionAdd(processSystemLimit.businessObject.elementsContainer, element);
    if (is(element, 'fpb:State')) {
      collectionAdd(process_rootElement.businessObject.consistsOfStates, element.businessObject);

      // Szenario 4: Wenn State auf Systemgrenze eines Child-Layers platziert wird,
      // Bestätigungsdialog anzeigen
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
      collectionAdd(process_rootElement.businessObject.consistsOfProcessOperator, element.businessObject);
    }
  }

  // SystemLimit und TechnicalResource im elementsContainer vom Process
  if (isAny(element, ['fpb:TechnicalResource', 'fpb:SystemLimit'])) {
    collectionAdd(process_rootElement.businessObject.elementsContainer, element);
    if (is(element, 'fpb:SystemLimit')) {
      process_rootElement.businessObject.consistsOfSystemLimit = element.businessObject;
    }
  }
};


ShapeUpdater.prototype._handleDelete = function (element, process_rootElement) {
  // Gelöschtes Element ist ein State oder ProcessOperator
  if (isAny(element, ['fpb:State', 'fpb:ProcessOperator'])) {
    const processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
    collectionRemove(processSystemLimit.businessObject.elementsContainer, element);

    if (is(element, 'fpb:State')) {
      collectionRemove(process_rootElement.businessObject.consistsOfStates, element.businessObject);

      // Layer-Konsistenz: State-Löschung auf Child-Layer propagieren
      const connectedDecomposedProcesses = [];
      element.businessObject.isAssignedTo?.forEach(function(processOperator) {
        if (processOperator.decomposedView) {
          connectedDecomposedProcesses.push(processOperator.decomposedView);
        }
      });

      // Rekursiv durch alle Child-Layer gehen und den State dort auch löschen
      while (connectedDecomposedProcesses.length > 0) {
        const childProcess = connectedDecomposedProcesses.shift();
        const childSystemLimit = getElementsFromElementsContainer(childProcess.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
        if (childSystemLimit && childSystemLimit.businessObject.elementsContainer) {
          const stateInChild = getElementById(childSystemLimit.businessObject.elementsContainer, element.businessObject.id);
          if (stateInChild) {
            // Flows des States im Child-Layer löschen
            if (stateInChild.outgoing) {
              stateInChild.outgoing.forEach(function(flow) {
                collectionRemove(childSystemLimit.businessObject.elementsContainer, flow);
                if (flow.businessObject.targetRef) {
                  collectionRemove(flow.businessObject.targetRef.incoming, flow.businessObject);
                  if (flow.businessObject.targetRef.decomposedView) {
                    connectedDecomposedProcesses.push(flow.businessObject.targetRef.decomposedView);
                  }
                }
              });
            }
            if (stateInChild.incoming) {
              stateInChild.incoming.forEach(function(flow) {
                collectionRemove(childSystemLimit.businessObject.elementsContainer, flow);
                if (flow.businessObject.sourceRef) {
                  collectionRemove(flow.businessObject.sourceRef.outgoing, flow.businessObject);
                  if (flow.businessObject.sourceRef.decomposedView) {
                    connectedDecomposedProcesses.push(flow.businessObject.sourceRef.decomposedView);
                  }
                }
              });
            }
            // State aus Child-Layer entfernen
            collectionRemove(childSystemLimit.businessObject.elementsContainer, stateInChild);
            collectionRemove(childProcess.businessObject.consistsOfStates, stateInChild.businessObject);
          }
        }
      }

      // Layer-Konsistenz: Nur die Connection auf dem Parent-Layer entfernen (State bleibt!)
      if (process_rootElement.businessObject.isDecomposedProcessOperator) {
        const parentProcessOperator = process_rootElement.businessObject.isDecomposedProcessOperator;
        const parentProcess = process_rootElement.businessObject.parent;

        if (parentProcess) {
          const parentSystemLimit = getElementsFromElementsContainer(
            parentProcess.businessObject.elementsContainer,
            'fpb:SystemLimit'
          )[0];

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
                collectionRemove(parentSystemLimit.businessObject.elementsContainer, flow);
                collectionRemove(parentState.businessObject.outgoing, flow.businessObject);
                collectionRemove(parentState.businessObject.incoming, flow.businessObject);
                collectionRemove(parentProcessOperator.outgoing, flow.businessObject);
                collectionRemove(parentProcessOperator.incoming, flow.businessObject);
                collectionRemove(parentState.businessObject.isAssignedTo, parentProcessOperator);

                // Shape-Referenzen entfernen
                collectionRemove(parentState.outgoing, flow);
                collectionRemove(parentState.incoming, flow);
                if (parentProcessOperatorShape) {
                  collectionRemove(parentProcessOperatorShape.outgoing, flow);
                  collectionRemove(parentProcessOperatorShape.incoming, flow);
                }
              });
            }
          }
        }
      }
    } else {
      collectionRemove(process_rootElement.businessObject.consistsOfProcessOperator, element.businessObject);
      // Falls ProcessOperator dekomponiert gewesen ist
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
        collectionRemove(process_rootElement.businessObject.consistsOfProcesses, element.businessObject.decomposedView);
      }
    }
  }

  if (isAny(element, ['fpb:TechnicalResource', 'fpb:SystemLimit'])) {
    collectionRemove(process_rootElement.businessObject.elementsContainer, element);
    if (is(element, 'fpb:SystemLimit')) {
      process_rootElement.businessObject.consistsOfSystemLimit = null;
      process_rootElement.businessObject.consistsOfStates = [];
      process_rootElement.businessObject.consistsOfProcesses = [];
      process_rootElement.businessObject.consistsOfProcessOperator = [];
    }
  }
};


ShapeUpdater.prototype._handleMove = function (element, process_rootElement, context) {
  if (isAny(element, ['fpb:State', 'fpb:ProcessOperator'])) {
    const processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
    const elementFromElementsContainer = getElementById(processSystemLimit.businessObject.elementsContainer, element.businessObject.id);
    // Sonst gibts Probleme wenn zwischen den Layern geswitched wird
    collectionRemove(processSystemLimit.businessObject.elementsContainer, elementFromElementsContainer);
    collectionAdd(processSystemLimit.businessObject.elementsContainer, element);
  }

  if (isAny(element, ['fpb:SystemLimit', 'fpb:TechnicalResource'])) {
    const elementFromElementsContainer = getElementById(process_rootElement.businessObject.elementsContainer, element.businessObject.id);
    collectionRemove(process_rootElement.businessObject.elementsContainer, elementFromElementsContainer);
    collectionAdd(process_rootElement.businessObject.elementsContainer, element);
  }

  // Szenario 6: Interner State wird zur Systemgrenze verschoben
  if (isAny(element, ['fpb:Product', 'fpb:Energy', 'fpb:Information'])) {
    if (process_rootElement.businessObject.isDecomposedProcessOperator) {
      const processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];

      if (processSystemLimit && context.delta) {
        // Berechne alte Position
        const oldX = element.x - context.delta.x;
        const oldY = element.y - context.delta.y;
        const oldElement = { x: oldX, y: oldY, width: element.width, height: element.height };

        const wasOnBorder = checkIfOnSystemBorder(processSystemLimit, oldElement);
        const isNowOnBorder = checkIfOnSystemBorder(processSystemLimit, element);

        // Nur wenn State von innen zur Grenze verschoben wurde
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
