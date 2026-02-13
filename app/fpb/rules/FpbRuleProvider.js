import inherits from 'inherits';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import { some } from 'min-dash';

import { getElementsFromElementsContainer, checkIfOnSystemBorder } from '../help/helpUtils';
import { is, isAny, isLabel } from '../help/utils';

// Import our new constants and utilities
import { ELEMENT_TYPES, ELEMENT_GROUPS, FLOW_HINTS, RULE_PRIORITIES } from './RuleConstants';
import { 
  checkIfItsWithinSystemLimits, 
  moveOnTechnicalResource, 
  getConnectionType,
  areAlreadyConnected 
} from './RuleUtils';

export default function FpbRuleProvider(eventBus, canvas) {

  this._canvas = canvas;
  this._eventBus = eventBus;

  RuleProvider.call(this, eventBus);


}

FpbRuleProvider.$inject = ['eventBus', 'canvas'];

inherits(FpbRuleProvider, RuleProvider);


FpbRuleProvider.prototype.init = function () {
  const canvas = this._canvas;
  const eventBus = this._eventBus;

  this.addRule('shape.create', RULE_PRIORITIES.HIGH, (context) => {
    const { target, shape, position } = context;
    return canCreate(shape, target, position);
  });

  function canCreate(shape, target, position) {
    const DEBUG = false; // Logging disabled

    if (DEBUG) {
      console.log('FpbRuleProvider.canCreate', {
        shape: shape?.type,
        target: target?.type,
        position: position ? `${position.x},${position.y}` : 'none'
      });
    }

    if (!target) {
      if (DEBUG) console.warn('canCreate: No target specified');
      return false;
    }

    if (isLabel(target)) {
      return null;
    }


    if (isAny(shape, ELEMENT_GROUPS.STATES)) {
      if (is(target, ELEMENT_TYPES.SYSTEM_LIMIT)) {
        return checkIfItsWithinSystemLimits(shape, target, position);
      } else {
        if (DEBUG) console.warn('State element requires SystemLimit target');
        return false;
      }
    }

    if (is(shape, ELEMENT_TYPES.PROCESS_OPERATOR)) {
      if (is(target, ELEMENT_TYPES.SYSTEM_LIMIT)) {
        return true;
      } else {
        if (DEBUG) console.warn('ProcessOperator requires SystemLimit target');
        return false;
      }
    };
    if (is(shape, ELEMENT_TYPES.TECHNICAL_RESOURCE)) {
      if (is(target, ELEMENT_TYPES.SYSTEM_LIMIT)) {
        return false;
      }
      else {
        return true;
      }
    };
    if (is(shape, ELEMENT_TYPES.SYSTEM_LIMIT)) {
      if (is(target, ELEMENT_TYPES.TECHNICAL_RESOURCE)) {
        return false;
      }
      else {
        const process = canvas.getRootElement();
        if (is(process, ELEMENT_TYPES.PROCESS)) {
          const technicalResources = getElementsFromElementsContainer(process.businessObject.elementsContainer, ELEMENT_TYPES.TECHNICAL_RESOURCE);
          if (technicalResources.length === 0) {
            return true;
          } else {
            let technicalResource;
            if (some(technicalResources, (tr) => {
              if (moveOnTechnicalResource(shape, tr, position)) {
                technicalResource = tr;
                return true;
              }
            })) {
              eventBus.fire('illegalCreate', {
                movedElement: shape,
                targetElement: technicalResource,
                position: { x: technicalResource.x + technicalResource.width / 2, y: technicalResource.y + technicalResource.height / 2 }
              })
              return false;
            } else {
              return true;
            }
          }
        } else {
          return true
        }

      }
    }
    else {
      return false;
    }
  };

  this.addRule('connection.create', RULE_PRIORITIES.HIGH, (context) => {
    const { source, target } = context;
    return canConnect(source, target);
  });

  this.addRule('connection.reconnectStart', RULE_PRIORITIES.HIGH, (context) => {
    const { connection } = context;
    const source = context.hover || context.source;
    const target = connection.target;
    return canConnect(source, target, connection);
  });

  this.addRule('connection.reconnectEnd', RULE_PRIORITIES.HIGH, (context) => {
    const { connection } = context;
    const source = connection.source;
    const target = context.hover || context.target;
    return canConnect(source, target, connection);
  });

  this.addRule('shape.resize', (context) => {
    const { shape } = context;
    // Only the SystemLimit may be resized
    return is(shape, ELEMENT_TYPES.SYSTEM_LIMIT);
  });

  this.addRule('elements.move', (context) => {
    const { target, shapes, position } = context;
    return canMove(shapes, target, position);
  });

  // Scenario 14/12: Deleting SystemLimit on child layer = undoing decomposition
  // The actual logic (confirmation dialog + navigation) is in FpbUpdater.js
  // Here we allow the deletion but fire an event for the confirmation dialog
  this.addRule('elements.delete', RULE_PRIORITIES.HIGH, (context) => {
    const { elements } = context;

    const process = canvas.getRootElement();
    const isChildLayer = process && process.businessObject && process.businessObject.isDecomposedProcessOperator;

    if (isChildLayer) {
      const systemLimitElement = elements.find(element => is(element, ELEMENT_TYPES.SYSTEM_LIMIT));

      if (systemLimitElement) {
        // Fire event for confirmation dialog - FpbContextPadProvider or LayerPanel reacts to it
        eventBus.fire('systemLimit.deleteRequested', {
          systemLimit: systemLimitElement,
          process: process
        });
        // Block - the actual deletion is performed after confirmation
        return false;
      }
    }

    return true;
  });

  const canMove = (elements, target, position) => {
    // allow default move check to start move operation
    if (!target) {
      return true;
    }
    return elements.every(element => canDrop(element, target, position));
  };

  /**
   * Can an element be dropped into the target element
   */
  const canDrop = (element, target, position) => {
    if (is(element, 'label')) {
      return false;
    }

    // Boundary states on child layers must not be moved away from the system boundary
    if (isAny(element, ELEMENT_GROUPS.STATES)) {
      const process = canvas.getRootElement();
      if (process && process.businessObject && process.businessObject.isDecomposedProcessOperator) {
        // We are on a child layer - find SystemLimit shape
        const systemLimitShape = process.children.find(child => is(child, ELEMENT_TYPES.SYSTEM_LIMIT));

        if (systemLimitShape) {
          const currentBorder = checkIfOnSystemBorder(systemLimitShape, element);
          // If the state is currently on the boundary, completely prohibit moving
          if (currentBorder === 'onUpperBorder' || currentBorder === 'onBottomBorder') {
            // Calculate how far the state would be moved
            const deltaY = position.y - (element.y + element.height / 2);
            const tolerance = 5; // Allow small movements (for layout adjustments)

            if (Math.abs(deltaY) > tolerance) {
              // State would be moved significantly - prohibit
              return false;
            }
          }
        }
      }
    }

    if (is(element, ELEMENT_TYPES.SYSTEM_LIMIT)) {
      if (is(target, ELEMENT_TYPES.TECHNICAL_RESOURCE)) {
        return false;
      }
      const process = canvas.getRootElement();
      const technicalResources = getElementsFromElementsContainer(process.businessObject.elementsContainer, ELEMENT_TYPES.TECHNICAL_RESOURCE);
      if (technicalResources.length === 0) {
        return true;
      } else {
        let technicalResource;
        if (some(technicalResources, (tr) => {
          if (moveOnTechnicalResource(element, tr, position)) {
            technicalResource = tr;
            return true;
          }
        })) {
          eventBus.fire('illegalMove', {
            movedElement: element,
            targetElement: technicalResource,
            position: { x: element.x + element.width / 2, y: element.y + element.height / 2 }
          })
          return false;
        } else {
          return true;
        }
      }

    };
    // Only allow dropping within the system boundary.
    if (isLabel(element) || isAny(element, ELEMENT_GROUPS.INSIDE_SYSTEM_LIMIT)) {
      if (element.parent) {
        return target === element.parent;
      }
    };
    // TechnicalResource must not be dropped within the system boundary.
    if (is(element, ELEMENT_TYPES.TECHNICAL_RESOURCE)) {
      if (!isAny(target, [ELEMENT_TYPES.SYSTEM_LIMIT, ...ELEMENT_GROUPS.STATES, ELEMENT_TYPES.PROCESS_OPERATOR])) {
        return true;
      }
      else {
        return false
      }
    };

  }

};



