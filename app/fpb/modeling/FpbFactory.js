import {
    map,
    assign,
    pick
} from 'min-dash';

import {
    isAny
} from '../help/utils';


export default function FpbFactory(moddle) {
    this._model = moddle;
}

FpbFactory.$inject = ['moddle'];

// TODO: Prüfen was wirklich alles eine ID benötigt
FpbFactory.prototype._needsId = function (element) {
    return isAny(element, [
        'fpb:BaseElement'
    ])
};

FpbFactory.prototype._ensureId = function (element) {
    var prefix = (element.$type || '').replace(/^[^:]*:/g, '') + '_';
    
    if (!element.id && this._needsId(element)) {
        //element.id = this._model.ids.nextPrefixed(prefix, element);

        // UUID4 -> Random UUID ( https://www.npmjs.com/package/uuid )
        const { v4: uuidv4 } = require('uuid');
        element.id = uuidv4();
    }
};


FpbFactory.prototype.create = function (type, attrs, id) {
    var element = this._model.create(type, attrs || {});
    if(!id){
        this._ensureId(element);
    }else{
        element.id = id;
    }
    return element;
};


FpbFactory.prototype.createDiLabel = function () {
    return this.create('fpbjsdi:FPBJSLabel', {
        bounds: this.createDiBounds()
    });
    
};


FpbFactory.prototype.createDiShape = function (semantic, bounds, attrs) {

    return this.create('fpbjsdi:FPBJSShape', assign({
        fpbjsElement: semantic,
        bounds: this.createDiBounds(bounds)
    }, attrs));
};


FpbFactory.prototype.createDiBounds = function (bounds) {
    return this.create('dc:Bounds', bounds);
};


FpbFactory.prototype.createDiWaypoints = function (waypoints) {
    var self = this;

    return map(waypoints, function (pos) {
        return self.createDiWaypoint(pos);
    });
};

FpbFactory.prototype.createDiWaypoint = function (point) {
    return this.create('dc:Point', pick(point, ['x', 'y']));
};


FpbFactory.prototype.createDiEdge = function (semantic, waypoints, attrs) {
    return this.create('fpbjsdi:FPBJSEdge', assign({
        fpbjsElement: semantic
    }, attrs));
};

FpbFactory.prototype.createDiPlane = function (semantic) {
    return this.create('fpbjsdi:FPBJSPlane', {
        fpbjsElement: semantic
    });
};