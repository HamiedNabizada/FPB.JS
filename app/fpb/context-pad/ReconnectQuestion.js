import { isReverse } from 'diagram-js/lib/features/bendpoints/BendpointMove';

import { is, isAny } from '../help/utils';
import { ELEMENT_GROUPS } from '../rules/RuleConstants';
import { ELEMENT_TYPES } from './ContextPadConstants';
import { fill } from '../i18n/language';

/**
 * B23: dragging the end of a flow off a decomposed operator takes the copy of
 * the state on the layers below along, as deleting the flow does
 * (ConnectionUpdater._removeStateFromLayersBelow). When the AML file links to
 * that copy, the user is asked first, with the same list as the delete
 * question (FpbDelete.getAmlLinks); Cancel leaves the flow where it was.
 */
export default function ReconnectQuestion(eventBus, modeling, fpbDelete, injector) {
  this._fpbDelete = fpbDelete;
  const translate = injector.get('translate', false) || fill;

  // before BendpointMove (priority 1000), which reconnects at once
  eventBus.on('bendpoint.move.end', 1500, (event) => {
    const context = event.context;
    if (!context.allowed || (context.type !== 'reconnectStart' && context.type !== 'reconnectEnd')) {
      return;
    }
    const connection = context.connection;
    const loss = this.copyGoing(connection, context.source, context.target);
    const links = loss ? fpbDelete.getAmlLinks([ { waypoints: [], source: loss.state, target: loss.operator } ]) : [];
    if (!links.length) {
      return;
    }

    // what BendpointMove would hand to modeling.reconnect
    const hints = Object.assign({}, context.hints);
    const reverse = isReverse(context);
    hints.docking = (context.type === 'reconnectStart') !== !!reverse ? 'source' : 'target';
    if (reverse) {
      hints.newWaypoints = connection.waypoints.slice().reverse();
    }
    const docking = { x: Math.round(event.x), y: Math.round(event.y) };
    const name = (element) => (element.businessObject && element.businessObject.name) || '';

    eventBus.fire('confirmation.required', {
      title: translate('Reconnect the flow?'),
      confirmLabel: translate('Reconnect'),
      confirmVariant: 'danger',
      message: translate('The flow no longer ends at "{operator}": the copy of "{state}" on the layer below goes with it. Other parts of the AutomationML file link to it.', {
        operator: name(loss.operator) || translate('unnamed operator'),
        state: name(loss.state) || translate('this element')
      }),
      details: fpbDelete._amlLinksText(links),
      isBlocked: false,
      action: { type: 'reconnect', connection, source: context.source, target: context.target, docking, hints }
    });

    // the drag ends without a change until the user confirms
    return false;
  });

  eventBus.on('confirmation.confirmed', (event) => {
    const action = event.action;
    if (action && action.type === 'reconnect') {
      modeling.reconnect(action.connection, action.source, action.target, action.docking, action.hints);
    }
  });
}

ReconnectQuestion.$inject = [ 'eventBus', 'modeling', 'fpbDelete', 'injector' ];

/**
 * The state and the decomposed operator whose copy below a reconnect removes:
 * the flow joined them and no longer does, and no other flow joins them (as
 * ConnectionUpdater._handleReconnectEnds decides). Null otherwise.
 */
ReconnectQuestion.prototype.copyGoing = function (connection, newSource, newTarget) {
  const before = stateAndOperator(connection.source, connection.target);
  if (!before || !before.operator.businessObject || !before.operator.businessObject.decomposedView) {
    return null;
  }
  const after = stateAndOperator(newSource, newTarget);
  if (after && after.state === before.state && after.operator === before.operator) {
    return null;
  }
  const otherFlow = (before.state.outgoing || []).concat(before.state.incoming || []).some((flow) =>
    flow !== connection && (flow.source === before.operator || flow.target === before.operator));
  return otherFlow ? null : before;
};

function stateAndOperator(source, target) {
  const ends = [ source, target ];
  const state = ends.find((end) => end && isAny(end, ELEMENT_GROUPS.STATES));
  const operator = ends.find((end) => end && is(end, ELEMENT_TYPES.PROCESS_OPERATOR));
  return state && operator ? { state, operator } : null;
}
