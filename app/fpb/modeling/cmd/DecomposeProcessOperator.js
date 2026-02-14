import { is } from '../../help/utils';

import { getElementsFromElementsContainer, noOfUsageConnections, checkIfOnSystemBorder, createStateShapeForNewLayer } from '../../help/helpUtils';

import {
    some,
} from 'min-dash';

import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';



export default function DecomposeProcessOperator(canvas, modeling, elementFactory, eventBus, elementRegistry) {
    this._canvas = canvas;
    this._modeling = modeling;
    this._elementFactory = elementFactory;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry
}

DecomposeProcessOperator.$inject = [
    'canvas',
    'modeling',
    'elementFactory',
    'eventBus',
    'elementRegistry'];

// Preparation for layer switch
DecomposeProcessOperator.prototype.preExecute = function (context) {
    const canvas = this._canvas;
    const elementFactory = this._elementFactory;

    // Current process from which a ProcessOperator is being decomposed
    const process = canvas.getRootElement();
    let isDecomposed = false;
    const processOperator = context.element;
    const incomingFlows = processOperator.incoming;
    const outgoingFlows = processOperator.outgoing;
    let decomposedProcess;
    const stateShapes = [];
    let systemLimit;

    // If ProcessOperator has already been decomposed before
    if (processOperator.businessObject.decomposedView) {
        isDecomposed = true;
        decomposedProcess = processOperator.businessObject.decomposedView;
        systemLimit = getElementsFromElementsContainer(decomposedProcess.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
        if (!systemLimit) {
            context.aborted = true;
            return;
        }
        getElementsFromElementsContainer(systemLimit.businessObject.elementsContainer, 'fpb:State').forEach((state) => {
            if (checkIfOnSystemBorder(systemLimit, state) === 'onUpperBorder') {
                stateShapes.push({ state: state, position: 'incoming' });
            }
            if (checkIfOnSystemBorder(systemLimit, state) === 'onBottomBorder') {
                stateShapes.push({ state: state, position: 'outgoing' });
            }
        });
        // Check if new shapes are connected to the ProcessOperator
        incomingFlows.forEach((incoming) => {
            if (!is(incoming, 'fpb:Usage') && !checkIfStateIsNew(incoming.businessObject.sourceRef, decomposedProcess)) {
                let stateShape = createStateShapeForNewLayer(elementFactory, incoming.businessObject.sourceRef.$type, incoming.businessObject.sourceRef);
                collectionAdd(decomposedProcess.businessObject.consistsOfStates, stateShape.businessObject);
                collectionAdd(systemLimit.businessObject.elementsContainer, stateShape);
                stateShapes.push({ state: stateShape, position: 'incoming' });
            }
        });
        outgoingFlows.forEach((outgoing) => {
            if (!is(outgoing, 'fpb:Usage') && !checkIfStateIsNew(outgoing.businessObject.targetRef, decomposedProcess)) {
                let stateShape = createStateShapeForNewLayer(elementFactory, outgoing.businessObject.targetRef.$type, outgoing.businessObject.targetRef);
                collectionAdd(decomposedProcess.businessObject.consistsOfStates, stateShape.businessObject);
                collectionAdd(systemLimit.businessObject.elementsContainer, stateShape);
                stateShapes.push({ state: stateShape, position: 'outgoing' });
            }
        });
    }

    // If ProcessOperator is being decomposed for the first time:
    else {
        // Create new process
        decomposedProcess = this._elementFactory.create('root', {
            type: 'fpb:Process',
            id: processOperator.businessObject.identification.uniqueIdent,
            ProjectAssignment: process.businessObject.ProjectAssignment
        });

        decomposedProcess.businessObject.isDecomposedProcessOperator = processOperator.businessObject;
        decomposedProcess.businessObject.parent = process;

        // Add as part of the parent process and as information on the decomposed ProcessOperator;
        collectionAdd(process.businessObject.consistsOfProcesses, decomposedProcess);
        processOperator.businessObject.decomposedView = decomposedProcess;
        // Create shape for new SystemLimit
        systemLimit = elementFactory.create('shape', { type: 'fpb:SystemLimit' })
        collectionAdd(decomposedProcess.businessObject.elementsContainer, systemLimit)
        decomposedProcess.businessObject.consistsOfSystemLimit = systemLimit;
        // Default positioning
        systemLimit.x = 350;
        systemLimit.y = 50;
        // Create states for decomposed process:
        incomingFlows.forEach((incoming) => {
            if (is(incoming.businessObject.sourceRef, 'fpb:State')) {
                let stateShape = createStateShapeForNewLayer(elementFactory, incoming.businessObject.sourceRef.$type, incoming.businessObject.sourceRef);
                collectionAdd(decomposedProcess.businessObject.consistsOfStates, stateShape.businessObject);
                collectionAdd(systemLimit.businessObject.elementsContainer, stateShape);
                stateShapes.push({ state: stateShape, position: 'incoming' });
            }
        });
        outgoingFlows.forEach((outgoing) => {
            if (is(outgoing.businessObject.targetRef, 'fpb:State')) {
                let stateShape = createStateShapeForNewLayer(elementFactory, outgoing.businessObject.targetRef.$type, outgoing.businessObject.targetRef);
                collectionAdd(decomposedProcess.businessObject.consistsOfStates, stateShape.businessObject);
                collectionAdd(systemLimit.businessObject.elementsContainer, stateShape);
                stateShapes.push({ state: stateShape, position: 'outgoing' });
            }
        });
        // Fire event for LayerPanel
        this._eventBus.fire('dataStore.newProcess', {
            newProcess: decomposedProcess
        });
        this._eventBus.fire('layerPanel.newProcess', {
            newProcess: decomposedProcess,
            parentProcess: process
        })
    };
    // Short name of the ProcessOperator being decomposed as name on the SystemLimit
    systemLimit.businessObject.name = "SL_" + processOperator.businessObject.name;
    // Calculate positioning of shapes
    const sizesAndPositions = calculateSizeAndPositions(systemLimit, incomingFlows, outgoingFlows);
    systemLimit.width = sizesAndPositions.SystemLimitWidth;
    stateShapes.forEach(function (state) {
        if (state.position === 'incoming') {
            if (state.state.outgoing.length > 0) {
                state.state.outgoing.forEach(function (connection) {
                    // Adjust flows
                    connection.waypoints[0].x = sizesAndPositions.incomings.start_x + 25;
                    const diWaypoints = connection.businessObject.di?.waypoint;
                    if (diWaypoints?.[0]) {
                        diWaypoints[0].x = sizesAndPositions.incomings.start_x + 25;
                    }
                    // For flows with a bend
                    if (connection.waypoints.length === 4) {
                        connection.waypoints[1].x = sizesAndPositions.incomings.start_x + 25;
                        if (diWaypoints?.[1]) {
                            diWaypoints[1].x = sizesAndPositions.incomings.start_x + 25;
                        }
                    }
                })
            }
            state.state.x = sizesAndPositions.incomings.start_x;
            state.state.y = sizesAndPositions.incomings.y;
            sizesAndPositions.incomings.start_x += sizesAndPositions.incomings.delta_x;
        }
        if (state.position === 'outgoing') {
            if (state.state.incoming.length > 0) {
                state.state.incoming.forEach(function (connection) {
                    // Adjust flows
                    connection.waypoints[0].x = sizesAndPositions.outgoings.start_x + 25;
                    const diWaypoints = connection.businessObject.di?.waypoint;
                    if (diWaypoints?.[0]) {
                        diWaypoints[0].x = sizesAndPositions.outgoings.start_x + 25;
                    }

                    // Flows with a bend
                    if (connection.waypoints.length === 4) {
                        connection.waypoints[1].x = sizesAndPositions.outgoings.start_x + 25;
                        if (diWaypoints?.[1]) {
                            diWaypoints[1].x = sizesAndPositions.outgoings.start_x + 25;
                        }
                    }
                })
            }
            state.state.x = sizesAndPositions.outgoings.start_x;
            state.state.y = sizesAndPositions.outgoings.y;
            sizesAndPositions.outgoings.start_x += sizesAndPositions.outgoings.delta_x;
        }
    });

    // Retrieve remaining shapes and connections, if ProcessOperator has already been decomposed before
    let processFlows = [];
    let systemLimitFlows = [];
    let processShapes = [];
    if (isDecomposed) {
        decomposedProcess.businessObject.elementsContainer.forEach(element => {
            if (is(element, 'fpb:Flow')) {
                processFlows.push(element);
            }
            else if (is(element, 'fpb:SystemLimit')) {
                let system_Limit = element;
                if (system_Limit.businessObject.elementsContainer) {
                    system_Limit.businessObject.elementsContainer.forEach(element => {
                        if (is(element, 'fpb:Flow')) {
                            systemLimitFlows.push(element);
                        } else {
                            if (!(some(stateShapes, function (c) {
                                return c.state.id === element.id;
                            }))) {
                                stateShapes.push({ state: element, position: '' });
                            }
                        }
                    })
                }
            }
            else {
                processShapes.push(element);
            }
        });
    }


    context.stateShapes = stateShapes;
    context.decomposedProcess = decomposedProcess;
    context.systemLimit = systemLimit;
    context.processShapes = processShapes;
    context.processFlows = processFlows;
    context.systemLimitFlows = systemLimitFlows;
}

DecomposeProcessOperator.prototype.execute = function (context) {
    if (context.aborted) return;

    const canvas = this._canvas;

    const decomposedProcess = context.decomposedProcess;
    const stateShapes = context.stateShapes;
    const systemLimit = context.systemLimit;
    const processShapes = context.processShapes;
    const processFlows = context.processFlows;
    const systemLimitFlows = context.systemLimitFlows;
    // Clear the canvas and place the shapes
    canvas._clear();
    canvas.setRootElement(decomposedProcess, true);
    // Reset in case the view was zoomed and scrolled
    /*var zoomedAndScrolledViewbox = canvas.viewbox();
    canvas.viewbox({
        x: 0,
        y: 0,
        width: zoomedAndScrolledViewbox.outer.width,
        height: zoomedAndScrolledViewbox.outer.height
    });*/
    // This should be fail-safe
    canvas.addShape(systemLimit, decomposedProcess);
    systemLimit.parent = decomposedProcess
    processShapes.forEach(element => {
        canvas.addShape(element, decomposedProcess)
    });
    stateShapes.forEach(element => {
        canvas.addShape(element.state, systemLimit)

    });
    processFlows.forEach(element => {
        canvas.addConnection(element, decomposedProcess)
    });
    systemLimitFlows.forEach(element => {
        canvas.addConnection(element, systemLimit)
    });

};

// Update / add labels
DecomposeProcessOperator.prototype.postExecute = function (context) {
    if (context.aborted) return;

    const modeling = this._modeling;
    const stateShapes = context.stateShapes;
    stateShapes.forEach((state) => {
        if (state.state.businessObject.name) {
            if (state.state.labels[0]) {
                collectionRemove(state.state.labels, state.state.labels[0]);
                delete state.state.businessObject.di.label;
            }
            modeling.updateLabel(state.state, state.state.businessObject.name);
        }
        // Re-layout connections attached to this state (newly created/repositioned)
        (state.state.incoming || []).forEach(function (connection) {
            modeling.layoutConnection(connection);
        });
        (state.state.outgoing || []).forEach(function (connection) {
            modeling.layoutConnection(connection);
        });
    });
    this._eventBus.fire('layerPanel.processSwitched', {
        selectedProcess: context.decomposedProcess
    });

}

// Check if ProcessOperator was connected to a new state on the parent process / returns false if new
function checkIfStateIsNew(state, decomposedProcess) {
    return some(decomposedProcess.businessObject.consistsOfStates, function (c) {
        return c.id === state.id;
    })
};
// Calculates new SystemLimit width if necessary and the positions for states.
function calculateSizeAndPositions(systemLimit, incoming, outgoing) {
    let noOfIncomingStates = incoming.length - noOfUsageConnections(incoming);
    let noOfOutgoingStates = outgoing.length - noOfUsageConnections(outgoing);
    let systemLimitWidth = systemLimit.width;
    // Calculate new systemLimit.width if ProcessOperator has more than 12 input or output shapes (default width is no longer sufficient)
    if ((noOfIncomingStates || noOfOutgoingStates) >= 12) {
        // -10 so that deltas don't become too small // 50 is the default width of a StateShape
        systemLimitWidth = systemLimitWidth + (Math.max(noOfOutgoingStates, noOfIncomingStates) - 10) * 50;
    };
    // +1 to account for spacing from the corners.
    let delta_incoming_x = systemLimitWidth / (noOfIncomingStates + 1);
    let delta_outgoing_x = systemLimitWidth / (noOfOutgoingStates + 1);
    return {
        SystemLimitWidth: systemLimitWidth,
        incomings: {
            start_x: (systemLimit.x - 25) + delta_incoming_x,
            delta_x: delta_incoming_x,
            y: systemLimit.y - 25
        },
        outgoings: {
            start_x: (systemLimit.x - 25) + delta_outgoing_x,
            delta_x: delta_outgoing_x,
            y: systemLimit.y - 25 + systemLimit.height
        }
    }
};

