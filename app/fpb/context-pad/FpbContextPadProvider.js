import { is } from '../help/utils';
import { getBusinessObjectFromElementsContainer, noOfUsageConnections } from '../help/helpUtils';
import { assign } from 'min-dash';
import translate from 'diagram-js/lib/i18n/translate/translate';

// Import our new constants and utilities
import { 
  ELEMENT_TYPES, 
  CONTEXT_PAD_ICONS, 
  ENTRY_GROUPS, 
  ENTRY_IDS, 
  TOOLTIP_KEYS,
  FLOW_TYPES 
} from './ContextPadConstants';
import { 
  ContextHelper, 
  ConnectionUtils, 
  ElementValidationUtils, 
  ElementTypeUtils 
} from './ContextPadUtils';


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
  
  // Initialize context helper for element lookups
  this._contextHelper = new ContextHelper(canvas);
  
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
  const connect = this._connect;
  const modeling = this._modeling;
  
  // Get process context using helper
  const context = this._contextHelper.getProcessContext();
  const { process, systemLimit, processOperators, states, technicalResources } = context;

  function removeElement() {
    modeling.removeElements([element]);
  }

  function startConnect(event, element, autoActivate) {
    // Determine flow hint from event using utility
    const hint = ConnectionUtils.getFlowHintFromEvent(event);
    element.TemporaryFlowHint = hint;

    // Calculate source position using utility
    const sourcePos = ConnectionUtils.getConnectionSourcePosition(element);
    connect.start(event, element, sourcePos, autoActivate);
  };

  function compose(event, element) {
    modeling.composeProcess(element);
  };
  function decompose(event, element) {
    modeling.decomposeProcessOperator(element);
  }

  // Helper functions using utilities
  const anyOutgoingFlowOfType = (element, type) => ElementValidationUtils.anyOutgoingFlowOfType(element, type);
  const noOfElementsUnderTheSource = (source, container, minDistance) => ElementValidationUtils.countElementsUnderSource(source, container, minDistance);
  const technicalResourcesAvailable = (source, technicalResources) => ElementValidationUtils.technicalResourcesAvailable(source, technicalResources);


  const pad = {};
  
  // Get clean element type for tooltips using utility
  const elementType = ElementTypeUtils.getCleanElementType(element);
  
  // No ContextPad for labels
  if (element.type === ELEMENT_TYPES.LABEL) {
    return pad;
  }

  // Delete entry for all element types
  assign(pad, {
    [ENTRY_IDS.DELETE]: {
      group: ENTRY_GROUPS.EDIT,
      className: CONTEXT_PAD_ICONS.REMOVE,
      title: translate(TOOLTIP_KEYS.REMOVE, { type: elementType }),
      action: {
        click: removeElement,
        dragstart: removeElement
      }
    }
  });
  // ContextPad for States (Product, Information, Energy)
  if (is(element, ELEMENT_TYPES.STATE)) {
    // Show all connection types if no outgoing flows and ProcessOperators available below
    if (element.outgoing.length === 0 && noOfElementsUnderTheSource(element, processOperators) > 0) {
      assign(pad, {
        [ENTRY_IDS.CONNECT]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.CONNECT,
          title: translate(TOOLTIP_KEYS.CONNECT_WITH_PROCESS_OPERATOR, { type: elementType }),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        },
        [ENTRY_IDS.CONNECT_PARALLEL]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.PARALLEL_CONNECTION,
          title: translate(TOOLTIP_KEYS.PARALLEL_USED, { type: elementType }),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        },
        [ENTRY_IDS.CONNECT_ALTERNATIVE]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.ALTERNATIVE_CONNECTION,
          title: translate(TOOLTIP_KEYS.ALTERNATIVE_PROCESS),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        }
      });
    }
    // Show additional flow types when outgoing flows exist
    if (element.outgoing.length > 0 && noOfElementsUnderTheSource(element, processOperators) > 0) {
      if (anyOutgoingFlowOfType(element, FLOW_TYPES.ALTERNATIVE_FLOW)) {
        assign(pad, {
          [ENTRY_IDS.CONNECT_PARALLEL]: {
            group: ENTRY_GROUPS.EDIT,
            className: CONTEXT_PAD_ICONS.PARALLEL_CONNECTION,
            title: translate(TOOLTIP_KEYS.PARALLEL_USED, { type: elementType }),
            action: {
              click: startConnect,
              dragstart: startConnect
            }
          }
        });
      }
      if (anyOutgoingFlowOfType(element, FLOW_TYPES.PARALLEL_FLOW)) {
        assign(pad, {
          [ENTRY_IDS.CONNECT_ALTERNATIVE]: {
            group: ENTRY_GROUPS.EDIT,
            className: CONTEXT_PAD_ICONS.ALTERNATIVE_CONNECTION,
            title: translate(TOOLTIP_KEYS.ALTERNATIVE_FLOW),
            action: {
              click: startConnect,
              dragstart: startConnect
            }
          }
        });
      }
    }
  };
  // ProcessOperator - no flow conditions, all types are shown
  if (is(element, ELEMENT_TYPES.PROCESS_OPERATOR)) {
    if (noOfElementsUnderTheSource(element, states) > 0) {
      assign(pad, {
        [ENTRY_IDS.CONNECT]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.CONNECT,
          title: translate(TOOLTIP_KEYS.CONNECT_WITH_STATES, { type: elementType }),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        },
        [ENTRY_IDS.CONNECT_PARALLEL]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.PARALLEL_CONNECTION,
          title: translate(TOOLTIP_KEYS.PARALLEL_PROCESS),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        },
        [ENTRY_IDS.CONNECT_ALTERNATIVE]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.ALTERNATIVE_CONNECTION,
          title: translate(TOOLTIP_KEYS.ALTERNATIVE_PROCESS),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        }
      });
    }
    if (technicalResourcesAvailable(element, technicalResources)) {
      assign(pad, {
        [ENTRY_IDS.CONNECT_USAGE]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.USAGE,
          title: translate(TOOLTIP_KEYS.CONNECT_PROCESS_OPERATOR_WITH_TR),
          action: {
            click: startConnect,
            dragstart: startConnect
          }
        }
      });
    }
    // Show decompose button only if ProcessOperator has at least one input and one output
    if (ElementTypeUtils.canDecompose(element, noOfUsageConnections)) {
      assign(pad, {
        [ENTRY_IDS.DECOMPOSE]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.DECOMPOSE,
          title: translate(TOOLTIP_KEYS.DECOMPOSE_PROCESS_OPERATOR),
          action: {
            click: decompose
          }
        }
      });
    }

  };
  // TechnicalResource can create Usage flows
  if (is(element, ELEMENT_TYPES.TECHNICAL_RESOURCE)) {
    assign(pad, {
      [ENTRY_IDS.CONNECT_USAGE]: {
        group: ENTRY_GROUPS.EDIT,
        className: CONTEXT_PAD_ICONS.USAGE,
        title: translate(TOOLTIP_KEYS.CONNECT_TR_WITH_PROCESS_OPERATOR),
        action: {
          click: startConnect,
          dragstart: startConnect
        }
      }
    });
  }
  // SystemLimit provides compose/switch functionality
  //TODO: Check if StateShapes lie on system boundary
  if (is(element, ELEMENT_TYPES.SYSTEM_LIMIT)) {
    if (process.businessObject.isDecomposedProcessOperator) {
      assign(pad, {
        [ENTRY_IDS.COMPOSE]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.SWITCH_UP,
          title: translate(TOOLTIP_KEYS.SWITCH_TO_PARENT),
          action: {
            click: compose
          }
        }
      });
    } else {
      assign(pad, {
        [ENTRY_IDS.COMPOSE]: {
          group: ENTRY_GROUPS.EDIT,
          className: CONTEXT_PAD_ICONS.COMPOSE,
          title: translate(TOOLTIP_KEYS.COMPOSE_SYSTEM_LIMIT),
          action: {
            click: compose
          }
        }
      });
    }
  }
  return pad
};


