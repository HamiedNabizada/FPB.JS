import inherits from 'inherits';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import { isAny, is } from '../../help/utils';

const BRANCHING = ['fpb:AlternativeFlow', 'fpb:ParallelFlow'];

/**
 * Keeps the flow types at a source consistent: drawing a parallel or
 * alternative flow next to a normal one turns that one into the same type, and
 * a branching that loses all but one flow becomes a normal flow again.
 *
 * The change runs through the command fpb.changeType, which keeps the id of the
 * connection. Before, the flow was deleted and a new one created, so ids
 * changed on their own and references to them went stale (bug B07).
 *
 * Dragging an end onto another element counts as both: the flow leaves its old
 * source and arrives at a new one, so both rules apply.
 */
export default function ReplaceConnectionBehavior(eventBus, commandStack) {
    CommandInterceptor.call(this, eventBus);

    function changeType(connection, newType) {
        commandStack.execute('fpb.changeType', {
            element: connection,
            newType: newType,
            scope: 'connection'
        });
    }

    /**
     * A branching flow arrived at `source`: a normal flow already there becomes
     * the same type.
     */
    function arrivedAt(connection, source) {
        if (!isAny(connection, BRANCHING)) {
            return;
        }
        let replaceFlow;
        ((source && source.outgoing) || []).forEach((flow) => {
            if (flow !== connection && !isAny(flow, BRANCHING.concat(['fpb:Usage']))) {
                replaceFlow = flow;
            }
        });
        if (replaceFlow) {
            changeType(replaceFlow, connection.type);
        }
    }

    /**
     * A branching flow left `source`: if a single flow is left there, the
     * branching is gone and that flow becomes a normal one.
     */
    function leftFrom(connection, source) {
        if (!isAny(connection, BRANCHING)) {
            return;
        }
        let replaceFlow;
        let counter = 0;
        ((source && source.outgoing) || []).forEach((flow) => {
            if (flow !== connection && !is(flow, 'fpb:Usage')) {
                counter++;
                replaceFlow = flow;
            }
        });
        if (counter === 1 && isAny(replaceFlow, BRANCHING)) { // Only one flow connection remains
            changeType(replaceFlow, 'fpb:Flow');
        }
    }

    this.postExecuted('connection.create', function (e) {
        arrivedAt(e.context.connection, e.context.source);
    });

    this.postExecuted('connection.delete', function (e) {
        leftFrom(e.context.connection, e.context.source);
    });

    // 'connection.reconnect' is the command diagram-js executes for both ends;
    // only a new source changes which flows branch together.
    this.postExecuted('connection.reconnect', function (e) {
        const { connection, newSource, oldSource } = e.context;

        if (!newSource || newSource === oldSource) {
            return;
        }
        leftFrom(connection, oldSource);
        // A branching flow on its own is no branching: it arrives alone unless
        // the new source already carries flows of its own.
        if (isAny(connection, BRANCHING) && !hasOtherFlows(connection, newSource)) {
            changeType(connection, 'fpb:Flow');
            return;
        }
        arrivedAt(connection, newSource);
    });

    function hasOtherFlows(connection, source) {
        return ((source && source.outgoing) || []).some((flow) => {
            return flow !== connection && !is(flow, 'fpb:Usage');
        });
    }
}

inherits(ReplaceConnectionBehavior, CommandInterceptor);

ReplaceConnectionBehavior.$inject = [
    'eventBus',
    'commandStack'
];
