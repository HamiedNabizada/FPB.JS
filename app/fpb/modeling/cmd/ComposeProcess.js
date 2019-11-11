import { forEach, some } from "min-dash";

import { is, isAny } from '../../help/utils';
import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

import { checkIfOnSystemBorder, getElementById, getElementsFromElementsContainer, createStateShapeForNewLayer } from '../../help/helpUtils'

export default function ComposeProcess(canvas, modeling, elementFactory, eventBus, elementRegistry) {
    this._canvas = canvas;
    this._modeling = modeling;
    this._elementFactory = elementFactory;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
}

ComposeProcess.$inject = [
    'canvas',
    'modeling',
    'elementFactory',
    'eventBus',
    'elementRegistry'
];
// Preprocessing
ComposeProcess.prototype.preExecute = function (context) {
    var canvas = this._canvas;
    var systemLimitOld = context.element;
    var processOld = canvas.getRootElement();
    var processOperatorNew;
    var processNew;
    var systemLimitNew;
    var technicalResources;
    var systemLimitFlows;
    var processFlows;
    var stateShapes = [];

    if (processOld.businessObject.isDecomposedProcessOperator) {
        // Prozess hat schon ein übergeordneten Prozess
        // TODO: Schwieriger Fall: 
        /*Es müsste geprüft werden welche StateShapes neu auf der SystemGrenze liegen und dieses dann im übergeordneten Prozess 
         an den ProcessOperator hängen. Berechnung dafür wird abartig kompliziert, da freie Plätze ermittelt werden müssen, Systemgrenze angepasst ,
         und aufgespasst werden muss, dass die Shapes nicht auf irgendwelchen Flows platziert werden. 
         BottomUp Approach ist somit etwas schwieriger zu gestalten. 
         Vorrübergehende Lösung für Version1: Semi BottomUp Approach, nur ein Prozess lässt sich auf detailiertesten Level komponieren, danach muss immer vom
         übergeordneten Prozess zunächst dekomponiert werden 
        */
        processNew = processOld.businessObject.parent;
        systemLimitNew = getElementsFromElementsContainer(processNew.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
        technicalResources = getElementsFromElementsContainer(processNew.businessObject.elementsContainer, 'fpb:TechnicalResource');
        // Hier sind auch die ProcessOperators mit drin
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
        //Prozess hat keinen übergeordneten Prozess

        // StateShapes die auf der SystemBorder liegen abholen
        systemLimitOld.businessObject.elementsContainer.forEach((state) => {
            if (is(state, 'fpb:State')) {
                if (checkIfOnSystemBorder(systemLimitOld, state) == 'onUpperBorder') {
                    stateShapes.push({ state: createStateShapeForNewLayer(this._elementFactory, state.type, state.businessObject), position: 'incoming' });
                };
                if (checkIfOnSystemBorder(systemLimitOld, state) == 'onBottomBorder') {
                    stateShapes.push({ state: createStateShapeForNewLayer(this._elementFactory, state.type, state.businessObject), position: 'outgoing' });
                };
            }
        })
        // Neuen Prozess erstellen
        processNew = this._elementFactory.create('root', {
            type: 'fpb:Process'
        });
        processNew.businessObject.ProjectAssignment = processOld.businessObject.ProjectAssignment;
        processOld.businessObject.ProjectAssignment.entryPoint = processNew;
        processOld.businessObject.parent = processNew;
        processOperatorNew = this._elementFactory.create('shape', {
            type: 'fpb:ProcessOperator',
            id: processOld.id
        })
        processNew.businessObject.parent = processNew.businessObject.ProjectAssignment;
        processOperatorNew.businessObject.decomposedView = processOld;

        // Namen der SystemGrenze als Bezeichnung für den neuen ProcessOperator
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

        // DefaultPositionierung
        systemLimitNew.x = 350;
        systemLimitNew.y = 50;

        computePositions(systemLimitNew, stateShapes, processOperatorNew, 75)

        // Event abfeuern für LayerPanel
        this._eventBus.fire('layerPanel.newProcess', {
            newProcess: processNew,
            parentProcess: processOld
        })
        context.command = true;
        context.processNew = processNew;
        context.systemLimitNew = systemLimitNew;
        context.stateShapes = stateShapes;
        context.processOperatorNew = processOperatorNew;

    }
}

ComposeProcess.prototype.execute = function (context) {
    var canvas = this._canvas;
    var systemLimitNew = context.systemLimitNew;
    var stateShapes = context.stateShapes;
    var processNew = context.processNew;

    if (context.command) {
        var processOperatorNew = context.processOperatorNew;

        canvas._clear();
        canvas.setRootElement(processNew, true);
        // Resetten falls gezoomed und gescrolled wurde
        var zoomedAndScrolledViewbox = canvas.viewbox();
        canvas.viewbox({
            x: 0,
            y: 0,
            width: zoomedAndScrolledViewbox.outer.width,
            height: zoomedAndScrolledViewbox.outer.height
        });


        // Das sollte failsafe sein
        canvas.addShape(systemLimitNew, processNew);
        canvas.addShape(processOperatorNew, systemLimitNew);
        stateShapes.forEach((state) => {
            canvas.addShape(state.state, systemLimitNew)
        });
    } else {
        var processFlows = context.processFlows;
        var technicalResources = context.technicalResources;
        var systemLimitFlows = context.systemLimitFlows;
        // Clearen der Canvas und platzieren der Shapes
        canvas._clear();
        canvas.setRootElement(processNew, true);
        // Resetten falls gezoomed und gescrolled wurde
        var zoomedAndScrolledViewbox = canvas.viewbox();
        canvas.viewbox({
            x: 0,
            y: 0,
            width: zoomedAndScrolledViewbox.outer.width,
            height: zoomedAndScrolledViewbox.outer.height
        });
        // Das sollte failsafe sein
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
    var modeling = this._modeling;
    // Elemente mit einander verbinden
    var stateShapes = context.stateShapes;
    var processOperatorNew = context.processOperatorNew;
    var systemLimitFlows = context.systemLimitFlows;
    var processFlows = context.processFlows;

    if (context.command) {
        stateShapes.forEach((state) => {
            if (state.position == 'incoming') {
                modeling.connect(state.state, processOperatorNew, {
                    type: 'fpb:Flow',
                });
            }
            if (state.position == 'outgoing') {
                modeling.connect(processOperatorNew, state.state, {
                    type: 'fpb:Flow',
                });
            }
            if (state.state.businessObject.name) {
                if (state.state.labels[0]) {
                    collectionRemove(state.state.labels, state.state.labels[0]);
                    delete state.state.businessObject.di.label;
                }
                modeling.updateLabel(state.state, state.state.businessObject.name)
            }

        })
        if (processOperatorNew.businessObject.name) {
            modeling.updateLabel(processOperatorNew, processOperatorNew.businessObject.name)
        }
    } else {
        stateShapes.forEach((state) => {
            if (state.businessObject.name) {
                if (state.labels[0]) {
                    collectionRemove(state.labels, state.labels[0]);
                    delete state.businessObject.di.label;
                }
                modeling.updateLabel(state, state.businessObject.name)
            }
            processFlows.forEach((flow) => {
                modeling.layoutConnection(flow)
            })
            systemLimitFlows.forEach((flow) => {
                modeling.layoutConnection(flow)
            })

            //TODO: Notlösung, siehe Problematik in DecomposeProcessOperator
            modeling.moveShape(state, { x: -3, y: 0 })
            modeling.moveShape(state, { x: 3, y: 0 })
        })
    }

    this._eventBus.fire('layerPanel.processSwitched', {
        selectedProcess: context.processNew
    })




};

function computePositions(systemLimit, stateShapes, processOperator, deltaX) {

    let noOfIncoming = stateShapes.reduce((a, c) => c.position === 'incoming' ? ++a : a, 0);
    let noOfOutgoing = stateShapes.reduce((a, c) => c.position === 'outgoing' ? ++a : a, 0);
    let di1 = 0;
    let di2 = 0;
    // Versetzen des Startpunkts falls nicht gleiche Anzahl
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