'use strict'
import { is, isAny } from '../help/utils';

import { getBusinessObjectFromElementsContainer, noOfUsageConnections, getElementsFromElementsContainer } from '../help/helpUtils'

import { assign, some, filter } from 'min-dash';

import { getMid } from 'diagram-js/lib/layout/LayoutUtil';

import {
  hasPrimaryModifier
} from 'diagram-js/lib/util/Mouse';

import translate from 'diagram-js/lib/i18n/translate/translate';


export default function FpbContextPadProvider(
  config, injector, eventBus,
  contextPad, modeling, elementFactory,
  connect, create,
  canvas, fpbRuleProvider, translate) {
  config = config || {};
  contextPad.registerProvider(this);
  this._connect = connect;
  this._modeling = modeling;
  this._contextPad = contextPad;
  this._elementFactory = elementFactory;
  this._create = create;
  this._canvas = canvas;
  this._rules = fpbRuleProvider;
  this._translate = translate;
  if (config.autoPlace !== false) {
    this._autoPlace = injector.get('autoPlace', false);
  }
}
FpbContextPadProvider.$inject = [
  'config.contextPad',
  'injector',
  'eventBus',
  'contextPad',
  'modeling',
  'elementFactory',
  'connect',
  'create',
  'canvas',
  'fpbRuleProvider',
  'translate',
  'config'
];



