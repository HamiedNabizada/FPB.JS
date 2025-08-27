import inherits from 'inherits';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import { some } from 'min-dash';

import { getElementsFromElementsContainer } from '../help/helpUtils';
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
    console.log('🏗️ [DEBUG] === canCreate called ===');
    console.log('  📐 Shape:', shape?.type, shape?.id);
    console.log('  🎯 Target:', target?.type, target?.id); 
    console.log('  📍 Position:', position?.x + ',' + position?.y);
    
    if (!target) {
      console.log('  ❌ BLOCKING: No target specified');
      return false;
    }

    if (isLabel(target)) {
      console.log('  🏷️ Target is label - returning null');
      return null;
    }


    if (isAny(shape, ELEMENT_GROUPS.STATES)) {
      console.log('🔄 [DEBUG] State element placement check');
      console.log('  📐 State shape:', shape?.type);
      console.log('  🎯 Target:', target?.type);
      if (is(target, ELEMENT_TYPES.SYSTEM_LIMIT)) {
        console.log('  ✅ Target is SystemLimit - checking bounds...');
        const result = checkIfItsWithinSystemLimits(shape, target, position);
        console.log('  🎯 SystemLimit bounds check result:', result ? 'ALLOWED' : 'BLOCKED');
        return result;
      }
      else {
        console.log('  ❌ BLOCKING: Target is not SystemLimit');
        return false;
      }
    }

    if (is(shape, ELEMENT_TYPES.PROCESS_OPERATOR)) {
      console.log('⚙️ [DEBUG] ProcessOperator placement check');
      console.log('  📐 ProcessOperator shape:', shape?.type);
      console.log('  🎯 Target:', target?.type);
      if (is(target, ELEMENT_TYPES.SYSTEM_LIMIT)) {
        console.log('  ✅ Target is SystemLimit - ALLOWING ProcessOperator placement');
        return true;
      } else {
        console.log('  ❌ BLOCKING: Target is not SystemLimit');
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
    // Nur die Größe der SystemGrenze darf geändert werden
    return is(shape, ELEMENT_TYPES.SYSTEM_LIMIT);
  });

  this.addRule('elements.move', (context) => {
    const { target, shapes, position } = context;
    return canMove(shapes, target, position);
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
    // Nur Droppen innerhalb der Systemgrenze.
    if (isLabel(element) || isAny(element, ELEMENT_GROUPS.INSIDE_SYSTEM_LIMIT)) {
      if (element.parent) {
        return target === element.parent;
      }
    };
    // TechnicalResource darf nicht innerhalb der SystemGrenzen gedropped werden.
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
  // Keine Connections zu Label
  if (target.type === ELEMENT_TYPES.LABEL) {
    return;
  }
  
  // Keine Connection zwischen Shapes, zwischen denen schon eine Verbindung besteht
  if (areAlreadyConnected(source, target)) {
    return;
  }
  
  // Verbindung States mit ProcessOperator
  if (isAny(source, ELEMENT_GROUPS.STATES)) {
    if (is(target, ELEMENT_TYPES.PROCESS_OPERATOR)) {
      return getConnectionType(source, source.TemporaryFlowHint);
    }
    return;
  }
  
  // Verbindung ProcessOperator
  if (is(source, ELEMENT_TYPES.PROCESS_OPERATOR)) {
    // mit States
    if (isAny(target, ELEMENT_GROUPS.STATES)) {
      return getConnectionType(source, source.TemporaryFlowHint);
    }
    // mit TechnicalResource
    else if (is(target, ELEMENT_TYPES.TECHNICAL_RESOURCE)) {
      if (source.TemporaryFlowHint === FLOW_HINTS.USAGE) {
        return { type: ELEMENT_TYPES.USAGE };
      }
      return;
    }
    return;
  }
  
  // Verbindung TechnicalResource mit ProcessOperator
  if (is(source, ELEMENT_TYPES.TECHNICAL_RESOURCE) && is(target, ELEMENT_TYPES.PROCESS_OPERATOR)) {
    return { type: ELEMENT_TYPES.USAGE };
  }
  
  return;
}

FpbRuleProvider.prototype.canConnect = canConnect;

