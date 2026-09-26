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
export default function FpbDelete(eventBus, modeling, canvas, injector) {
  this._eventBus = eventBus;
  this._modeling = modeling;
  this._contextHelper = new ContextHelper(canvas);
  // links from the rest of a kept AML file (feature 028)
  this._amlSupport = injector ? injector.get('amlSupport', false) : null;

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

FpbDelete.$inject = ['eventBus', 'modeling', 'canvas', 'injector'];

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

    // Elsewhere the system limit takes its contents along, decomposed
    // operators and their layers included: the same question as for one of
    // those operators on its own
    const decomposed = (element.children || []).filter((child) =>
      is(child, ELEMENT_TYPES.PROCESS_OPERATOR) && child.businessObject && child.businessObject.decomposedView);
    if (decomposed.length) {
      return {
        type: 'decomposed_process_operator',
        message: decomposed.length === 1
          ? 'The system limit contains a decomposed process operator. Deleting it will also remove the subordinate layer.'
          : 'The system limit contains ' + decomposed.length + ' decomposed process operators. Deleting it will also remove their subordinate layers.',
        details: 'The entire subordinate processes will be deleted.'
      };
    }
  }

  return null;
};

/**
 * Links from the rest of the kept AML file into what the deletion removes: the
 * elements, their contents and the layers of decomposed operators. The AML
 * export removes such links with the element, so the user is told before.
 *
 * @return {Array<{ element: string, link: string, owner: string }>}
 */
FpbDelete.prototype.getAmlLinks = function (elements) {
  const amlSupport = this._amlSupport;
  if (!amlSupport || !amlSupport.getIndex()) {
    return [];
  }
  const found = [];
  const seen = new Set();
  const visit = (element) => {
    if (!element || seen.has(element)) {
      return;
    }
    seen.add(element);
    const content = amlSupport.getForeignContent(element.id);
    (content ? content.links : []).forEach((l) => {
      if (!found.some((f) => f.element === content.name && f.link === l.link && f.owner === l.owner)) {
        found.push({ element: content.name, link: l.link, owner: l.owner });
      }
    });
    (element.children || []).forEach(visit);
    const bo = element.businessObject;
    if (bo && bo.decomposedView) {
      visit(bo.decomposedView);
    }
  };
  (elements || []).forEach(visit);
  return found;
};

function amlLinksText(links) {
  const names = links.slice(0, 5).map((l) => `${l.link} (${l.owner}) to ${l.element}`);
  const more = links.length > 5 ? `, and ${links.length - 5} more` : '';
  return `Links: ${names.join(', ')}${more}. Exporting as AML removes them with the deleted elements.`;
}

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
      const amlLinks = this.getAmlLinks([decomposition]);
      this._eventBus.fire('confirmation.required', {
        title: 'Remove Decomposition?',
        message: consequences.message + (amlLinks.length ? ' Other parts of the AutomationML file link to elements of this layer.' : ''),
        details: consequences.details + (amlLinks.length ? ' ' + amlLinksText(amlLinks) : ''),
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
  const amlLinks = this.getAmlLinks(elements);

  if (!withConsequences.length && !amlLinks.length) {
    this._modeling.removeElements(elements.slice());
    return;
  }

  const layer = withConsequences[0] || null;
  const aml = amlLinks.length ? {
    message: 'Other parts of the AutomationML file link to ' +
      (amlLinks.length === 1 ? 'an element' : 'elements') + ' you are deleting.',
    details: amlLinksText(amlLinks)
  } : null;

  let message = layer ? layer.message : aml.message;
  if (layer && (withConsequences.length > 1 || elements.length > 1)) {
    message += ' The selection contains ' + elements.length + ' elements.';
  }
  if (layer && aml) {
    message += ' ' + aml.message;
  }

  this._eventBus.fire('confirmation.required', {
    title: 'Confirm deletion',
    message,
    details: [layer && layer.details, aml && aml.details].filter(Boolean).join(' '),
    isBlocked: false,
    action: {
      type: 'delete',
      element: elements[0],
      elements: elements,
      consequenceType: layer ? layer.type : 'aml_links'
    }
  });
};