FpbContextPadProvider.prototype.getContextPadEntries = function (element) {
  var connect = this._connect;

  var modeling = this._modeling;
  var canvas = this._canvas;
  var process = canvas.getRootElement();
  try {
    // Try Catch für den unwahrscheinlichen Fall, dass jemand eine TR als erstes platziert
    var systemLimit = getElementsFromElementsContainer(process.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
    var processOperators = getElementsFromElementsContainer(systemLimit.businessObject.elementsContainer, 'fpb:ProcessOperator');
    var states = getElementsFromElementsContainer(systemLimit.businessObject.elementsContainer, 'fpb:State')
    var technicalResources = getBusinessObjectFromElementsContainer(process.businessObject.elementsContainer, 'fpb:TechnicalResource')
  } catch (error) {
    
  }

  function removeElement() {
    modeling.removeElements([element]);
  }

  function startConnect(event, element, autoActivate) {
    if (is(element, 'fpb:Object')) {
      // legt fest, welcher Flow Type ausgewählt wurde und speichert diese Information.
      let hint;
      if (event.srcElement.className.search('parallel') !== -1) {
        hint = 'Parallel'
      }
      else if (event.srcElement.className.search('alternative') !== -1) {
        hint = 'Alternative'
      }
      else if (event.srcElement.className.search('usage') !== -1) {
        hint = 'Usage'
      }
      else {
        hint = 'Flow'
      }
      element.TemporaryFlowHint = hint;

      let sourcePos = getMid(element);
      //  if (isAny(element, ['fpbjs:Product', 'fpbjs:Information', 'fpbjsEnergy'])) {
      if (is(element, 'fpb:State')) {
        sourcePos.y += element.width / 2;
      }
      else {
        sourcePos.x += element.width / 2;
      }

      connect.start(event, element, sourcePos, autoActivate);
    } else {
      let sourcePos = getMid(element);
      sourcePos.x -= element.width / 2;
      connect.start(event, element, sourcePos, autoActivate);
    }
  };

  function compose(event, element) {
    modeling.composeProcess(element);
  };
  function decompose(event, element) {
    modeling.decomposeProcessOperator(element);
  }

  // Prüft ob schon ein Alternative oder ParallelFlow existiert
  function anyOutgoingFlowOfType(element, type) {
    for (const flow of element.outgoing) {
      if (flow.type === type) {
        return false;
      }
    }
    return true;
  };


  // prüft ob ausreichend Elemente für eine Bestimme Verbindung da sind
  function noOfElementsUnderTheSource(source, container, minDistance) {
    let i = 0;

    if (container.length == 0) {
      return i;
    };
    // Nur Elemente berücksichtigen, die noch nicht miteinander verbunden sind
    let notConnectedElements = [];
    container.forEach((element) => {
      if (!some(element.incoming, function (c) {
        return c.businessObject.sourceRef.id == source.id
      })) {
        notConnectedElements.push(element);
      }
    })
    notConnectedElements.forEach((element) => {

      //  if (element.di.bounds.y > (source.y + minDistance)) {
      if (element.y > (source.y + minDistance)) {
        i++
      }
    })
    return i;
  };

  // TODO: Gleiches für TechnicalResources
  function technicalResourcesAvailable(source, technicalResources) {
    if (technicalResources.length == 0) {
      return false;
    };
    if (source.businessObject.isAssignedTo.length == 0) {
      return true;
    };

    let freeTechnicalResources = filter(technicalResources, function (tR) {
      return tR.isAssignedTo.id != source.id;
    });
    if (freeTechnicalResources.length > 0) {
      return true;
    }
    return false;
  }


  var pad = {};
  // Entfernen von fpbjs Präfix für Tooltip Anzeige auf Icon
  let elementType;
  if (element.type) {
    // elementType = element.type.replace('fpbjs:', '');
    elementType = element.type.replace('fpb:', '');
  }

  // Kein ContextPad für Labels
  if (element.type === 'label') {
    return pad;
  }

  // Delete für alle Types
  assign(pad, {
    'delete': {
      group: 'edit',
      className: 'context-pad-icon-remove',
      title: translate('Remove {type}', { type: elementType }),
      action: {
        click: removeElement,
        dragstart: removeElement
      }
    }
  });
  // ContextPad für Product, Information und Energy
  if (is(element, 'fpb:State')) {
    // Anzeige von normalen Flow, nur wenn kein OutgoingFlow vorhanden ist und Wenn sich unterhalb ProcessOperatoren befinden, 
    if (element.outgoing.length == 0 && noOfElementsUnderTheSource(element, processOperators, 50) > 0) {
      assign(pad, {
        'connect': {
          group: 'edit',
          className: 'context-pad-icon-fpbconnection',
          title: translate('Connect {type} with ProcessOperator', { type: elementType }),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        }
      });
    }
    // Sobald ein Outgoing Flow existiert, wird nur noch entweder Alternative und/oder Parallel angezeigt
    // if (element.outgoing.length > 0 && anyOutgoingFlowOfType(element, 'fpbjs:AlternativeFlow')) {
    if (element.outgoing.length > 0 && noOfElementsUnderTheSource(element, processOperators, 50) > 0) {
      if (anyOutgoingFlowOfType(element, 'fpb:AlternativeFlow')) {
        assign(pad, {
          'connect_parallel': {
            group: 'edit',
            className: 'context-pad-icon-fpbparallelconnection',
            title: translate('Parallel used {type}', { type: elementType }),
            action: {
              click: startConnect,
              dragstart: startConnect
            }
          }
        });
      }
      if (anyOutgoingFlowOfType(element, 'fpb:ParallelFlow')) {
        assign(pad, {
          'connect_alternative': {
            group: 'edit',
            className: 'context-pad-icon-fpbalternativeconnection',
            title: translate('Alternative Flow'),
            action: {
              click: startConnect,
              dragstart: startConnect
            }
          }
        });
      }



    }
  };
  // ProcessOperator, Keine Flow Bedingungen, alle Arten werden angezeigt.
  // if (is(element, 'fpbjs:ProcessOperator')) {
  if (is(element, 'fpb:ProcessOperator')) {
    if (noOfElementsUnderTheSource(element, states, 50) > 0) {
      assign(pad, {
        'connect': {
          group: 'edit',
          className: 'context-pad-icon-fpbconnection',
          title: translate('Connect {type} with Product, Energy or Information', { type: elementType }),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        },
        'connect_parallel': {
          group: 'edit',
          className: 'context-pad-icon-fpbparallelconnection',
          title: translate('Parallel Process'),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        },
        'connect_alternative': {
          group: 'edit',
          className: 'context-pad-icon-fpbalternativeconnection',
          title: translate('Alternative Process'),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        }
      })
    }
    if (technicalResourcesAvailable(element, technicalResources)) {
      assign(pad, {
        'connect_usage': {
          group: 'edit',
          className: 'context-pad-icon-fpbusage',
          title: translate('Connect Process Operator with a Technical Resource'),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        }
      });
    }
    // Decompose Button nur anzeigen, wenn ProcessOperator mindestens einen Input und einen Output hat.
    if (((element.incoming.length - noOfUsageConnections(element.incoming)) > 0) &&
      ((element.outgoing.length - noOfUsageConnections(element.outgoing)) > 0)) {
      assign(pad, {
        'decompose': {
          group: 'edit',
          className: 'context-pad-icon-fpbdecompose',
          title: translate('Decompose this ProcessOperator'),
          action: {
            click: decompose
          }
        }
      })
    }

  };
  // TechnicalResource hat Möglichkeit Usage Flow anzulegen
  //  if (is(element, 'fpbjs:TechnicalResource')) {
  if (is(element, 'fpb:TechnicalResource')) {
    assign(pad, {
      'connect_usage': {
        group: 'edit',
        className: 'context-pad-icon-fpbusage',
        title: translate('Connect Technical Resource with a Process Operator'),
        action: {
          click: startConnect,
          dragstart: startConnect
        }
      }
    });


  };
  // Über SystemLimit besteht Möglichkeit für Compose
  if (is(element, 'fpb:SystemLimit')) {
    if (process.businessObject.isDecomposedProcessOperator) {
      assign(pad, {
        'compose': {
          group: 'edit',
          className: 'context-pad-icon-fpbswitchup',
          title: translate('Switch to parent process'),
          action: {
            click: compose
          }
        }
      })
    } else {
      assign(pad, {
        'compose': {
          group: 'edit',
          className: 'context-pad-icon-fpbcompose',
          title: translate('Compose SystemLimit'),
          action: {
            click: compose
          }
        }
      })
    }
  };
  return pad
};


