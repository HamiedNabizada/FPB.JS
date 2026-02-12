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

  // Szenario 4 & 6: State auf Grenze erstellt/verschoben - Bestätigung
  eventBus.on('confirmation.confirmed', function(event) {
    if (event.action && (event.action.type === 'move_to_boundary' || event.action.type === 'create_on_boundary')) {
      var element = event.action.element;
      var borderPosition = event.action.borderPosition;
      var processRootElement = event.action.processRootElement;

      // Parent-Layer aktualisieren (State + Connection erstellen)
      var parentProcessOperator = processRootElement.businessObject.isDecomposedProcessOperator;
      var parentProcess = processRootElement.businessObject.parent;

      if (parentProcess) {
        var parentSystemLimit = getElementsFromElementsContainer(
          parentProcess.businessObject.elementsContainer,
          'fpb:SystemLimit'
        )[0];

        if (parentSystemLimit) {
          // Prüfe ob State bereits auf Parent-Layer existiert
          var existingParentState = getElementById(
            parentSystemLimit.businessObject.elementsContainer,
            element.businessObject.id
          );

          if (!existingParentState) {
            // State auf Parent-Layer erstellen
            var parentStateShape = createStateShapeForNewLayer(
              elementFactory,
              element.businessObject.$type,
              element.businessObject
            );
            collectionAdd(parentProcess.businessObject.consistsOfStates, parentStateShape.businessObject);
            collectionAdd(parentSystemLimit.businessObject.elementsContainer, parentStateShape);

            // Position neben dem ProcessOperator setzen
            var parentPOShape = getElementById(
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

          // Connection zwischen State und ProcessOperator auf Parent-Layer erstellen
          var connectionExists = false;
          var parentPOShape = getElementById(
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
            // Berechne waypoints
            var sourceShape = borderPosition === 'onUpperBorder' ? existingParentState : parentPOShape;
            var targetShape = borderPosition === 'onUpperBorder' ? parentPOShape : existingParentState;

            var sourceCenter = {
              x: sourceShape.x + (sourceShape.width || 50) / 2,
              y: sourceShape.y + (sourceShape.height || 50) / 2
            };
            var targetCenter = {
              x: targetShape.x + (targetShape.width || 50) / 2,
              y: targetShape.y + (targetShape.height || 50) / 2
            };

            var newFlow = elementFactory.createConnection({
              type: 'fpb:Flow',
              source: sourceShape,
              target: targetShape,
              waypoints: [sourceCenter, targetCenter]
            });

            collectionAdd(parentSystemLimit.businessObject.elementsContainer, newFlow);

            // BusinessObject-Referenzen setzen
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

            // Shape-Referenzen setzen
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

            // isAssignedTo aktualisieren
            if (!existingParentState.businessObject.isAssignedTo) existingParentState.businessObject.isAssignedTo = [];
            collectionAdd(existingParentState.businessObject.isAssignedTo, parentProcessOperator);
          }
        }
      }
    }
  });

  // Szenario 6: State zur Grenze verschoben - Ablehnung
  // Szenario 4: State auf Grenze erstellt - Ablehnung
  eventBus.on('confirmation.cancelled', function(event) {
    if (event.action && event.action.type === 'move_to_boundary') {
      var element = event.action.element;
      var oldPosition = event.action.oldPosition;

      // State zurück zur alten Position verschieben
      var deltaX = oldPosition.x - element.x;
      var deltaY = oldPosition.y - element.y;
      modeling.moveShape(element, { x: deltaX, y: deltaY });
    }

    if (event.action && event.action.type === 'create_on_boundary') {
      var element = event.action.element;

      // State löschen, da er nicht auf der Grenze bleiben darf ohne Parent-Verbindung
      modeling.removeElements([element]);
    }

    // Szenario 14/12: SystemLimit löschen abgelehnt - nichts tun
    // (Die Löschung wurde bereits in FpbRuleProvider blockiert)
  });

  // Szenario 14/12: SystemLimit löschen angefordert - Bestätigungsdialog anzeigen
  eventBus.on('systemLimit.deleteRequested', function(event) {
    var systemLimit = event.systemLimit;
    var process = event.process;
    var parentProcessOperator = process.businessObject.isDecomposedProcessOperator;

    var processOperatorName = parentProcessOperator ? parentProcessOperator.name || 'ProcessOperator' : 'ProcessOperator';

    // Bestätigungsdialog anfordern
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

  // Szenario 14/12: Dekomposition entfernen bestätigt
  eventBus.on('confirmation.confirmed', function(event) {
    if (event.action && event.action.type === 'remove_decomposition') {
      var childProcessShape = event.action.process;
      var parentProcessOperator = event.action.parentProcessOperator;
      var parentProcessShape = childProcessShape?.businessObject?.parent;

      if (childProcessShape && parentProcessOperator && parentProcessShape) {
        // 1. Zum Parent-Layer navigieren (bevor wir den Child-Process entfernen)
        modeling.switchProcess(parentProcessShape);

        // 2. decomposedView vom ProcessOperator entfernen
        parentProcessOperator.decomposedView = null;

        // 3. Events feuern für DataStore und LayerPanel (expect Shape, not BusinessObject!)
        eventBus.fire('dataStore.processDeleted', {
          deletedProcess: childProcessShape
        });
        eventBus.fire('layerPanel.processDeleted', {
          deletedProcess: childProcessShape
        });

        // 4. Den Child-Process aus consistsOfProcesses des Parent entfernen
        collectionRemove(parentProcessShape.businessObject.consistsOfProcesses, childProcessShape);

        // 5. Referenzen im Child-Process aufräumen
        childProcessShape.businessObject.isDecomposedProcessOperator = null;
        childProcessShape.businessObject.parent = null;

        // 6. Feedback anzeigen
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
