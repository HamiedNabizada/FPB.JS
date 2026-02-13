import { getElementsFromElementsContainer, getElementById, createStateShapeForNewLayer } from '../../help/helpUtils';

import {
  add as collectionAdd,
  remove as collectionRemove
} from 'diagram-js/lib/util/Collections';


/**
 * Handles confirmation dialogs for layer-consistency scenarios.
 *
 * - Szenario 4 & 6: State on boundary (create/move) - confirmed/cancelled
 * - Szenario 14/12: SystemLimit deletion - request/confirm
 */
export default function ConfirmationHandler(eventBus, modeling, elementFactory) {

  // Scenario 4 & 6: State created/moved on boundary - confirmation
  eventBus.on('confirmation.confirmed', function(event) {
    if (event.action && (event.action.type === 'move_to_boundary' || event.action.type === 'create_on_boundary')) {
      const element = event.action.element;
      const borderPosition = event.action.borderPosition;
      const processRootElement = event.action.processRootElement;

      // Update parent layer (create State + Connection)
      const parentProcessOperator = processRootElement.businessObject.isDecomposedProcessOperator;
      const parentProcess = processRootElement.businessObject.parent;

      if (parentProcess) {
        const parentSystemLimit = getElementsFromElementsContainer(
          parentProcess.businessObject.elementsContainer,
          'fpb:SystemLimit'
        )[0];

        if (parentSystemLimit) {
          // Check if state already exists on parent layer
          let existingParentState = getElementById(
            parentSystemLimit.businessObject.elementsContainer,
            element.businessObject.id
          );

          if (!existingParentState) {
            // Create state on parent layer
            const parentStateShape = createStateShapeForNewLayer(
              elementFactory,
              element.businessObject.$type,
              element.businessObject
            );
            collectionAdd(parentProcess.businessObject.consistsOfStates, parentStateShape.businessObject);
            collectionAdd(parentSystemLimit.businessObject.elementsContainer, parentStateShape);

            // Set position next to the ProcessOperator
            const parentPOShape = getElementById(
              parentSystemLimit.businessObject.elementsContainer,
              parentProcessOperator.id
            );
            if (parentPOShape) {
              if (borderPosition === 'onUpperBorder') {
                parentStateShape.x = parentPOShape.x + (parentPOShape.width / 2) - 25;
                parentStateShape.y = parentPOShape.y - 100;
              } else {
                parentStateShape.x = parentPOShape.x + (parentPOShape.width / 2) - 25;
                parentStateShape.y = parentPOShape.y + parentPOShape.height + 50;
              }
            }
            existingParentState = parentStateShape;
          }

          // Create connection between State and ProcessOperator on parent layer
          let connectionExists = false;
          const parentPOShape = getElementById(
            parentSystemLimit.businessObject.elementsContainer,
            parentProcessOperator.id
          );

          if (existingParentState.outgoing) {
            existingParentState.outgoing.forEach(function(flow) {
              if (flow.businessObject.targetRef === parentProcessOperator) {
                connectionExists = true;
              }
            });
          }
          if (existingParentState.incoming) {
            existingParentState.incoming.forEach(function(flow) {
              if (flow.businessObject.sourceRef === parentProcessOperator) {
                connectionExists = true;
              }
            });
          }

          if (!connectionExists && parentPOShape) {
            // Calculate waypoints
            const sourceShape = borderPosition === 'onUpperBorder' ? existingParentState : parentPOShape;
            const targetShape = borderPosition === 'onUpperBorder' ? parentPOShape : existingParentState;

            const sourceCenter = {
              x: sourceShape.x + (sourceShape.width || 50) / 2,
              y: sourceShape.y + (sourceShape.height || 50) / 2
            };
            const targetCenter = {
              x: targetShape.x + (targetShape.width || 50) / 2,
              y: targetShape.y + (targetShape.height || 50) / 2
            };

            const newFlow = elementFactory.createConnection({
              type: 'fpb:Flow',
              source: sourceShape,
              target: targetShape,
              waypoints: [sourceCenter, targetCenter]
            });

            collectionAdd(parentSystemLimit.businessObject.elementsContainer, newFlow);

            // Set BusinessObject references
            if (borderPosition === 'onUpperBorder') {
              newFlow.businessObject.sourceRef = existingParentState.businessObject;
              newFlow.businessObject.targetRef = parentProcessOperator;
              if (!existingParentState.businessObject.outgoing) existingParentState.businessObject.outgoing = [];
              if (!parentProcessOperator.incoming) parentProcessOperator.incoming = [];
              collectionAdd(existingParentState.businessObject.outgoing, newFlow.businessObject);
              collectionAdd(parentProcessOperator.incoming, newFlow.businessObject);
            } else {
              newFlow.businessObject.sourceRef = parentProcessOperator;
              newFlow.businessObject.targetRef = existingParentState.businessObject;
              if (!parentProcessOperator.outgoing) parentProcessOperator.outgoing = [];
              if (!existingParentState.businessObject.incoming) existingParentState.businessObject.incoming = [];
              collectionAdd(parentProcessOperator.outgoing, newFlow.businessObject);
              collectionAdd(existingParentState.businessObject.incoming, newFlow.businessObject);
            }

            // Set shape references
            if (borderPosition === 'onUpperBorder') {
              if (!existingParentState.outgoing) existingParentState.outgoing = [];
              if (!parentPOShape.incoming) parentPOShape.incoming = [];
              collectionAdd(existingParentState.outgoing, newFlow);
              collectionAdd(parentPOShape.incoming, newFlow);
            } else {
              if (!parentPOShape.outgoing) parentPOShape.outgoing = [];
              if (!existingParentState.incoming) existingParentState.incoming = [];
              collectionAdd(parentPOShape.outgoing, newFlow);
              collectionAdd(existingParentState.incoming, newFlow);
            }

            // Update isAssignedTo
            if (!existingParentState.businessObject.isAssignedTo) existingParentState.businessObject.isAssignedTo = [];
            collectionAdd(existingParentState.businessObject.isAssignedTo, parentProcessOperator);
          }
        }
      }
    }
  });

  // Scenario 6: State moved to boundary - rejection
  // Scenario 4: State created on boundary - rejection
  eventBus.on('confirmation.cancelled', function(event) {
    if (event.action && event.action.type === 'move_to_boundary') {
      const element = event.action.element;
      const oldPosition = event.action.oldPosition;

      // Move state back to old position
      const deltaX = oldPosition.x - element.x;
      const deltaY = oldPosition.y - element.y;
      modeling.moveShape(element, { x: deltaX, y: deltaY });
    }

    if (event.action && event.action.type === 'create_on_boundary') {
      const element = event.action.element;

      // Delete state, as it must not remain on the boundary without parent connection
      modeling.removeElements([element]);
    }

    // Scenario 14/12: SystemLimit deletion rejected - do nothing
    // (The deletion was already blocked in FpbRuleProvider)
  });

  // Scenario 14/12: SystemLimit deletion requested - show confirmation dialog
  eventBus.on('systemLimit.deleteRequested', function(event) {
    const systemLimit = event.systemLimit;
    const process = event.process;
    const parentProcessOperator = process.businessObject.isDecomposedProcessOperator;

    const processOperatorName = parentProcessOperator ? parentProcessOperator.name || 'ProcessOperator' : 'ProcessOperator';

    // Request confirmation dialog
    eventBus.fire('confirmation.required', {
      title: 'Remove Decomposition?',
      message: 'Deleting the system limit will remove the entire decomposition of ProcessOperator "' + processOperatorName + '".',
      details: 'You will be redirected to the parent process. All elements in this process will be deleted.',
      isBlocked: false,
      action: {
        type: 'remove_decomposition',
        systemLimit: systemLimit,
        process: process,
        parentProcessOperator: parentProcessOperator
      }
    });
  });

  // Scenario 14/12: Remove decomposition confirmed
  eventBus.on('confirmation.confirmed', function(event) {
    if (event.action && event.action.type === 'remove_decomposition') {
      const childProcessShape = event.action.process;
      const parentProcessOperator = event.action.parentProcessOperator;
      const parentProcessShape = childProcessShape?.businessObject?.parent;

      if (childProcessShape && parentProcessOperator && parentProcessShape) {
        // 1. Navigate to parent layer (before removing the child process)
        modeling.switchProcess(parentProcessShape);

        // 2. Remove decomposedView from ProcessOperator
        parentProcessOperator.decomposedView = null;

        // 3. Fire events for DataStore and LayerPanel (expect Shape, not BusinessObject!)
        eventBus.fire('dataStore.processDeleted', {
          deletedProcess: childProcessShape
        });
        eventBus.fire('layerPanel.processDeleted', {
          deletedProcess: childProcessShape
        });

        // 4. Remove the child process from the parent's consistsOfProcesses
        collectionRemove(parentProcessShape.businessObject.consistsOfProcesses, childProcessShape);

        // 5. Clean up references in the child process
        childProcessShape.businessObject.isDecomposedProcessOperator = null;
        childProcessShape.businessObject.parent = null;

        // 6. Show feedback
        eventBus.fire('toolTips.decompositionRemoved', {
          processOperator: parentProcessOperator
        });
      }
    }
  });
}

ConfirmationHandler.$inject = [
  'eventBus',
  'modeling',
  'elementFactory'
];
