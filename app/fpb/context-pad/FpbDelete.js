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
  // links from the rest of a kept AML file (feature 028), or those a host
  // hands over per layer (016f E4)
  this._amlSupport = injector ? injector.get('amlSupport', false) : null;
  this._hostLinks = injector ? injector.get('fpbAmlLinks', false) : null;
  const translate = injector ? injector.get('translate', false) : null;
  this._translate = translate || ((text) => text);

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
FpbDelete.prototype.getAmlLinks = function (elements, options) {
  const amlSupport = this._amlSupport;
  if (!amlSupport || !amlSupport.getIndex()) {
    return this._usesHostLinks() ? this._getHostLinks(elements, options) : [];
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
    // layers not on the canvas have no children there: their elements are in
    // the elementsContainer of the process and its system limit
    ((bo && bo.elementsContainer) || []).forEach(visit);
    if (bo && bo.decomposedView) {
      visit(bo.decomposedView);
    }
  };
  (elements || []).forEach(visit);
  return found;
};

FpbDelete.prototype._usesHostLinks = function () {
  return !!(this._hostLinks && this._hostLinks.isSet() && !(this._amlSupport && this._amlSupport.getIndex()));
};

/**
 * The links of the host's list the deletion removes (016f E4, V19). Each
 * element counts on its layer and the layers below it: FPB.js deletes the
 * copies of a state downwards (Szenario 1 and 9), never upwards (Szenario 2).
 * A flow between a state and a decomposed operator takes the state's copy on
 * the operator's layer along (ConnectionUpdater._removeStateFromLayersBelow).
 * With options.process the process element of that layer counts too
 * (removing a decomposition).
 */
FpbDelete.prototype._getHostLinks = function (elements, options) {
  const hostLinks = this._hostLinks;
  const found = [];
  const add = (entries) => entries.forEach((l) => {
    if (!found.some((f) => f.element === l.name && f.link === l.link && f.owner === l.owner)) {
      found.push({ element: l.name, link: l.link, owner: l.owner });
    }
  });
  const layersFrom = (layer) => {
    const ids = [];
    const queue = [layer];
    while (queue.length) {
      const process = queue.shift();
      if (!process || ids.indexOf(process.id) !== -1) {
        continue;
      }
      ids.push(process.id);
      ((process.businessObject && process.businessObject.consistsOfProcesses) || []).forEach((child) => queue.push(child));
    }
    return ids;
  };
  const seen = new Set();
  const visit = (element, layer) => {
    if (!element || seen.has(element)) {
      return;
    }
    seen.add(element);
    if (element.waypoints) {
      const ends = [element.source, element.target];
      const operator = ends.find((end) => is(end, ELEMENT_TYPES.PROCESS_OPERATOR) && end.businessObject.decomposedView);
      const state = ends.find((end) => isAny(end, ELEMENT_GROUPS.STATES));
      if (operator && state) {
        add(hostLinks.of(state.id, layersFrom(operator.businessObject.decomposedView)));
      }
      return;
    }
    add(hostLinks.of(element.id, layersFrom(layer)));
    (element.children || []).forEach((child) => visit(child, layer));
    const bo = element.businessObject;
    // layers not on the canvas have no children there: their elements are in
    // the elementsContainer of the process and its system limit
    ((bo && bo.elementsContainer) || []).forEach((child) => visit(child, layer));
    if (bo && bo.decomposedView) {
      visit(bo.decomposedView, bo.decomposedView);
    }
  };
  const shown = this._contextHelper.getProcessContext().process;
  if (options && options.process) {
    add(hostLinks.of(options.process.id, [options.process.id]));
  }
  (elements || []).forEach((element) => visit(element, shown));
  return found;
};

FpbDelete.prototype._amlLinksText = function (links) {
  const names = links.slice(0, 5).map((l) => `${l.link} (${l.owner}) to ${l.element}`);
  const more = links.length > 5 ? `, and ${links.length - 5} more` : '';
  const closing = this._usesHostLinks()
    ? this._translate('Applying the diagram to the AML file removes them.')
    : 'Exporting as AML removes them with the deleted elements.';
  return `Links: ${names.join(', ')}${more}. ${closing}`;
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
      const amlLinks = this.getAmlLinks([decomposition], { process });
      this._eventBus.fire('confirmation.required', {
        title: 'Remove the decomposition of "' + (decomposition.businessObject.name || 'unnamed operator') + '"?',
        confirmLabel: 'Remove',
        confirmVariant: 'danger',
        message: consequences.message + (amlLinks.length ? ' Other parts of the AutomationML file link to elements of this layer.' : ''),
        details: consequences.details + (amlLinks.length ? ' ' + this._amlLinksText(amlLinks) : ''),
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
    details: this._amlLinksText(amlLinks)
  } : null;

  let message = layer ? layer.message : aml.message;
  if (layer && (withConsequences.length > 1 || elements.length > 1)) {
    message += ' The selection contains ' + elements.length + ' elements.';
  }
  if (layer && aml) {
    message += ' ' + aml.message;
  }

  this._eventBus.fire('confirmation.required', {
    // name the element (016c decision 13)
    title: elements.length === 1
      ? 'Delete "' + ((elements[0].businessObject && elements[0].businessObject.name) || 'this element') + '"?'
      : 'Delete ' + elements.length + ' elements?',
    confirmLabel: 'Delete',
    confirmVariant: 'danger',
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
