import { is } from '../../help/utils';
import {
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';


export default function SwitchProcess(canvas, modeling, elementFactory, eventBus) {
    this._canvas = canvas;
    this._modeling = modeling;
    this._elementFactory = elementFactory;
    this._eventBus = eventBus;
}

SwitchProcess.$inject = [
    'canvas',
    'modeling',
    'elementFactory',
    'eventBus'];

SwitchProcess.prototype.preExecute = function (context) {

    let process = context.process;
    let processFlows = [];
    let systemLimitFlows = [];
    let processShapes = [];
    let stateShapes = [];
    let systemlimit;
    process.businessObject.elementsContainer.forEach(element => {
        if (is(element, 'fpb:Flow')) {
            processFlows.push(element);
        }
        else if (is(element, 'fpb:SystemLimit')) {
            systemlimit = element;
            if (systemlimit.businessObject.elementsContainer) {
                systemlimit.businessObject.elementsContainer.forEach(element => {
                    if (is(element, 'fpb:Flow')) {
                        systemLimitFlows.push(element);
                    } else {
                        stateShapes.push({ state: element, position: '' });
                    }
                })
            }
        }
        else {
            processShapes.push(element);
        }
    });
    context.stateShapes = stateShapes;
    context.systemLimit = systemlimit;
    context.processShapes = processShapes;
    context.processFlows = processFlows;
    context.systemLimitFlows = systemLimitFlows;
};

SwitchProcess.prototype.execute = function (context) {
    let process = context.process;
    let processFlows = context.processFlows;
    let systemLimitFlows = context.systemLimitFlows;
    let processShapes = context.processShapes;
    let stateShapes = context.stateShapes;
    let systemLimit = context.systemLimit;
    let canvas = this._canvas;
    // Clearen der Canvas und platzieren der Shapes
    canvas._clear();
    canvas.setRootElement(process, true);
    // Resetten falls gezoomed und gescrolled wurde
    var zoomedAndScrolledViewbox = canvas.viewbox();
    canvas.viewbox({
        x: 0,
        y: 0,
        width: zoomedAndScrolledViewbox.outer.width,
        height: zoomedAndScrolledViewbox.outer.height
    });
    // Das sollte failsafe sein
    canvas.addShape(systemLimit, process);
    processShapes.forEach(element => {
        canvas.addShape(element, process)
    });
    stateShapes.forEach(element => {
        canvas.addShape(element.state, systemLimit)
    });
    processFlows.forEach(element => {
        canvas.addConnection(element, process)
    });
    systemLimitFlows.forEach(element => {
        canvas.addConnection(element, systemLimit)
    });
}

SwitchProcess.prototype.postExecute = function (context) {
    let eventBus = this._eventBus;
    let process = context.process;
    let systemLimit = context.systemLimit;
    let processShapes = context.processShapes;


    var modeling = this._modeling;
    var stateShapes = context.stateShapes;

    modeling.moveShape(systemLimit, {x:3, y:0})
    modeling.moveShape(systemLimit, {x:-3, y:0})
    processShapes.forEach((tr) =>{
        modeling.moveShape(tr, {x:3, y:0})
        modeling.moveShape(tr, {x:-3, y:0})
    })

    stateShapes.forEach((state) => {
        if (state.state.businessObject.name) {
            if(state.state.labels[0]){
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


    eventBus.fire('layerPanel.processSwitched', {
        selectedProcess: process
    })
    eventBus.fire('toolTips.processSwitched', {
        selectedProcess: process
    })
}