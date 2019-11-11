import inherits from 'inherits';

import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';

import { getElementsFromElementsContainer } from '../help/helpUtils';

import { is, isAny, isLabel } from '../help/utils';
import {
  some

} from 'min-dash';

export default function FpbRuleProvider(eventBus, canvas) {

  this._canvas = canvas;
  this._eventBus = eventBus;

  RuleProvider.call(this, eventBus);


}
var HIGH_PRIORITY = 1500;
FpbRuleProvider.$inject = ['eventBus', 'canvas'];

inherits(FpbRuleProvider, RuleProvider);


FpbRuleProvider.prototype.init = function () {
  var canvas = this._canvas;
  var eventBus = this._eventBus;


  this.addRule('shape.create', HIGH_PRIORITY, function (context) {
    var target = context.target,
      shape = context.shape,
      position = context.position;
    return canCreate(shape, target, position);
  });

  function canCreate(shape, target, position) {
    if (!target) {
      return false;
    }

    if (isLabel(target)) {
      return null;
    }


    if (isAny(shape, ['fpb:Product', 'fpb:Energy', 'fpb:Information'])) {
      if (is(target, 'fpb:SystemLimit')) {
        return checkIfItsWithinSystemLimits(shape, target, position)
      }
      else {
        return false;
      }
    }

    if (is(shape, 'fpb:ProcessOperator')) {
      if (is(target, 'fpb:SystemLimit')) {
        return true;
      } else {
        return false;
      }
    };
    if (is(shape, 'fpb:TechnicalResource')) {
      if (is(target, 'fpb:SystemLimit')) {
        return false;
      }
      else {
        return true;
      }
    };
    if (is(shape, 'fpb:SystemLimit')) {
      if (is(target, 'fpb:TechnicalResource')) {
        return false;
      }
      else {
        let process = canvas.getRootElement();
        if (is(process, 'fpb:Process')) {
          let technicalResources = getElementsFromElementsContainer(process.businessObject.elementsContainer, 'fpb:TechnicalResource');
          if (technicalResources.length == 0) {
            return true;
          } else {
            let technincalResource;
            if (some(technicalResources, (tr) => {
              if (moveOnTechnicalResource(shape, tr, position)) {
                technincalResource = tr;
                return true;
              }

            })) {
              eventBus.fire('illegalCreate', {
                movedElement: shape,
                targetElement: technincalResource,
                position: { x: technincalResource.x + technincalResource.width / 2, y: technincalResource.y + technincalResource.height / 2 }
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

  this.addRule('connection.create', HIGH_PRIORITY, function (context) {
    var source = context.source,
      target = context.target;
    return canConnect(source, target);
  });

  this.addRule('connection.reconnectStart', HIGH_PRIORITY, function (context) {
    var connection = context.connection,
      source = context.hover || context.source,
      target = connection.target;

    return canConnect(source, target, connection);
  });

  this.addRule('connection.reconnectEnd', HIGH_PRIORITY, function (context) {
    var connection = context.connection,
      source = connection.source,
      target = context.hover || context.target;

    return canConnect(source, target, connection);
  });

  this.addRule('shape.resize', function (context) {
    var shape = context.shape;
    // Nur die Größe der SystemGrenze darf geändert werden
    if (is(shape, 'fpb:SystemLimit')) {
      return true;
    }
    else {
      return false;
    }
  });

  this.addRule('elements.move', function (context) {
    var target = context.target,
      shapes = context.shapes,
      position = context.position;
    return canMove(shapes, target, position)
  });

  function canMove(elements, target, position) {
    // allow default move check to start move operation
    if (!target) {
      return true;
    }
    return elements.every(function (element) {
      return canDrop(element, target, position);
    });
  }

  /**
 * Can an element be dropped into the target element
 *
 * @return {Boolean}
 */
  function canDrop(element, target, position) {
    if (is(element, 'label')) {
      return false;
    }

    if (is(element, 'fpb:SystemLimit')) {
      if (is(target, 'fpb:TechnicalResource')) {
        return false;
      }
      let process = canvas.getRootElement();
      let technicalResources = getElementsFromElementsContainer(process.businessObject.elementsContainer, 'fpb:TechnicalResource');
      if (technicalResources.length == 0) {
        return true;
      } else {
        let technincalResource;
        if (some(technicalResources, (tr) => {
          if (moveOnTechnicalResource(element, tr, position)) {
            technincalResource = tr;
            return true;
          }

        })) {
          eventBus.fire('illegalMove', {
            movedElement: element,
            targetElement: technincalResource,
            position: { x: element.x + element.width / 2, y: element.y + element.height / 2 }
          })
          return false;
        } else {
          return true;
        }
      }

    };
    // Nur Droppen innerhalb der Systemgrenze.
    if (isLabel(element) || isAny(element, ['fpb:Product', 'fpb:Energy', 'fpb:Information', 'fpb:ProcessOperator'])) {
      if (element.parent) {
        return target === element.parent;
      }
    };
    // TechnicalResource darf nicht innerhalb der SystemGrenzen gedropped werden.
    if (is(element, 'fpb:TechnicalResource')) {
      if (!isAny(target, ['fpb:SystemLimit', 'fpb:Product', 'fpb:Energy', 'fpb:Information', 'fpb:ProcessOperator'])) {
        return true;
      }
      else {
        return false
      }
    };

  }

  // Prüft ob Product, Energy, Information oder ProcessOperator innerhalb der Systemgrenzen liegt.
  function checkIfItsWithinSystemLimits(shape, target, position) {
    let limit_x_1 = target.x - target.width / 2;
    let limit_x_2 = target.x + target.width / 2;
    let limit_y_1 = target.y - target.heigth / 2;
    let limit_y_2 = target.y + target.height / 2;

    let shape_x_1 = position.x - shape.width / 2;
    let shape_x_2 = position.x + shape.width / 2;
    let shape_y_1 = position.y - shape.height / 2;
    let shape_y_2 = position.y + shape.height / 2;

    if (shape_x_1 >= limit_x_1 || shape_x_2 <= limit_x_2) {
      if (shape_y_1 >= limit_y_1 || shape_y_2 <= limit_y_2) {
        return true;
      }
    }
    else {
      return false;
    }
  };

  // Prüft ob SystemLimit auf eine technische Ressource verschoben/erstellt wird
  function moveOnTechnicalResource(systemLimit, technicalResource, position) {
    let x1 = position.x - systemLimit.width / 2;
    let x2 = position.x + systemLimit.width / 2;
    let y1 = position.y - systemLimit.height / 2;
    let y2 = position.y + systemLimit.height / 2;
    let errorX = technicalResource.x;
    let errorY = technicalResource.y + technicalResource.height / 2;
    if (position.x > technicalResource.x) {
      // Annhäherung von rechts
      errorX += technicalResource.width;
    }

    if ((x1 <= errorX) && (errorX <= x2)) {
      if ((y1 <= errorY) && (errorY <= y2)) {
        return true;
      }
    }
    return false;

  }
};



function canConnect(source, target) {
  // Keine Connections zu Label
  if (target.type === 'label') {
    return;
  }
  // Keine Connection zwischen Shapes, zwischen denen schon eine Verbindung besteht
  let allReadyConnected = some(source.outgoing, function (c) {
    return c.businessObject.targetRef.id === target.id
  });
  if (allReadyConnected) {
    return;
  }
  // Verbindung States mit ProcessOperator
  if (isAny(source, ['fpb:Product', 'fpb:Energy', 'fpb:Information'])) {
    if (is(target, 'fpb:ProcessOperator')) {
      // Gewählter Flow Type ist in TemporaraFlowHint hinterlegt
      if (source.TemporaryFlowHint) {
        if (source.TemporaryFlowHint === 'Parallel') {
          return { type: 'fpb:ParallelFlow' }
        };
        if (source.TemporaryFlowHint === 'Alternative') {
          return { type: 'fpb:AlternativeFlow' }
        }
      };
      return { type: 'fpb:Flow' };
    }
    else {
      return;
    }
  }
  // Verbindung ProcessOperator
  if (is(source, 'fpb:ProcessOperator')) {
    // mit States
    if (isAny(target, ['fpb:Product', 'fpb:Energy', 'fpb:Information'])) {
      if (source.TemporaryFlowHint) {
        if (source.TemporaryFlowHint === 'Parallel') {
          return { type: 'fpb:ParallelFlow' }
        };
        if (source.TemporaryFlowHint === 'Alternative') {
          return { type: 'fpb:AlternativeFlow' }
        }
      };
      return { type: 'fpb:Flow' };
    }
    // mit TechnicalResource
    else if (is(target, 'fpb:TechnicalResource')) {
      if (source.TemporaryFlowHint === 'Usage') {
        return { type: 'fpb:Usage' }; // Nur Rückgabe des Usage Edge, wenn dieser auch ausgewählt wurde!
      }
      else {
        return
      };
    }
    else {
      return;
    }
  };
  // Verbindung TechnicalResource mit ProcessOperator
  if (is(source, 'fpb:TechnicalResource') && is(target, 'fpb:ProcessOperator')) {
    return { type: 'fpb:Usage' };
  }
  else {
    return;
  }
};

FpbRuleProvider.prototype.canConnect = canConnect;