function canConnect(source, target) {
  // No connections to labels
  if (target.type === ELEMENT_TYPES.LABEL) {
    return;
  }
  
  // No connection between shapes that are already connected
  if (areAlreadyConnected(source, target)) {
    return;
  }
  
  // Connection from States to ProcessOperator
  if (isAny(source, ELEMENT_GROUPS.STATES)) {
    if (is(target, ELEMENT_TYPES.PROCESS_OPERATOR)) {
      return getConnectionType(source, source.TemporaryFlowHint);
    }
    return;
  }
  
  // Connection from ProcessOperator
  if (is(source, ELEMENT_TYPES.PROCESS_OPERATOR)) {
    // to States
    if (isAny(target, ELEMENT_GROUPS.STATES)) {
      return getConnectionType(source, source.TemporaryFlowHint);
    }
    // to TechnicalResource
    else if (is(target, ELEMENT_TYPES.TECHNICAL_RESOURCE)) {
      if (source.TemporaryFlowHint === FLOW_HINTS.USAGE) {
        return { type: ELEMENT_TYPES.USAGE };
      }
      return;
    }
    return;
  }
  
  // Connection from TechnicalResource to ProcessOperator
  if (is(source, ELEMENT_TYPES.TECHNICAL_RESOURCE) && is(target, ELEMENT_TYPES.PROCESS_OPERATOR)) {
    return { type: ELEMENT_TYPES.USAGE };
  }
  
  return;
}

FpbRuleProvider.prototype.canConnect = canConnect;

