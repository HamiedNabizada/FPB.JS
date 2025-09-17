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

// Vorbereitung auf Layerwechsel
DecomposeProcessOperator.prototype.preExecute = function (context) {
    var canvas = this._canvas;
    var elementFactory = this._elementFactory;

    // Aktueller Prozess, aus dem ein ProcessOperator dekomponiert wird
    var process = canvas.getRootElement();
    var isDecomposed = false;
    var processOperator = context.element;
    var incomingFlows = processOperator.incoming;
    var outgoingFlows = processOperator.outgoing;
    var decomposedProcess;
    var stateShapes = [];
    var systemLimit;

    // Falls ProcessOperator bereits dekomponiert gewesen ist
    if (processOperator.businessObject.decomposedView) {
        isDecomposed = true;
        decomposedProcess = processOperator.businessObject.decomposedView;
        systemLimit = getElementsFromElementsContainer(decomposedProcess.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
        getElementsFromElementsContainer(systemLimit.businessObject.elementsContainer, 'fpb:State').forEach((state) => {
            if (checkIfOnSystemBorder(systemLimit, state) == 'onUpperBorder') {
                stateShapes.push({ state: state, position: 'incoming' });
            }
            if (checkIfOnSystemBorder(systemLimit, state) == 'onBottomBorder') {
                stateShapes.push({ state: state, position: 'outgoing' });
            }
        });
        // Prüfen ob neue Shapes mit dem ProcessOperator verbunden sind
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

    // Falls ProcessOperator erstmalig dekomponiert wird:
    else {
        // Neuen Prozess erstellen
        decomposedProcess = this._elementFactory.create('root', {
            type: 'fpb:Process',
            id: processOperator.businessObject.identification.uniqueIdent,
            ProjectAssignment: process.businessObject.ProjectAssignment
        });

        decomposedProcess.businessObject.isDecomposedProcessOperator = processOperator.businessObject;
        decomposedProcess.businessObject.parent = process;

        // Hinzufügen als Bestandteil des übergeordneten Prozesses und als Information bei dem dekomponierten ProcessOperator;
        collectionAdd(process.businessObject.consistsOfProcesses, decomposedProcess);
        processOperator.businessObject.decomposedView = decomposedProcess;
        // Shape für neue SystemGrenze erstellen
        systemLimit = elementFactory.create('shape', { type: 'fpb:SystemLimit' })
        collectionAdd(decomposedProcess.businessObject.elementsContainer, systemLimit)
        decomposedProcess.businessObject.consistsOfSystemLimit = systemLimit;
        // DefaultPositionierung
        systemLimit.x = 350;
        systemLimit.y = 50;
        // States für decomposed Process erstellen:
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
        // Event abfeuern für LayerPanel
        this._eventBus.fire('dataStore.newProcess', {
            newProcess: decomposedProcess
        });
        this._eventBus.fire('layerPanel.newProcess', {
            newProcess: decomposedProcess,
            parentProcess: process
        })
    };
    // Shortname des zu dekomponierenden ProcessOperators als Namen auf die SystemGrenze
    systemLimit.businessObject.name = "SL_" + processOperator.businessObject.name;
    // Positionierung der Shapes berechnen
    var sizesAndPositions = calculateSizeAndPositions(systemLimit, incomingFlows, outgoingFlows);
    systemLimit.width = sizesAndPositions.SystemLimitWidth;
    stateShapes.forEach(function (state) {
        if (state.position === 'incoming') {
            if (state.state.outgoing.length > 0) {
                state.state.outgoing.forEach(function (connection) {
                    // Flows anpassen
                    connection.waypoints[0].x = sizesAndPositions.incomings.start_x + 25;
                    try {
                        connection.businessObject.di.waypoint[0].x = sizesAndPositions.incomings.start_x + 25;
                    } catch (error) {
                    }
                    // Für Flows mit Knick
                    if (connection.waypoints.length === 4) {
                        connection.waypoints[1].x = sizesAndPositions.incomings.start_x + 25;
                        try {
                            connection.businessObject.di.waypoint[1].x = sizesAndPositions.incomings.start_x + 25;
                        } catch (error) {
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
                    // Flows anpassen
                    connection.waypoints[0].x = sizesAndPositions.outgoings.start_x + 25;
                    try {
                        connection.businessObject.di.waypoint[0].x = sizesAndPositions.outgoings.start_x + 25;
                    } catch (error) {

                    }

                    // Flows mit Knick
                    if (connection.waypoints.length === 4) {
                        connection.waypoints[1].x = sizesAndPositions.outgoings.start_x + 25;
                        try {
                            connection.businessObject.di.waypoint[1].x = sizesAndPositions.outgoings.start_x + 25;
                        } catch (error) {

                        }

                    }
                })
            }
            state.state.x = sizesAndPositions.outgoings.start_x;
            state.state.y = sizesAndPositions.outgoings.y;
            sizesAndPositions.outgoings.start_x += sizesAndPositions.outgoings.delta_x;
        }
    });

    // Restliche Shapes und Connections abholen, falls ProcessOperator schon dekomponiert gewesen ist
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
    var canvas = this._canvas;

    var decomposedProcess = context.decomposedProcess;
    var stateShapes = context.stateShapes;
    var systemLimit = context.systemLimit;
    var processShapes = context.processShapes;
    var processFlows = context.processFlows;
    var systemLimitFlows = context.systemLimitFlows;
    // Clearen der Canvas und platzieren der Shapes
    canvas._clear();
    canvas.setRootElement(decomposedProcess, true);
    // Resetten falls gezoomed und gescrolled wurde
    /*var zoomedAndScrolledViewbox = canvas.viewbox();
    canvas.viewbox({
        x: 0,
        y: 0,
        width: zoomedAndScrolledViewbox.outer.width,
        height: zoomedAndScrolledViewbox.outer.height
    });*/
    // Das sollte failsafe sein
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

// Labels updaten / hinzufügen
DecomposeProcessOperator.prototype.postExecute = function (context) {
    var modeling = this._modeling;
    var stateShapes = context.stateShapes;
    var processFlows = context.processFlows;
    var systemLimitFlows = context.systemLimitFlows;
    stateShapes.forEach((state) => {
        if (state.state.businessObject.name) {
            if (state.state.labels[0]) {
                collectionRemove(state.state.labels, state.state.labels[0]);
                delete state.state.businessObject.di.label;
            }
            modeling.updateLabel(state.state, state.state.businessObject.name);
        }
        // Wenn auf über-/untergeordneten Layern Shapes hin und herbewegt worden sind, kommt es zu Anzeigefehlern der Connections
        // Dies lässt sich beheben, wenn das entsprechende Shape etwas bewegt wird, ist aber keine endgültige Lösung
        // TODO: Function schreiben, die herausfindet, ob Connection richtig platziert worden ist
        // Notlösung ist zunächst Shapes hin und her zu bewegen
        modeling.moveShape(state.state, { x: 3, y: 0 })
        modeling.moveShape(state.state, { x: -3, y: 0 })

    })
    processFlows.forEach((flow) => {
        modeling.layoutConnection(flow)
    })
    systemLimitFlows.forEach((flow) => {
        modeling.layoutConnection(flow)
    })
    this._eventBus.fire('layerPanel.processSwitched', {
        selectedProcess: context.decomposedProcess
    })

}

// Prüfen ob ProcessOperator auf übergeordneten Prozess mit einem neuen State verbunden wurde / returned false, wenn neu
function checkIfStateIsNew(state, decomposedProcess) {
    return some(decomposedProcess.businessObject.consistsOfStates, function (c) {
        return c.id === state.id;
    })
};
// Berechnet wenn notwendig neue Breite der System Grenze und die Positions für States.
function calculateSizeAndPositions(systemLimit, incoming, outgoing) {
    let noOfIncomingStates = incoming.length - noOfUsageConnections(incoming);
    let noOfOutgoingStates = outgoing.length - noOfUsageConnections(outgoing);
    let systemLimitWidth = systemLimit.width;
    // Neue systemLimit.width berechnen, falls ProcessOperator mehr als 12 Shapes In- oder Output hat (Default Width reicht dann nicht mehr aus)
    if ((noOfIncomingStates || noOfOutgoingStates) >= 12) {
        // -10, damit deltas nicht zu klein werden // 50 ist Default Width von einem StateShape
        systemLimitWidth = systemLimitWidth + (Math.max(noOfOutgoingStates, noOfIncomingStates) - 10) * 50;
    };
    // +1 damit Abstand von den Ecken mit berücksichtigt wird.
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

