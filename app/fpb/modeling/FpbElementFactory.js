import {
  assign,
  forEach
} from 'min-dash';

import inherits from 'inherits';

import { is, isAny } from '../help/utils';

import BaseElementFactory from 'diagram-js/lib/core/ElementFactory';

import {
  DEFAULT_LABEL_SIZE
} from '../help/utils';


export default function FpbElementFactory(fpbFactory, moddle, translate, fpbjs) {
  BaseElementFactory.call(this);
  this._fpbFactory = fpbFactory;
  this._moddle = moddle;
  this._translate = translate;
  this._fpbjs = fpbjs;
  var self = this;
}

inherits(FpbElementFactory, BaseElementFactory);

FpbElementFactory.$inject = [
  'fpbFactory',
  'moddle',
  'translate',
  'fpbjs'
];
FpbElementFactory.prototype.baseCreate = BaseElementFactory.prototype.create;

FpbElementFactory.prototype.create = function (elementType, attrs) {
  // no special magic for labels,
  // we assume their businessObjects have already been created
  // and wired via attrs
  if (elementType === 'label') {
    return this.baseCreate(elementType, assign({ type: 'label' }, DEFAULT_LABEL_SIZE, attrs));
  }
  return this.createFpbElement(elementType, attrs);
};

FpbElementFactory.prototype.createFpbElement = function (elementType, attrs) {

  var size,
    translate = this._translate;

  var businessObject = attrs.businessObject;


  if (!businessObject) {
    if (!attrs.type) {
      throw new Error(translate('no shape type specified'));
    }
    if(attrs.id){
      businessObject = this._fpbFactory.create(attrs.type, {}, attrs.id);
    }else{
      businessObject = this._fpbFactory.create(attrs.type);
 
    }
  };

  if (!businessObject.di) {
    if (elementType === 'root') {
      businessObject.di = this._fpbFactory.createDiPlane(businessObject, [], {
        id: businessObject.id + '_di'
      });
    } else
      if (elementType === 'connection') {
        businessObject.di = this._fpbFactory.createDiEdge(businessObject, [], {
          id: businessObject.id + '_di'
        });
      } else {
        businessObject.di = this._fpbFactory.createDiShape(businessObject, {}, {
          id: businessObject.id + '_di'
        });
      }
  };
  if (!businessObject.identification && is(businessObject, 'fpb:Object')) {
    businessObject.identification = this._fpbFactory.create('fpb:Identification', {
      uniqueIdent: businessObject.id,
      longName: '',
      shortName: businessObject.name || '',
      versionNumber: '',
      revisionNumber: ''
    });
  }
  if (!is(businessObject, 'fpb:Flow')) {
    size = this._getDefaultSize(businessObject);
  };
  if (is(businessObject, 'fpb:Process')) {
    if (!businessObject.elementsContainer) {
      businessObject.elementsContainer = [];
    }
    if (!businessObject.isDecomposedProcessOperator) {
      businessObject.isDecomposedProcessOperator = null;
    }
    if (!businessObject.consistsOfStates) {
      businessObject.consistsOfStates = [];
    }
    if (!businessObject.consistsOfSystemLimit) {
      businessObject.consistsOfSystemLimit = null;
    }
    if (!businessObject.consistsOfProcesses) {
      businessObject.consistsOfProcesses = [];
    }
    if (!businessObject.consistsOfProcessOperator) {
      businessObject.consistsOfProcessOperator = [];
    }
  }
  if (is(businessObject, 'fpb:SystemLimit')) {
    // Anlegen einen leeren elementsContainer, falls keiner vorhanden ist
    if (!businessObject.elementsContainer) {
      businessObject.elementsContainer = [];
    }
  }
  if (is(businessObject, 'fpb:Object')) {
    if (!businessObject.isAssignedTo) {
      businessObject.isAssignedTo = [];
    }
    if(!businessObject.incoming){
      businessObject.incoming = [];
    }
    if(!businessObject.outgoing){
      businessObject.outgoing = [];
    }
  }
  if (isAny(businessObject, ['fpb:AlternativeFlow', 'fpb:ParallelFlow'])) {
    if (!businessObject.inTandemWith) {
      businessObject.inTandemWith = [];
    }
  }
  attrs = assign({
    businessObject: businessObject,
    id: businessObject.id
  }, size, attrs);

  if (!('$model' in attrs.businessObject)) {
    Object.defineProperty(attrs.businessObject, '$model', {
      value: this._moddle
    });
  }
  if (!('$instanceOf' in attrs.businessObject)) {
    Object.defineProperty(attrs.businessObject, '$instanceOf', {
      value: function (type) {
        return this.type === type;
      }
    });
  }

  if (!('get' in attrs.businessObject)) {
    Object.defineProperty(attrs.businessObject, 'get', {
      value: function (key) {
        return this[key];
      }
    });
  }

  if (!('set' in attrs.businessObject)) {
    Object.defineProperty(attrs.businessObject, 'set', {
      value: function (key, value) {
        return this[key] = value;
      }
    });
  }

  return this.baseCreate(elementType, attrs);
};


FpbElementFactory.prototype._getDefaultSize = function (semantic) {

  if (is(semantic, 'fpb:State')) {
    return { width: 50, height: 50 };
  };

  if (isAny(semantic, ['fpb:ProcessOperator', 'fpb:TechnicalResource'])) {
    return { width: 150, height: 80 };
  };

  if (is(semantic, 'fpb:SystemLimit')) {
    return { width: 650, height: 700 };
  }
  return { width: 100, height: 80 };
};


// helpers //////////////////////

/**
 * Apply attributes from a map to the given element,
 * remove attribute from the map on application.
 *
 * @param {Base} element
 * @param {Object} attrs (in/out map of attributes)
 * @param {Array<String>} attributeNames name of attributes to apply
 */
/*
function applyAttributes(element, attrs, attributeNames) {
  forEach(attributeNames, function (property) {
    if (attrs[property] !== undefined) {
      applyAttribute(element, attrs, property);
    }
  });
}*/

/**
 * Apply named property to element and drain it from the attrs
 * collection.
 *
 * @param {Base} element
 * @param {Object} attrs (in/out map of attributes)
 * @param {String} attributeName to apply
 */
function applyAttribute(element, attrs, attributeName) {
  element[attributeName] = attrs[attributeName];

  delete attrs[attributeName];
}