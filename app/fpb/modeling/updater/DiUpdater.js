import inherits from 'inherits';

import {
  assign
} from 'min-dash';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import {
  remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

import {
  isLabel
} from 'diagram-js/lib/util/ModelUtil';

import {
  getBusinessObject,
  is
} from '../../help/utils';


/**
 * Handles DI (Diagram Interchange) updates:
 * - Connection cropping
 * - Shape/label bounds
 * - DI parent assignment
 * - Attachment updates
 * - Reconnect default/conditional flow
 */
export default function DiUpdater(eventBus, fpbFactory, connectionDocking) {

  CommandInterceptor.call(this, eventBus);

  this._fpbFactory = fpbFactory;

  var self = this;

  // connection cropping //////////////////////

  function cropConnection(e) {
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

  // update bounds //////////////////////

  function updateBounds(e) {
    var shape = e.context.shape;

    if (!is(shape, 'fpb:BaseElement')) {
      return;
    }

    self.updateBounds(shape);
  }

  this.executed(['shape.move', 'shape.create', 'shape.resize'], ifFpb(function (event) {
    if (event.context.shape.type === 'label') {
      return;
    }
    updateBounds(event);
  }));

  this.reverted(['shape.move', 'shape.create', 'shape.resize'], ifFpb(function (event) {
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

  // update Default & Conditional flows //////////////////////

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
    }
    // on reconnectEnd -> default flow
    if ((businessObject.sourceRef && businessObject.sourceRef.default)) {
      context.default = businessObject.sourceRef.default;
      businessObject.sourceRef.default = undefined;
    }
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

  // update attachments //////////////////////

  this.executed(['element.updateAttachment'], ifFpb(function (e) {
    self.updateAttachment(e.context);
  }));
  this.reverted(['element.updateAttachment'], ifFpb(function (e) {
    self.updateAttachment(e.context);
  }));

  // update DI parent //////////////////////
  // Extracted from the end of updateProcessInformation.
  // Sets the DI plane parent for any created/moved/deleted shape or connection.

  function updateDiParentForElement(e) {
    var context = e.context;
    var element = context.shape || context.connection;

    if (isLabel(element)) {
      return;
    }

    var parentShape = element.parent;
    var businessObject = element.businessObject,
      parentBusinessObject = parentShape && parentShape.businessObject,
      parentDi = parentBusinessObject && parentBusinessObject.di;

    self.updateDiParent(businessObject.di, parentDi);
  }

  this.executed([
    'shape.move',
    'shape.create',
    'shape.delete',
    'connection.create',
    'connection.move',
    'connection.delete'
  ], ifFpb(updateDiParentForElement));

  // NOTE: The revert path for DI parent updates was non-functional in the original
  // FpbUpdater.js (reverseUpdateProcessInformation passed wrong args). Preserving
  // that behavior by not registering a revert handler here.
}

inherits(DiUpdater, CommandInterceptor);

DiUpdater.$inject = [
  'eventBus',
  'fpbFactory',
  'connectionDocking'
];


DiUpdater.prototype.updateAttachment = function (context) {
  var shape = context.shape,
    businessObject = shape.businessObject,
    host = shape.host;

  businessObject.attachedToRef = host && host.businessObject;
};


DiUpdater.prototype.updateBounds = function (shape) {
  var di = shape.businessObject.di;

  var target = isLabel(shape) ? this._getLabel(di) : di;

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


DiUpdater.prototype.updateDiParent = function (di, parentDi) {
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
    // Intentionally empty: handles cases where parentDi and di.$parent are both null
  }
};


DiUpdater.prototype._getLabel = function (di) {
  if (!di.label) {
    di.label = this._fpbFactory.createDiLabel();
  }
  return di.label;
};


/////// helpers ///////////////////////////////////

/**
 * Guard: only call fn if the touched element is an FPB element.
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
