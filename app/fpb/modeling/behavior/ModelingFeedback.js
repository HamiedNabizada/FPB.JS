import { is, isAny } from '../../help/utils';


var STATE_NOT_IN_SYSTEMLIMIT = 'Product, energy and information must be on or within the system limit',
    PO_NOT_IN_SYTEMLIMIT = 'Process operators must be within the system limits.',
    TR_IN_SYSTEMLIMIT = 'Technical resources must be outside the system limits.';

var SWITCHINGPROCESS = 'Switching between processes is purely for navigation purposes. The decomposition and composition functionalities are used to transfer changes to higher and lower process levels.'


export default function ModelingFeedback(eventBus, tooltips, translate, canvas) {

    function showError(position, message, timeout) {
        tooltips.add({
            position: {
                x: position.x + 5,
                y: position.y + 5
            },
            type: 'error',
            timeout: timeout || 2000,
            html: '<div>' + message + '</div>'
        });
    }
    function showTipp(message, position) {
        tooltips.add({
            position: {
                x: position.x,
                y: position.y
            },
            type: 'tipp',
            timeout: 2000,
            html: '<div>' + message + '</div>'
        })
    }
    // 
    eventBus.on(['illegalMove'], function (event) {
        let source = event.movedElement.type.replace('fpb:', '');
        let target = event.targetElement.type.replace('fpb:', '');
        let msg = translate('You are not allowed to move {src} on {target}', { src: source, target: target });
        showError(event.position, msg)
    });
    eventBus.on(['illegalCreate'], function (event) {
        let source = event.movedElement.type.replace('fpb:', '');
        let target = event.targetElement.type.replace('fpb:', '');
        let msg = translate('You are not allowed to place a {src} on a {target}', { src: source, target: target });
        showError(event.position, msg)
    });
    eventBus.on(['toolTips.decomposedProcessOperator'], function (event) {
        let command = event.command;
        let processOperator = event.processOperator;
        if (command === 'deleted') {
            let msg = translate('The deleted ProcessOperator had decomposed views. These were all deleted with.')
            showError({ x: processOperator.x, y: processOperator.y }, msg);
        }
        if (command === 'newStateConnected') {
            let canvasViewbox = canvas.viewbox();
            let msg = translate('The ProcessOperator has a decomposed view. The connected state is placed on its system boundary as soon as the decompose icon is clicked again.');
            showTipp(msg, { x: canvasViewbox.x + 10, y: canvasViewbox.height - 200 })
        }
        if (command === 'deletedConnection') {
            let msg = translate('The deleted connection was connected to a decomposed ProcessOperator. The connected state is thus deleted in the decomposed view.')
            showError({ x: processOperator.x, y: processOperator.y }, msg)
        }
    })


    eventBus.on(['toolTips.processSwitched'], function (event) {
        let canvasViewbox = canvas.viewbox();
        showTipp(translate(SWITCHINGPROCESS), { x: canvasViewbox.x + 10, y: canvasViewbox.height - 200 })
    })

    eventBus.on(['toolTips.effectOnOtherLevel'], function (event) {

    })

    eventBus.on(['shape.move.rejected', 'create.rejected'], function (event) {
        var context = event.context,
            shape = context.shape,
            target = context.target;
        if (!is(target, 'fpb:SystemLimit') && is(shape, 'fpb:State')) {
            showError(event, translate(STATE_NOT_IN_SYSTEMLIMIT));
        };
        if (!is(target, 'fpb:SystemLimit') && is(shape, 'fpb:ProcessOperator')) {
            showError(event, translate(PO_NOT_IN_SYTEMLIMIT));
        };
        if (isAny(target, ['fpb:SystemLimit', 'fpb:Product', 'fpb:Energy', 'fpb:Information', 'fpb:ProcessOperator']) && is(shape, 'fpb:TechnicalResource')) {
            showError(event, translate(TR_IN_SYSTEMLIMIT));
        };

    });


}

ModelingFeedback.$inject = [
    'eventBus',
    'tooltips',
    'translate',
    'canvas'
];
