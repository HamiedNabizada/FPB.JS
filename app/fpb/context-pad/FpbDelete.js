import { is, isAny } from '../help/utils';
import { ELEMENT_GROUPS } from '../rules/RuleConstants';
import { checkIfOnSystemBorder } from '../help/helpUtils';
import { ELEMENT_TYPES } from './ContextPadConstants';
import { ContextHelper } from './ContextPadUtils';

/**
 * Deletes elements the way the context pad always did: plainly when nothing else
 * is affected, behind a confirmation when another layer is. Shared by the
 * context pad and the Delete key, so the key does not skip the dialog.
 */
export default function FpbDelete(eventBus, modeling, canvas) {
  this._eventBus = eventBus;
  this._modeling = modeling;
  this._contextHelper = new ContextHelper(canvas);

  eventBus.on('confirmation.confirmed', function (event) {
    const action = event.action;
    if (action && action.type === 'delete') {
      const elements = action.elements || (action.element ? [action.element] : []);
      if (elements.length) {
        modeling.removeElements(elements.slice());
      }
    }
  });
}

FpbDelete.$inject = ['eventBus', 'modeling', 'canvas'];

/**
 * Cross-layer consequences of deleting the element, or null.
 */
FpbDelete.prototype.getLayerConsequences = function (element) {
  const { process, systemLimit } = this._contextHelper.getProcessContext();

  // ProcessOperator with a decomposed layer (decomposedView is the child process shape)
  if (is(element, ELEMENT_TYPES.PROCESS_OPERATOR)) {
    const bo = element.businessObject;
    if (bo && bo.decomposedView) {
      return {
        type: 'decomposed_process_operator',
        message: 'This process operator contains a decomposed layer. Deleting it will also remove all elements in the subordinate layer.',
        details: 'The entire subordinate process will be deleted.'
      };
    }
  }

  // State on the system boundary of a decomposed layer
  if (isAny(element, ELEMENT_GROUPS.STATES)) {
    if (process && process.businessObject && process.businessObject.isDecomposedProcessOperator && systemLimit) {
      const borderCheck = checkIfOnSystemBorder(systemLimit, element);
      if (borderCheck === 'onUpperBorder' || borderCheck === 'onBottomBorder') {
        return {
          type: 'boundary_state',
          message: 'This state is connected to the parent layer.',
          details: 'Deleting this boundary state will also remove the corresponding connection on the parent layer.'
        };
      }
    }
  }

  // Deleting the SystemLimit on a child layer undoes the decomposition
  if (is(element, ELEMENT_TYPES.SYSTEM_LIMIT)) {
    if (process && process.businessObject && process.businessObject.isDecomposedProcessOperator) {
      const parentPO = process.businessObject.isDecomposedProcessOperator;
      const poName = parentPO.name || 'ProcessOperator';
      return {
        type: 'remove_decomposition',
        message: 'Deleting the system limit will remove the entire decomposition of ProcessOperator "' + poName + '".',
        details: 'You will be redirected to the parent process. All elements in this process will be deleted.'
      };
    }
  }

  return null;
};

/**
 * Removes the elements. With consequences for other layers the user confirms
 * first; the dialog then covers the whole selection.
 */
FpbDelete.prototype.remove = function (elements) {
  elements = (elements || []).filter(Boolean);
  if (!elements.length) {
    return;
  }

  const process = this._contextHelper.getProcessContext().process;
  const decomposition = elements.find((element) => {
    const consequences = this.getLayerConsequences(element);
    return consequences && consequences.type === 'remove_decomposition';
  });

  // Removing a decomposition has its own flow (ConfirmationHandler), alone.
  if (decomposition) {
    if (elements.length === 1) {
      const consequences = this.getLayerConsequences(decomposition);
      this._eventBus.fire('confirmation.required', {
        title: 'Remove Decomposition?',
        message: consequences.message,
        details: consequences.details,
        isBlocked: false,
        action: {
          type: 'remove_decomposition',
          element: decomposition,
          consequenceType: consequences.type,
          process: process,
          parentProcessOperator: process.businessObject.isDecomposedProcessOperator
        }
      });
    }
    return;
  }

  const withConsequences = elements
    .map((element) => this.getLayerConsequences(element))
    .filter(Boolean);

  if (!withConsequences.length) {
    this._modeling.removeElements(elements.slice());
    return;
  }

  const first = withConsequences[0];
  this._eventBus.fire('confirmation.required', {
    title: 'Confirm deletion',
    message: withConsequences.length === 1 && elements.length === 1
      ? first.message
      : first.message + ' The selection contains ' + elements.length + ' elements.',
    details: first.details,
    isBlocked: false,
    action: {
      type: 'delete',
      element: elements[0],
      elements: elements,
      consequenceType: first.type
    }
  });
};
