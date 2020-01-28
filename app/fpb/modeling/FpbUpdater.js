import inherits from 'inherits';

import { getElementsFromElementsContainer, getElementById } from '../help/helpUtils';

import {
  pick,
  assign,
  forEach
} from 'min-dash';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import {
  add as collectionAdd,
  remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

import {
  Label
} from 'diagram-js/lib/model';

import {
  getBusinessObject,
  is,
  isAny
} from '../help/utils';


export default function FpbUpdater(
  eventBus, fpbFactory, connectionDocking,
  translate, canvas, modeling, elementFactory, config) {

  CommandInterceptor.call(this, eventBus);

  this._fpbFactory = fpbFactory;
  this._translate = translate;
  this._canvas = canvas;
  this._modeling = modeling;
  this._elementFactory = elementFactory;
  this._config = config;
  this._eventBus = eventBus;

  var self = this;

  // connection cropping //////////////////////

  // crop connection ends during create/update
  function cropConnection(e) {

    // TODO: Führt zu Anzeigefehler bei Usage. Nochmal prüfen was hier vor sich geht 
    var context = e.context,
      connection;


    if (!context.cropped) {
      connection = context.connection;
      if (is(connection, 'fpb:Usage')) {
        return;
      }
      connection.waypoints = connectionDocking.getCroppedWaypoints(connection);
      context.cropped = true;
    }
  }

  this.executed([
    'connection.layout',
    'connection.create'
  ], cropConnection);

  this.reverted(['connection.layout'], function (e) {
    delete e.context.cropped;
  });

  // update ProcessInformation sobald shape oder connection gemoved, created oder deleted wird
  function updateProcessInformation(e) {
    var context = e.context;
    var command = e.command;

    //self.updateProcessInformation(context.shape || context.connection, context.oldParent);
    self.updateProcessInformation(command, context, context.oldParent);
  };
  function reverseUpdateProcessInformation(e) {
    var context = e.context;
    var element = context.shape || context.connection,
      // oldParent is the (old) new parent, because we are undoing
      oldParent = context.parent || context.newParent;
    self.updateProcessInformation(element, oldParent);
  };

  this.executed([
    'shape.move',
    'shape.create',
    'shape.delete',
    'connection.create',
    'connection.move',
    'connection.delete'
  ], ifFpb(updateProcessInformation));

  this.reverted([
    'shape.move',
    'shape.create',
    'shape.delete',
    'connection.create',
    'connection.move',
    'connection.delete'
  ], ifFpb(reverseUpdateProcessInformation));

  // update bounds
  function updateBounds(e) {
    var shape = e.context.shape;

    if (!is(shape, 'fpb:BaseElement')) {
      return;
    }

    self.updateBounds(shape);
  }

  this.executed(['shape.move', 'shape.create', 'shape.resize'], ifFpb(function (event) {
    // exclude labels because they're handled separately during shape.changed
    if (event.context.shape.type === 'label') {
      return;
    }
    updateBounds(event);
  }));

  this.reverted(['shape.move', 'shape.create', 'shape.resize'], ifFpb(function (event) {

    // exclude labels because they're handled separately during shape.changed
    if (event.context.shape.type === 'label') {
      return;
    }

    updateBounds(event);
  }));

  // Handle labels separately. This is necessary, because the label bounds have to be updated
  // every time its shape changes, not only on move, create and resize.
  eventBus.on('shape.changed', function (event) {
    if (event.element.type === 'label') {
      updateBounds({ context: { shape: event.element } });
    }
  });

  // attach / detach connection
  function updateConnection(e) {

    self.updateConnection(e.context);
  }

  this.executed([
    'connection.create',
    'connection.move',
    'connection.delete',
    'connection.reconnectEnd',
    'connection.reconnectStart'
  ], ifFpb(updateConnection));

  this.reverted([
    'connection.create',
    'connection.move',
    'connection.delete',
    'connection.reconnectEnd',
    'connection.reconnectStart'
  ], ifFpb(updateConnection));


  // update waypoints
  function updateConnectionWaypoints(e) {

    self.updateConnectionWaypoints(e.context.connection);
  }

  this.executed([
    'connection.layout',
    'connection.move',
    'connection.updateWaypoints',
  ], ifFpb(updateConnectionWaypoints));

  this.reverted([
    'connection.layout',
    'connection.move',
    'connection.updateWaypoints',
  ], ifFpb(updateConnectionWaypoints));


  // update Default & Conditional flows
  this.executed([
    'connection.reconnectEnd',
    'connection.reconnectStart'
  ], ifFpb(function (e) {
    var context = e.context,
      connection = context.connection,
      businessObject = getBusinessObject(connection),
      oldSource = getBusinessObject(context.oldSource),
      oldTarget = getBusinessObject(context.oldTarget),
      newSource = getBusinessObject(connection.source),
      newTarget = getBusinessObject(connection.target);

    if (oldSource === newSource || oldTarget === newTarget) {
      return;
    }

    // on reconnectStart -> default flow
    if (oldSource && oldSource.default === businessObject) {
      context.default = oldSource.default;
      oldSource.default = undefined;
    };
    // on reconnectEnd -> default flow
    if ((businessObject.sourceRef && businessObject.sourceRef.default)) {
      context.default = businessObject.sourceRef.default;
      businessObject.sourceRef.default = undefined;
    };
  }));

  this.reverted([
    'connection.reconnectEnd',
    'connection.reconnectStart'
  ], ifFpb(function (e) {
    var context = e.context,
      connection = context.connection,
      businessObject = getBusinessObject(connection),
      newSource = getBusinessObject(connection.source);
    newSource.default = context.default;

  }));

  // update attachments
  function updateAttachment(e) {
    self.updateAttachment(e.context);
  }

  this.executed(['element.updateAttachment'], ifFpb(updateAttachment));
  this.reverted(['element.updateAttachment'], ifFpb(updateAttachment));
}

inherits(FpbUpdater, CommandInterceptor);

FpbUpdater.$inject = [
  'eventBus',
  'fpbFactory',
  'connectionDocking',
  'translate',
  'canvas',
  'modeling',
  'elementFactory',
  'config.configFile'
];


FpbUpdater.prototype.updateProcessInformation = function (command, context, oldParent) {
  var element = context.shape || context.connection;
  var parentShape = element.parent;
  var process_rootElement = this._canvas.getRootElement();
  if (element instanceof Label) {
    return;
  };

  // Ablauf wenn neues Shape platziert wurde
  if (command === 'shape.create') {
    // Prüfen ob aktuelles Rootelement ein Process ist, falls ja befinden wir uns in der initiatlen Modellierung und ein Process wird dafür angelegt.
    // TODO: Das vlt bei Appstart direkt machen lassen. Prüfen wie das geschickt gehen könnte

    // TODO: is Function funktioniert nicht bei decomposed View
    if (!is(process_rootElement, 'fpb:Process') && !(process_rootElement.type === 'fpb:Process')) {

      process_rootElement = this._elementFactory.create('root', { type: 'fpb:Process' });

      var projectDefintion = this._fpbFactory.create('fpb:Project', {
        name: this._config.ProjectDefintion.name,
        targetNamespace: this._config.ProjectDefintion.targetNamespace,
        entryPoint: process_rootElement
      });
      this._eventBus.fire('dataStore.addedProjectDefinition', {
        projectDefinition: projectDefintion
      })
      process_rootElement.businessObject.ProjectAssignment = projectDefintion;
      process_rootElement.businessObject.parent = projectDefintion;

      // Neuer Process als RootElement des Canvas setzen
      this._canvas.setRootElement(process_rootElement, true)
      element.parent = process_rootElement; // Da noch kein Process als Rootelement definiert gewesen ist, kann es sich hierbei nur um ein SystemLimit oder TechnicalResource handeln
      fpbjs.setProjectDefinition(projectDefintion);

      this._eventBus.fire('dataStore.newProcess', {
        newProcess: process_rootElement,
        parentProcess: null
      })
      // Event feuern für LayerPanel
      this._eventBus.fire('layerPanel.newProcess', {
        newProcess: process_rootElement,
        parentProcess: null
      })
    };

    // ProcessOperatoren und States werden in den elementsContainer des SystemLimits geschoben
    if (isAny(element, ['fpb:State', 'fpb:ProcessOperator'])) {
      var processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
      collectionAdd(processSystemLimit.businessObject.elementsContainer, element);
      if (is(element, 'fpb:State')) {
        collectionAdd(process_rootElement.businessObject.consistsOfStates, element.businessObject);
      } else {
        collectionAdd(process_rootElement.businessObject.consistsOfProcessOperator, element.businessObject);
      };
    };
    // SystemLimit und TEchnicalResource im elementsContainer vom Process
    if (isAny(element, ['fpb:TechnicalResource', 'fpb:SystemLimit'])) {

      collectionAdd(process_rootElement.businessObject.elementsContainer, element);
      if (is(element, 'fpb:SystemLimit')) {
        process_rootElement.businessObject.consistsOfSystemLimit = element.businessObject;
      }
    };
  }

  // ------------------- Shape.create

  // Ablauf wenn Shape gelöscht wird
  if (command === 'shape.delete') {
    // Gelöschtes Element ist ein State oder ProcessOperator
    if (isAny(element, ['fpb:State', 'fpb:ProcessOperator'])) {
      var processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
      collectionRemove(processSystemLimit.businessObject.elementsContainer, element);
      if (is(element, 'fpb:State')) {
        collectionRemove(process_rootElement.businessObject.consistsOfStates, element.businessObject);
      } else {
        collectionRemove(process_rootElement.businessObject.consistsOfProcessOperator, element.businessObject);
        // Falls ProcessOperator dekomponiert gewesen ist
        if (element.businessObject.decomposedView) {
          this._eventBus.fire('toolTips.decomposedProcessOperator', {
            command: 'deleted',
            processOperator: element
          })

          this._eventBus.fire('dataStore.processDeleted', {
            deletedProcess: element.businessObject.decomposedView
          })
          // Event feuern für layerPanel
          this._eventBus.fire('layerPanel.processDeleted', {
            deletedProcess: element.businessObject.decomposedView
          })
          collectionRemove(process_rootElement.businessObject.consistsOfProcesses, element.businessObject.decomposedView);

        }
      }
    };
    if (isAny(element, ['fpb:TechnicalResource', 'fpb:SystemLimit'])) {
      collectionRemove(process_rootElement.businessObject.elementsContainer, element);
      if (is(element, 'fpb:SystemLimit')) {
        // TODO: Harte Konsequenzen, sollte evtl noch dreifach bestätigt werden, bevor man SystemLimit löschen kann. 
        process_rootElement.businessObject.consistsOfSystemLimit = null;
        process_rootElement.businessObject.consistsOfStates = [];
        process_rootElement.businessObject.consistsOfProcesses = [];
        process_rootElement.businessObject.consistsOfProcessOperator = [];
      }
    }
  }

  // ------------------- Shape.delete

  // Ablauf wenn Shape gemoved wird
  if (command === 'shape.move') {
    if (isAny(element, ['fpb:State', 'fpb:ProcessOperator'])) {
      var processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
      var elementFromElementsContainer = getElementById(processSystemLimit.businessObject.elementsContainer, element.businessObject.id);
      // Sonst gibts Probleme wenn zwischen den Layern geswitched wird 
      collectionRemove(processSystemLimit.businessObject.elementsContainer, elementFromElementsContainer);
      collectionAdd(processSystemLimit.businessObject.elementsContainer, element)
    };
    if (isAny(element, ['fpb:SystemLimit', 'fpb:TechnicalResource'])) {
      var elementFromElementsContainer = getElementById(process_rootElement.businessObject.elementsContainer, element.businessObject.id);
      // Sonst gibts Probleme wenn zwischen den Layern geswitched wird 
      collectionRemove(process_rootElement.businessObject.elementsContainer, elementFromElementsContainer);
      collectionAdd(process_rootElement.businessObject.elementsContainer, element)
    }
  }
  // ------------------- Shape.move

  // Ablauf wenn Connection erstellt wurde
  if (command === 'connection.create') {

    // Connections zu States
    if (is(context.source, 'fpb:State') || is(context.target, 'fpb:State')) {
      var processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
      collectionAdd(processSystemLimit.businessObject.elementsContainer, element);
      let stateShape;
      let processOperatorShape;
      if (is(context.source, 'fpb:State')) {
        stateShape = context.source;
        processOperatorShape = context.target;

      }
      else {
        stateShape = context.target;
        processOperatorShape = context.source;
      };
      collectionAdd(stateShape.businessObject.isAssignedTo, processOperatorShape.businessObject);
      if (processOperatorShape.businessObject.decomposedView) {

        this._eventBus.fire('toolTips.decomposedProcessOperator', {
          command: 'newStateConnected',
          processOperator: processOperatorShape
        })
      };

      if (isAny(element, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
        let replaceFlow;
        context.source.outgoing.forEach(function (flow) {
          if (!isAny(flow, ['fpb:ParallelFlow', 'fpb:AlternativeFlow', 'fpb:Usage'])) {
            replaceFlow = getElementById(processSystemLimit.businessObject.elementsContainer, flow.id)
          }
        });
        // Falls noch ein normaler Flow existieren würde, wird zunächst im ReplaceConnectionBehavior dieser ausgetauscht
        if (!replaceFlow) {
          context.source.outgoing.forEach(function (flow) {

            if (flow !== element && isAny(flow, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
              if (!flow.businessObject.inTandemWith) {
                flow.businessObject.inTandemWith = [];
              }
              collectionAdd(flow.businessObject.inTandemWith, element.businessObject);
              collectionAdd(element.businessObject.inTandemWith, flow.businessObject);
            }
          });

        }
      }
    };
    // Connection zu Technical Resource
    if (is(context.source, 'fpb:TechnicalResource') || is(context.target, 'fpb:TechnicalResource')) {
      collectionAdd(process_rootElement.businessObject.elementsContainer, element);
      if (!Array.isArray(context.source.businessObject.isAssignedTo)) {
        context.source.businessObject.isAssignedTo = [context.source.businessObject.isAssignedTo];
      }
      collectionAdd(context.source.businessObject.isAssignedTo, context.target.businessObject)
      if (!Array.isArray(context.target.businessObject.isAssignedTo)) {
        context.target.businessObject.isAssignedTo = [context.target.businessObject.isAssignedTo];
      }
      collectionAdd(context.target.businessObject.isAssignedTo, context.source.businessObject)
    }
  };

  if (command === 'connection.delete') {
    // Connections zu States
    let connection = element;
    if (is(context.source, 'fpb:State') || is(context.target, 'fpb:State')) {
      // Löschen der Connections auf aktuellem Layer
      var processSystemLimit = getElementsFromElementsContainer(process_rootElement.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
      collectionRemove(processSystemLimit.businessObject.elementsContainer, connection);
      let stateShape;
      let processOperatorShape;
      if (is(context.source, 'fpb:State')) {
        stateShape = context.source;
        processOperatorShape = context.target;
        collectionRemove(processOperatorShape.businessObject.incoming, connection.businessObject);
        collectionRemove(stateShape.businessObject.outgoing, connection.businessObject);
      }
      else {
        stateShape = context.target;
        processOperatorShape = context.source;
        collectionRemove(processOperatorShape.businessObject.outgoing, connection.businessObject);
        collectionRemove(stateShape.businessObject.incoming, connection.businessObject);
      };
      collectionRemove(stateShape.businessObject.isAssignedTo, processOperatorShape.businessObject);

      // Deep Löschen in den Layern darunter:
      // TODO: Durch Replace der Alternative/Parallelflows muss die Logik angepasst werden!
      if (processOperatorShape.businessObject.decomposedView) {
        // Der verbundene ProcessOperator wurde bereits dekomponiert
        let decomposedProcesses = [processOperatorShape.businessObject.decomposedView];
        while (decomposedProcesses.length > 0) {
          let decomposedProcess = decomposedProcesses.shift();
          let decomposedProcessSystemLimit = getElementsFromElementsContainer(decomposedProcess.businessObject.elementsContainer, 'fpb:SystemLimit')[0];
          let stateInDecomposedProcess = getElementById(decomposedProcessSystemLimit.businessObject.elementsContainer, stateShape.id);


          stateInDecomposedProcess.outgoing.forEach(function (flow) {
            let flowElement = getElementById(decomposedProcessSystemLimit.businessObject.elementsContainer, flow.id);
            collectionRemove(decomposedProcessSystemLimit.businessObject.elementsContainer, flowElement);
            collectionRemove(flow.businessObject.targetRef.incoming, flow.businessObject);
            if (flow.businessObject.targetRef.decomposedView) {
              decomposedProcesses.push(flow.businessObject.targetRef.decomposedView)
            }
          });

          stateInDecomposedProcess.incoming.forEach(function (flow) {
            collectionRemove(decomposedProcessSystemLimit.businessObject.elementsContainer, flow);
            collectionRemove(flow.businessObject.sourceRef.outgoing, flow.businessObject);
            if (flow.businessObject.sourceRef.decomposedView) {
              decomposedProcesses.push(flow.businessObject.sourceRef.decomposedView)
            }
          });
          collectionRemove(decomposedProcessSystemLimit.businessObject.elementsContainer, stateInDecomposedProcess);
          collectionRemove(decomposedProcess.businessObject.consistsOfStates, stateInDecomposedProcess.businessObject);
        }

      };
      if (isAny(element, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
        // TODO: Prüfen ob das sinnvoll ist, wenn 
        context.source.outgoing.forEach(function (flow) {
          if (flow !== element) {
            if (isAny(flow, ['fpb:ParallelFlow', 'fpb:AlternativeFlow'])) {
              collectionRemove(flow.businessObject.inTandemWith, element);
              collectionRemove(element.businessObject.inTandemWith, flow);
            }
          }
        });

      }
    }
    if (is(context.source, 'fpb:TechnicalResource') || is(context.target, 'fpb:TechnicalResource')) {
      collectionRemove(context.source.businessObject.isAssignedTo, context.target.businessObject);
      collectionRemove(context.target.businessObject.isAssignedTo, context.source.businessObject);
      collectionRemove(process_rootElement.businessObject.elementsContainer, connection);
      try {
        collectionRemove(context.source.businessObject.outgoing, connection.businessObject);
        collectionRemove(context.target.businessObject.incoming, connection.businessObject);    
      } catch (error) {
        
      }


    }
  }


  //TODO: DAS IST NOCH AUS BPMN 2.0!
  var parentShape = element.parent;
  var businessObject = element.businessObject,
    parentBusinessObject = parentShape && parentShape.businessObject,
    parentDi = parentBusinessObject && parentBusinessObject.di;
  this.updateDiParent(businessObject.di, parentDi)
};


FpbUpdater.prototype.updateAttachment = function (context) {

  var shape = context.shape,
    businessObject = shape.businessObject,
    host = shape.host;

  businessObject.attachedToRef = host && host.businessObject;
};


FpbUpdater.prototype.updateBounds = function (shape) {
  var di = shape.businessObject.di;

  var target = (shape instanceof Label) ? this._getLabel(di) : di;


  var bounds = target.bounds;

  if (!bounds) {
    bounds = this._fpbFactory.createDiBounds();
    target.set('bounds', bounds);
  }

  assign(bounds, {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height
  });
};


// update existing sourceElement and targetElement di information
FpbUpdater.prototype.updateDiConnection = function (di, newSource, newTarget) {
  // Falls sourceElement nicht angelegt ist, anlegen
  if (di.sourceElement === undefined) {
    di.sourceElement = newSource && newSource.di;
  };
  // Falls vorhanden und Source sich geändert hat
  if (di.sourceElement && di.sourceElement.fpbjsElement !== newSource) {
    di.sourceElement = newSource && newSource.di;
  };
  if (di.targetElement === undefined) {
    di.targetElement = newTarget && newTarget.di;
  };
  if (di.targetElement && di.targetElement.fpbjsElement !== newTarget) {
    di.targetElement = newTarget && newTarget.di;
  }
};

FpbUpdater.prototype.updateDiParent = function (di, parentDi) {

  if (parentDi && !is(parentDi, 'fpbjsdi:FPBJSPlane')) {
    parentDi = parentDi.$parent;
  }
  if (di.$parent === parentDi) {
    return;
  }
  try {
    var planeElements = (parentDi || di.$parent).get('planeElement');

    if (parentDi) {
      planeElements.push(di);
      di.$parent = parentDi;
    } else {
      collectionRemove(planeElements, di);
      di.$parent = null;
    }
  } catch (error) {

  }

};



FpbUpdater.prototype.updateConnectionWaypoints = function (connection) {
  connection.businessObject.di.set('waypoint', this._fpbFactory.createDiWaypoints(connection.waypoints));
};


FpbUpdater.prototype.updateConnection = function (context) {

  var connection = context.connection,
    businessObject = getBusinessObject(connection),
    newSource = getBusinessObject(connection.source),
    newTarget = getBusinessObject(connection.target);
  //TODO: Das Modell nochmal überdenken
  // Connections die von Product, Energy oder Information kommen
  if (is(newSource, 'fpb:State')) {
    // Prüfen ob neuer Target ProcessOperator ist
    if (is(newTarget, 'fpb:ProcessOperator')) {
      var inverseSet = is(businessObject, 'fpb:Flow');
      // Update der Source, wenn diese sich verändet hat
      if (businessObject.sourceRef !== newSource) {
        // Löscht alten Ref
        if (inverseSet) {
          collectionRemove(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        // Neue Ref
        businessObject.sourceRef = newSource;
        // Falls noch kein Array für Outgoing Connections im Startshape angelegt ist
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          businessObject.sourceRef.outgoing = [];
        }

        //businessObject.sourceRef.outgoing.push(businessObject);
        collectionAdd(businessObject.sourceRef.outgoing, businessObject)
      }

      // Update Target
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          collectionRemove(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }
        businessObject.targetRef = newTarget;
        if (businessObject.targetRef.get('incoming') === undefined) {
          businessObject.targetRef.incoming = [];
        };
        businessObject.targetRef.incoming.push(businessObject);
      } else {
        collectionAdd(businessObject.targetRef.incoming, businessObject)
      };
    }
  };

  // Connections die vom ProcessOperator ausgehen
  if (is(newSource, 'fpb:ProcessOperator')) {
    // Connections zu Product, Energy oder Information ( Ablauf genau wie darüber ) TODO: Auslagern in eine Separate Funktion (Dont repeat yourself)
    if (is(newTarget, 'fpb:State')) {
      var inverseSet = is(businessObject, 'fpb:Flow');
      // Update der Source, wenn diese sich verändet hat
      if (businessObject.sourceRef !== newSource) {
        // Löscht alten Ref
        if (inverseSet) {
          collectionRemove(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        // Neue Ref
        businessObject.sourceRef = newSource;
        // Falls noch kein Array für Outgoing Connections im Startshape angelegt ist
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          businessObject.sourceRef.outgoing = [];
        }
        businessObject.sourceRef.outgoing.push(businessObject);
      } else {
        collectionAdd(businessObject.sourceRef.outgoing, businessObject)
      }
      // Update Target
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          collectionRemove(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }
        businessObject.targetRef = newTarget;
        if (businessObject.targetRef.get('incoming') === undefined) {
          businessObject.targetRef.incoming = [];
        };
        businessObject.targetRef.incoming.push(businessObject);
      }
      else {
        collectionAdd(businessObject.targetRef.incoming, businessObject)
      };
    };
    if (is(newTarget, 'fpb:TechnicalResource')) {
      var inverseSet = is(businessObject, 'fpb:Usage');
      // Update der Source, wenn diese sich verändet hat
      if (businessObject.sourceRef !== newSource) {
        // Löscht alten Ref
        if (inverseSet) {
          collectionRemove(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        // Neue Ref
        businessObject.sourceRef = newSource;
        // Falls noch kein Array für Outgoing Connections im Startshape angelegt ist
        if (businessObject.sourceRef.get('outgoing') === undefined) {
          businessObject.sourceRef.outgoing = [];
        }
        businessObject.sourceRef.outgoing.push(businessObject);
      }
      // Update Target
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          collectionRemove(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }
        businessObject.targetRef = newTarget;
        if (businessObject.targetRef.get('incoming') === undefined) {
          businessObject.targetRef.incoming = [];
        };
        if (!Array.isArray(businessObject.targetRef.incoming)) {
          businessObject.targetRef.incoming  = [businessObject.targetRef.incoming];
        }
        //businessObject.targetRef.incoming.push(businessObject);
        collectionAdd(businessObject.targetRef.incoming, businessObject)
        businessObject.targetRef = newTarget;
        //businessObject.targetRef.incoming = businessObject;
        
        if (!Array.isArray(businessObject.targetRef.isAssignedTo)) {
          businessObject.targetRef.isAssignedTo  = [businessObject.targetRef.isAssignedTo];
        }
        collectionAdd(businessObject.targetRef.isAssignedTo, businessObject.sourceRef)
      };
    }
  };
  // Connection die von TechnicalResource ausgehen
  // TODO: Überlegungen anstellen, ob an einer der beiden Shapes die Usage Connection immer als incoming/outgoing definiert wird, 
  // egal von welcher Shape die Connection aus gezogen wird
  if (is(newSource, 'fpb:TechnicalResource')) {
    if (is(newTarget, 'fpb:ProcessOperator')) {
      // Gleiche Logik wie bei TechnicalResource
      var inverseSet = is(businessObject, 'fpb:Usage');
      // Update der Source, wenn diese sich verändet hat
      if (businessObject.sourceRef !== newSource) {
        // Löscht alten Ref
        if (inverseSet) {
          collectionRemove(businessObject.sourceRef && businessObject.sourceRef.get('outgoing'), businessObject);
        }
        // Neue Ref
        businessObject.sourceRef = newSource;
        businessObject.sourceRef.outgoing.push(businessObject);
      }
      // Update Target
      if (businessObject.targetRef !== newTarget) {
        if (inverseSet) {
          collectionRemove(businessObject.targetRef && businessObject.targetRef.get('incoming'), businessObject);
        }

        businessObject.targetRef = newTarget;
        if (businessObject.targetRef.get('incoming') === undefined) {
          businessObject.targetRef.incoming = [];
        }
        if (!Array.isArray(businessObject.targetRef.incoming)) {
          businessObject.targetRef.incoming  = [businessObject.targetRef.incoming];
        }
        collectionAdd(businessObject.targetRef.incoming, businessObject)
        //businessObject.targetRef.incoming.push(businessObject);
      };
    }
  }
  this.updateConnectionWaypoints(connection);

  this.updateDiConnection(businessObject.di, newSource, newTarget);
};
// Hilfsfunktion, löscht alle untergeordneten Abhängigkeiten wenn ein Flow von einem übergeordneten Prozess gelöscht wird
function cleanUpDependenciesOfFlow(flow, stateShape) {
  let state;
  let processOperator;
  if (is(flow.sourceRef, 'fpb:State')) {
    state = flow.sourceRef;
    processOperator = flow.targetRef;
  } else {
    state = flow.targetRef;
    processOperator = flow.sourceRef;
  };



  // Der verbundene ProcessOperator wurde bereits dekomponiert
  let decomposedProcess = processOperatorShape.businessObject.decomposedView;
  let decomposedProcessSystemLimit = getElementsFromElementsContainer(decomposedProcess.businessObject.elementsContainer, 'fpb:SystemLimit')[0];

  // Löschen des States und dessen Connections aus dem dekomponierten Prozess
  let stateInDecomposedProcess = getElementById(decomposedProcessSystemLimit.businessObject.elementsContainer, stateShape.id);

  stateInDecomposedProcess.outgoing.forEach(function (flow) {
    collectionRemove(decomposedProcessSystemLimit.businessObject.elementsContainer, flow);
    collectionRemove(flow.businessObject.targetRef.incoming, flow.businessObject);
  });
  stateInDecomposedProcess.incoming.forEach(function (flow) {
    collectionRemove(decomposedProcessSystemLimit.businessObject.elementsContainer, flow);
  });

  collectionRemove(decomposedProcessSystemLimit.businessObject.elementsContainer, stateInDecomposedProcess);
  collectionRemove(decomposedProcess.businessObject.consistsOfStates, stateInDecomposedProcess.businessObject);
}

/////// helpers ///////////////////////////////////

function copyWaypoints(connection) {
  return connection.waypoints.map(function (p) {
    return { x: p.x, y: p.y };
  });
}

function isFpb(element) {
  return element && /fpb:/.test(element.type);
}

function ifFpbElement(fn) {
  return function (event) {
    var context = event.context,
      element = context.shape || context.connection;

    if (isFpb(element)) {
      fn(event);
    }
  };
}

FpbUpdater.prototype._getLabel = function (di) {
  if (!di.label) {
    di.label = this._fpbFactory.createDiLabel();
  }
  return di.label;
};



/**
 * Make sure the event listener is only called
 * if the touched element is a BPMN element.
 *
 * @param  {Function} fn
 * @return {Function} guarded function
 */
function ifFpb(fn) {

  return function (event) {

    var context = event.context,
      element = context.shape || context.connection;

    if (is(element, 'fpb:BaseElement')) {
      fn(event);
    }
  };
}