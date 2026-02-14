import { forEach, some } from "min-dash";

import { is, isAny } from '../../help/utils';
import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

import { checkIfOnSystemBorder, getElementById, getElementsFromElementsContainer, createStateShapeForNewLayer } from '../../help/helpUtils'

export default function ComposeProcess(canvas, modeling, elementFactory, eventBus, elementRegistry, fpbjs) {
    this._canvas = canvas;
    this._modeling = modeling;
    this._elementFactory = elementFactory;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._fpbjs = fpbjs;
}

ComposeProcess.$inject = [
    'canvas',
    'modeling',
    'elementFactory',
    'eventBus',
    'elementRegistry',
    'fpbjs'
];
// Preprocessing
ComposeProcess.prototype.preExecute = function (context) {
    const canvas = this._canvas;
    const systemLimitOld = context.element;
    const processOld = canvas.getRootElement();
    let processOperatorNew;
    let processNew;
    let systemLimitNew;
    let technicalResources;
    let systemLimitFlows;
    let processFlows;
    let stateShapes = [];

    if (processOld.businessObject.isDecomposedProcessOperator) {
        // Process already has a parent process
        // TODO: Difficult case:
        /*It would need to be checked which StateShapes are newly on the system boundary and then attach them
         to the ProcessOperator in the parent process. The calculation for this becomes extremely complex,
         as free positions need to be determined, the system boundary adjusted,
         and care must be taken that shapes are not placed on top of existing flows.
         The bottom-up approach is therefore somewhat harder to implement.
         Temporary solution for Version1: Semi bottom-up approach, only one process can be composed at the most detailed level,
         after that decomposition must always start from the parent process first.
        */
        processNew = processOld.businessObject.parent;
        systemLimitNew = getElementsFromElementsContainer(processNew.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
        if (!systemLimitNew) {
            context.aborted = true;
            return;
        }
        technicalResources = getElementsFromElementsContainer(processNew.businessObject.elementsContainer, 'fpb:TechnicalResource');
        // This also includes the ProcessOperators
        stateShapes = getElementsFromElementsContainer(systemLimitNew.businessObject.elementsContainer, 'fpb:Object');
        systemLimitFlows = getElementsFromElementsContainer(systemLimitNew.businessObject.elementsContainer, 'fpb:Flow');
        processFlows = getElementsFromElementsContainer(processNew.businessObject.elementsContainer, 'fpb:Flow');
        context.command = false;
        context.processNew = processNew;
        context.systemLimitNew = systemLimitNew;
        context.stateShapes = stateShapes;
        context.technicalResources = technicalResources;
        context.systemLimitFlows = systemLimitFlows;
        context.processFlows = processFlows;

    } else {
        // Process has no parent process

        // Retrieve StateShapes that are on the system boundary
        (systemLimitOld.businessObject.elementsContainer || []).forEach((state) => {
            if (is(state, 'fpb:State')) {
                if (checkIfOnSystemBorder(systemLimitOld, state) === 'onUpperBorder') {
                    stateShapes.push({ state: createStateShapeForNewLayer(this._elementFactory, state.type, state.businessObject), position: 'incoming' });
                };
                if (checkIfOnSystemBorder(systemLimitOld, state) === 'onBottomBorder') {
                    stateShapes.push({ state: createStateShapeForNewLayer(this._elementFactory, state.type, state.businessObject), position: 'outgoing' });
                };
            }
        })
        // Create new process
        processNew = this._elementFactory.create('root', {
            type: 'fpb:Process'
        });
        let project = this._fpbjs.getProjectDefinition();
        project.entryPoint = processNew;

        /*
        processNew.businessObject.ProjectAssignment = processOld.businessObject.ProjectAssignment;
        processOld.businessObject.ProjectAssignment.entryPoint = processNew;*/
        processOld.businessObject.parent = processNew;
        processOperatorNew = this._elementFactory.create('shape', {
            type: 'fpb:ProcessOperator',
            id: processOld.id
        })
       // processNew.businessObject.parent = processNew.businessObject.ProjectAssignment;
       processNew.businessObject.parent = project;
        processOperatorNew.businessObject.decomposedView = processOld;

        // Use the SystemLimit name as label for the new ProcessOperator
        processOperatorNew.businessObject.name = systemLimitOld.businessObject.name
        processOld.businessObject.isDecomposedProcessOperator = processOperatorNew.businessObject;
        collectionAdd(processNew.businessObject.consistsOfProcesses, processOld);

        systemLimitNew = this._elementFactory.create('shape', {
            type: 'fpb:SystemLimit'
        });

        processNew.businessObject.consistsOfSystemLimit = systemLimitNew.businessObject;
        collectionAdd(processNew.businessObject.elementsContainer, systemLimitNew);

        collectionAdd(systemLimitNew.businessObject.elementsContainer, processOperatorNew);
        stateShapes.forEach((state) => {
            collectionAdd(systemLimitNew.businessObject.elementsContainer, state.state);
            collectionAdd(processNew.businessObject.consistsOfStates, state.state.businessObject);
        })

        // Default positioning
        systemLimitNew.x = 350;
        systemLimitNew.y = 50;

        computePositions(systemLimitNew, stateShapes, processOperatorNew, 75);

        // Fire event for LayerPanel
        this._eventBus.fire('layerPanel.newProcess', {
            newProcess: processNew,
            parentProcess: processOld
        });
        context.command = true;
        context.processNew = processNew;
        context.systemLimitNew = systemLimitNew;
        context.stateShapes = stateShapes;
        context.processOperatorNew = processOperatorNew;

    }
}

ComposeProcess.prototype.execute = function (context) {
    if (context.aborted) return;

    const canvas = this._canvas;
    const systemLimitNew = context.systemLimitNew;
    const stateShapes = context.stateShapes;
    const processNew = context.processNew;

    if (context.command) {
        const processOperatorNew = context.processOperatorNew;

        canvas._clear();
        canvas.setRootElement(processNew, true);
        // Reset in case the view was zoomed and scrolled
        const zoomedAndScrolledViewbox = canvas.viewbox();
        canvas.viewbox({
            x: 0,
            y: 0,
            width: zoomedAndScrolledViewbox.outer.width,
            height: zoomedAndScrolledViewbox.outer.height
        });


        // This should be fail-safe
        canvas.addShape(systemLimitNew, processNew);
        canvas.addShape(processOperatorNew, systemLimitNew);
        stateShapes.forEach((state) => {
            canvas.addShape(state.state, systemLimitNew)
        });
    } else {
        const processFlows = context.processFlows;
        const technicalResources = context.technicalResources;
        const systemLimitFlows = context.systemLimitFlows;
        // Clear the canvas and place the shapes
        canvas._clear();
        canvas.setRootElement(processNew, true);
        // Reset in case the view was zoomed and scrolled
        const zoomedAndScrolledViewbox = canvas.viewbox();
        canvas.viewbox({
            x: 0,
            y: 0,
            width: zoomedAndScrolledViewbox.outer.width,
            height: zoomedAndScrolledViewbox.outer.height
        });
        // This should be fail-safe
        canvas.addShape(systemLimitNew, processNew);
        technicalResources.forEach(element => {
            canvas.addShape(element, processNew)
        });
        stateShapes.forEach(element => {
            canvas.addShape(element, systemLimitNew)
        });
        processFlows.forEach(element => {
            canvas.addConnection(element, processNew)
        });
        systemLimitFlows.forEach(element => {
            canvas.addConnection(element, systemLimitNew)
        });
    }

};

ComposeProcess.prototype.postExecute = function (context) {
    if (context.aborted) return;

    const modeling = this._modeling;
    // Connect elements with each other
    const stateShapes = context.stateShapes;
    const processOperatorNew = context.processOperatorNew;

    if (context.command) {
        stateShapes.forEach((state) => {
            if (state.position === 'incoming') {
                modeling.connect(state.state, processOperatorNew, {
                    type: 'fpb:Flow',
                });
            }
            if (state.position === 'outgoing') {
                modeling.connect(processOperatorNew, state.state, {
                    type: 'fpb:Flow',
                });
            }
            if (state.state.businessObject.name) {
                if (state.state.labels[0]) {
                    collectionRemove(state.state.labels, state.state.labels[0]);
                    delete state.state.businessObject.di.label;
                }
                modeling.updateLabel(state.state, state.state.businessObject.name);
            }

        });
        if (processOperatorNew.businessObject.name) {
            modeling.updateLabel(processOperatorNew, processOperatorNew.businessObject.name);
        }
    } else {
        stateShapes.forEach((state) => {
            if (state.businessObject.name) {
                if (state.labels[0]) {
                    collectionRemove(state.labels, state.labels[0]);
                    delete state.businessObject.di.label;
                }
                modeling.updateLabel(state, state.businessObject.name);
            }
        });
    }

    this._eventBus.fire('layerPanel.processSwitched', {
        selectedProcess: context.processNew
    });

};

function computePositions(systemLimit, stateShapes, processOperator, deltaX) {

    let noOfIncoming = stateShapes.reduce((a, c) => c.position === 'incoming' ? ++a : a, 0);
    let noOfOutgoing = stateShapes.reduce((a, c) => c.position === 'outgoing' ? ++a : a, 0);
    let di1 = 0;
    let di2 = 0;
    // Offset the start point if the counts are not equal
    if (noOfIncoming > noOfOutgoing) {
        di2 = (50 + deltaX) * ((noOfIncoming - noOfOutgoing) / 2)
    }
    if (noOfOutgoing > noOfIncoming) {
        di1 = (50 + deltaX) * ((noOfOutgoing - noOfIncoming) / 2)
    }

    let stateStartIncomingX = systemLimit.x + deltaX + di1;
    let stateIncomingY = systemLimit.y + 0.25 * systemLimit.height;
    let stateStartOutgoingX = systemLimit.x + deltaX + di2;
    let stateOutgoingY = systemLimit.y + 0.75 * systemLimit.height;

    let stateEndIncomingX = stateStartIncomingX;
    let stateEndOutgoingX = stateStartOutgoingX;


    stateShapes.forEach((state) => {
        if (state.position === 'incoming') {
            state.state.x = stateEndIncomingX;
            state.state.y = stateIncomingY;
            stateEndIncomingX += deltaX;
            if ((systemLimit.x + systemLimit.width) <= stateEndIncomingX) {
                systemLimit.width += 2 * deltaX;
            }
        }
        if (state.position === 'outgoing') {
            state.state.x = stateEndOutgoingX;
            state.state.y = stateOutgoingY;
            stateEndOutgoingX += deltaX;
            if ((systemLimit.x + systemLimit.width) <= stateEndOutgoingX) {
                systemLimit.width += 2 * deltaX;
            }
        }
    })
    processOperator.x = systemLimit.x + Math.max((stateEndIncomingX - stateStartIncomingX), (stateEndOutgoingX - stateStartIncomingX)) / 2;
    processOperator.y = systemLimit.y + 0.5 * systemLimit.height;
}