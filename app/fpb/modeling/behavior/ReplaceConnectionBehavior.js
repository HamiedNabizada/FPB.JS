import inherits from 'inherits';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import { isAny, is } from '../../help/utils';


/**
 * Keeps the flow types at a source consistent: drawing a parallel or
 * alternative flow next to a normal one turns that one into the same type, and
 * a branching that loses all but one flow becomes a normal flow again.
 *
 * The change runs through the command fpb.changeType, which keeps the id of the
 * connection. Before, the flow was deleted and a new one created, so ids
 * changed on their own and references to them went stale (bug B07).
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

    this.postExecuted('connection.create', function (e) {
        let connection = e.context.connection;
        // Only consider Alternative and ParallelFlows
        if (!isAny(connection, ['fpb:AlternativeFlow', 'fpb:ParallelFlow'])) {
            return;
        }
        let sourceOutgoing = e.context.source.outgoing || [];
        let replaceFlow;
        sourceOutgoing.forEach((flow) => {
            if (!isAny(flow, ['fpb:AlternativeFlow', 'fpb:ParallelFlow', 'fpb:Usage'])) {
                replaceFlow = flow;
            }
        })
        if (replaceFlow) {
            changeType(replaceFlow, connection.type);
        }
    })

    this.postExecuted('connection.delete', function (e) {
        // If all Alternative/Parallel Flows except one have been deleted, transform back to Flow
        let connection = e.context.connection;
        if (!isAny(connection, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
            return;
        };
        let sourceOutgoing = e.context.source.outgoing || [];
        let replaceFlow;
        let counter = 0;
        sourceOutgoing.forEach((flow) => {
            if (flow !== connection && !is(flow, 'fpb:Usage')) {
                counter++;
                replaceFlow = flow;
            }
        })
        if (counter === 1 && isAny(replaceFlow, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) { // Only one flow connection remains
            changeType(replaceFlow, 'fpb:Flow');
        }
    })
}

inherits(ReplaceConnectionBehavior, CommandInterceptor);

ReplaceConnectionBehavior.$inject = [
    'eventBus',
    'commandStack'
];
