import { is, isAny } from '../help/utils';
import { ELEMENT_GROUPS } from '../rules/RuleConstants';
import { checkIfOnSystemBorder } from '../help/helpUtils';
import { ELEMENT_TYPES } from './ContextPadConstants';
import { ContextHelper } from './ContextPadUtils';
import { fill } from '../i18n/language';
import { typeName } from '../i18n/typeNames';

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
  this._translate = translate || fill;

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
  const translate = this._translate;

  // ProcessOperator with a decomposed layer (decomposedView is the child process shape)
  if (is(element, ELEMENT_TYPES.PROCESS_OPERATOR)) {
    const bo = element.businessObject;
    if (bo && bo.decomposedView) {
      return {
        type: 'decomposed_process_operator',
        message: translate('This process operator contains a decomposed layer. Deleting it will also remove all elements in the subordinate layer.'),
        details: translate('The entire subordinate process will be deleted.')
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
          message: translate('This state is connected to the parent layer.'),
          details: translate('Deleting this boundary state will also remove the corresponding connection on the parent layer.')
        };
      }
    }
  }

  // Deleting the SystemLimit on a child layer undoes the decomposition
  if (is(element, ELEMENT_TYPES.SYSTEM_LIMIT)) {
    if (process && process.businessObject && process.businessObject.isDecomposedProcessOperator) {
      const parentPO = process.businessObject.isDecomposedProcessOperator;
      const poName = parentPO.name || typeName('fpb:ProcessOperator', translate);
      return {
        type: 'remove_decomposition',
        message: translate('Deleting the system limit will remove the entire decomposition of ProcessOperator "{name}".', { name: poName }),
        details: translate('You will be redirected to the parent process. All elements in this process will be deleted.')
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
          ? translate('The system limit contains a decomposed process operator. Deleting it will also remove the subordinate layer.')
          : translate('The system limit contains {count} decomposed process operators. Deleting it will also remove their subordinate layers.', { count: decomposed.length }),
        details: translate('The entire subordinate processes will be deleted.')
      };
    }
  }

  return null;
};

/**
 * Links from the rest of the AML file that go with what the deletion removes:
 * the elements, their contents and the layers of decomposed operators. The
 * export removes them, so the user is told before. The list comes from the
 * file the web app keeps (amlSupport, B19) or from the host (setAmlLinks).
 *
 * @return {Array<{ element: string, link: string, owner: string }>}
 */
FpbDelete.prototype.getAmlLinks = function (elements, options) {
  const links = this._linkList();
  return links ? this._getHostLinks(links, elements, options) : [];
};

/** The list of links in effect: the kept file's, else the host's, else null */
FpbDelete.prototype._linkList = function () {
  const kept = this._amlSupport && this._amlSupport.getIndex() && this._amlSupport.getLinks
    ? this._amlSupport.getLinks()
    : null;
  if (kept) {
    return kept;
  }
  return this._hostLinks && this._hostLinks.isSet() ? this._hostLinks : null;
};

FpbDelete.prototype._usesHostLinks = function () {
  return !!this._hostLinks && this._linkList() === this._hostLinks;
};

/**
 * The links of the list the deletion removes (016f E4, V19; B19). Each
 * element counts on its layer and the layers below it: FPB.js deletes the
 * copies of a state downwards (Szenario 1 and 9), never upwards (Szenario 2).
 * A flow between a state and a decomposed operator takes the state's copy on
 * the operator's layer along (ConnectionUpdater._removeStateFromLayersBelow).
 * With options.process the whole layer counts (removing a decomposition):
 * its process element, the system limit with its contents and what lies
 * beside it, such as technical resources.
 */
FpbDelete.prototype._getHostLinks = function (hostLinks, elements, options) {
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
    visit(options.process, options.process);
  }
  (elements || []).forEach((element) => visit(element, shown));
  return found;
};

FpbDelete.prototype._amlLinksText = function (links) {
  const translate = this._translate;
  const names = links.slice(0, 5).map((l) => translate('{link} ({owner}) to {element}', { link: l.link, owner: l.owner, element: l.element }));
  // the rest as a part of the list, never an empty value (a translate in the
  // style of diagram-js keeps {more} for '')
  const more = links.length > 5 ? translate(', and {count} more', { count: String(links.length - 5) }) : '';
  const closing = this._usesHostLinks()
    ? translate('Applying the diagram to the AML file removes them.')
    : translate('Exporting as AML removes them with the deleted elements.');
  return translate('Links: {names}. {closing}', { names: names.join(', ') + more, closing });
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
  const translate = this._translate;
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
        title: translate('Remove the decomposition of "{name}"?', { name: decomposition.businessObject.name || translate('unnamed operator') }),
        confirmLabel: translate('Remove'),
        confirmVariant: 'danger',
        message: consequences.message + (amlLinks.length ? ' ' + translate('Other parts of the AutomationML file link to elements of this layer.') : ''),
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
    message: amlLinks.length === 1
      ? translate('Other parts of the AutomationML file link to an element you are deleting.')
      : translate('Other parts of the AutomationML file link to elements you are deleting.'),
    details: this._amlLinksText(amlLinks)
  } : null;

  let message = layer ? layer.message : aml.message;
  if (layer && (withConsequences.length > 1 || elements.length > 1)) {
    message += ' ' + translate('The selection contains {count} elements.', { count: elements.length });
  }
  if (layer && aml) {
    message += ' ' + aml.message;
  }

  this._eventBus.fire('confirmation.required', {
    // name the element (016c decision 13)
    title: elements.length === 1
      ? translate('Delete "{name}"?', { name: (elements[0].businessObject && elements[0].businessObject.name) || translate('this element') })
      : translate('Delete {count} elements?', { count: elements.length }),
    confirmLabel: translate('Delete'),
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
