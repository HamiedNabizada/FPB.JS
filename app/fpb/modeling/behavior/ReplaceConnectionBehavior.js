import inherits from 'inherits';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import { isAny, is } from '../../help/utils';


// The flow is only swapped for one of another type between the same elements.
// Tells ConnectionUpdater to keep the boundary state and its flows in child layers,
// which a real delete would remove.
export const REPLACE_HINTS = { fpbReplaceConnection: true };

export default function ReplaceConnectionBehavior(eventBus, modeling) {
    CommandInterceptor.call(this, eventBus);

    this.postExecuted('connection.create', function (e) {
        let connection = e.context.connection;
        // Only consider Alternative and ParallelFlows
        if (!isAny(connection, ['fpb:AlternativeFlow', 'fpb:ParallelFlow'])) {
            return;
        }
        let sourceOutgoing = e.context.source.outgoing || [];
        let replaceFlow;
        let replaceType;
        sourceOutgoing.forEach((flow) => {
            if (!isAny(flow, ['fpb:AlternativeFlow', 'fpb:ParallelFlow', 'fpb:Usage'])) {
                replaceFlow = flow;
            }
        })
        if (!replaceFlow) {
            return;
        }
        else {
            replaceType = connection.type;
            let replaceSource = replaceFlow.source;
            let replaceTarget = replaceFlow.target;
            modeling.removeConnection(replaceFlow, REPLACE_HINTS);
            modeling.connect(replaceSource, replaceTarget, {
                type: replaceType,
            });
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
        let replaceSource;
        let replaceTarget;
        sourceOutgoing.forEach((flow) => {
            if (flow !== connection && !is(flow, 'fpb:Usage')) {
                counter++;
                replaceFlow = flow;
            }
        })
        if (counter === 1) { // Only one flow connection remains
            replaceSource = replaceFlow.source;
            replaceTarget = replaceFlow.target;
            modeling.removeConnection(replaceFlow, REPLACE_HINTS);
            modeling.connect(replaceSource, replaceTarget, {
                type: 'fpb:Flow',
            });
        }
    })
}

inherits(ReplaceConnectionBehavior, CommandInterceptor);

ReplaceConnectionBehavior.$inject = [
    'eventBus',
    'modeling'
];
