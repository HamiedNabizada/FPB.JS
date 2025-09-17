import Diagram from 'diagram-js';

import FpbjsModdle from './fpb-moddle';
import Ids from 'ids';

import inherits from 'inherits';
import {
    innerSVG
} from 'tiny-svg';

import {
    assign,
    isNumber,
    omit,
    isArray
} from 'min-dash';

import {
    domify,
    query as domQuery,
    remove as domRemove

} from 'min-dom';



import KeyboardMoveModule from 'diagram-js/lib/navigation/keyboard-move';
import MoveCanvasModule from 'diagram-js/lib/navigation/movecanvas';
import ZoomScrollModule from 'diagram-js/lib/navigation/zoomscroll';
import AlignElementsModule from 'diagram-js/lib/features/align-elements';
import AutoScrollModule from 'diagram-js/lib/features/auto-scroll';
import BendpointsModule from 'diagram-js/lib/features/bendpoints';
import KeyboardMoveSelectionModule from 'diagram-js/lib/features/keyboard-move-selection';
import MoveModule from 'diagram-js/lib/features/move';
import ResizeModule from 'diagram-js/lib/features/resize';
import TranslateModule from 'diagram-js/lib/i18n/translate';
import SelectionModule from 'diagram-js/lib/features/selection';
import OverlaysModule from 'diagram-js/lib/features/overlays';
// import AutoResize from 'diagram-js/lib/features/auto-resize'; // Disabled - allows free SystemLimit resize

// Grid functionality
import GridModule from 'diagram-js-grid';
import GridSnappingModule from 'diagram-js/lib/features/grid-snapping';

// Fpb Specific Module 
import FpbCoreModule from './core'
import LabelEditingModule from './label';
import ContextPadModule from './context-pad';
import PaletteModule from './palette';
import ModelingModule from './modeling';
import JsonImporter from './importer';
import ServicesModule from './services';


var DEFAULT_OPTIONS = {
    width: '100%',
    height: '100%',
    position: 'relative'
};
export default function FpbModeler(options) {
    options = assign({}, DEFAULT_OPTIONS, options);


    this._options = options;
    this._moddle = this._createModdle(options);
    this._container = this._createContainer(options);

    this._init(this._container, this._moddle, options);

    this._fpbElements = [];
    this._project;
    this._processes = [];

}


inherits(FpbModeler, Diagram);


FpbModeler.prototype.getModules = function () {
    return this._modules;
};

FpbModeler.prototype._init = function (container, moddle, options) {

    var baseModules = options.modules || this.getModules(),
        additionalModules = options.additionalModules || [],
        staticModules = [
            {
                fpbjs: ['value', this],
                moddle: ['value', moddle],
            }
        ];

    var diagramModules = [].concat(staticModules, baseModules, additionalModules);

    var diagramOptions = assign(omit(options, ['additionalModules']), {
        canvas: assign({}, options.canvas, { container: container }),
        modules: diagramModules
    });
    Diagram.call(this, diagramOptions);

    if (options && options.container) {
        this.attachTo(options.container);
    }
};

FpbModeler.prototype._modules = [
    KeyboardMoveModule,
    MoveCanvasModule,
    ZoomScrollModule,
    AlignElementsModule,
    AutoScrollModule,
    BendpointsModule,
    KeyboardMoveSelectionModule,
    MoveModule,
    ResizeModule,
    TranslateModule,
    SelectionModule,
    OverlaysModule,
    GridModule,
    GridSnappingModule,
    FpbCoreModule,
    LabelEditingModule,
    ContextPadModule,
    PaletteModule,
    ModelingModule,
    JsonImporter,
    ServicesModule
    // AutoResize - disabled to allow free SystemLimit resize
];

FpbModeler.prototype._createContainer = function (options) {
    var container = domify('<div class="djs-container"></div>');
    assign(container.style, {
        width: ensureUnit(options.width),
        height: ensureUnit(options.height),
        position: options.position
    });
    return container;
};


FpbModeler.prototype._createModdle = function (options) {
    var moddleOptions = assign({}, this._moddleExtensions, options.moddleExtensions);
    var moddle = new FpbjsModdle(moddleOptions);
    return moddle;
};

FpbModeler.prototype.attachTo = function (parentNode) {
    if (!parentNode) {
        throw new Error('parentNode required');
    }
    // ensure we detach from the
    // previous, old parent
    this.detach();

    // unwrap jQuery if provided
    if (parentNode.get && parentNode.constructor.prototype.jquery) {
        parentNode = parentNode.get(0);
    }

    if (typeof parentNode === 'string') {
        parentNode = domQuery(parentNode);
    }

    parentNode.appendChild(this._container);

    this._emit('attach', {});

    this.get('canvas').resized();
};

FpbModeler.prototype.detach = function () {

    var container = this._container,
        parentNode = container.parentNode;

    if (!parentNode) {
        return;
    }

    this._emit('detach', {});

    parentNode.removeChild(container);
};

FpbModeler.prototype._emit = function (type, event) {
    return this.get('eventBus').fire(type, event);
};

FpbModeler.prototype.on = function (event, priority, callback, target) {
    return this.get('eventBus').on(event, priority, callback, target);
};

FpbModeler.prototype.off = function (event, callback) {
    this.get('eventBus').off(event, callback);
};
/*
FpbModeler.prototype.getDefinitions = function () {
    return this._definitions;
};*/
/*
FpbModeler.prototype.destroy = function () {

    // diagram destroy
    Diagram.prototype.destroy.call(this);

    // dom detach
    domRemove(this._container);
};*/

FpbModeler.prototype.clear = function () {

    this.get('elementRegistry').forEach(function (element) {
        var bo = element.businessObject;

        if (bo && bo.di) {
            delete bo.di;
        }
    });

    // remove drawn elements
    Diagram.prototype.clear.call(this);
};

function ensureUnit(val) {
    return val + (isNumber(val) ? 'px' : '');
}

FpbModeler.prototype._addFpbShape = function (fpbElement) {

    this._fpbElements.push(fpbElement);

    var canvas = this.get('canvas'),
        elementFactory = this.get('elementFactory');


    var fpbAttrs = assign({ businessObject: fpbElement }, fpbElement);
    var fpbShape = elementFactory.create('shape', fpbAttrs);
    return canvas.addShape(fpbShape);

};

FpbModeler.prototype._addFpbConnection = function (fpbElement) {

    this._fpbElements.push(fpbElement);

    var canvas = this.get('canvas'),
        elementFactory = this.get('elementFactory'),
        elementRegistry = this.get('elementRegistry');
    var fpbAttrs = assign({ businessObject: fpbElement }, fpbElement);

    var connection = elementFactory.create('connection', assign(fpbAttrs, {
        source: elementRegistry.get(fpbElement.source),
        target: elementRegistry.get(fpbElement.target)
    }),
        elementRegistry.get(fpbElement.source).parent);


    return canvas.addConnection(connection);

};


FpbModeler.prototype.addFpbElements = function (fpbElements) {
    if (!isArray(fpbElements)) {
        throw new Error('argument must be an array');
    }

    var shapes = [],
        connections = [];

    fpbElements.forEach(function (fpbElement) {
        if (isFpbConnection(fpbElement)) {
            connections.push(fpbElement);
        } else {
            shapes.push(fpbElement);
        }
    });

    shapes.forEach(this._addFpbShape, this);

    connections.forEach(this._addFpbConnection, this);
};

FpbModeler.prototype.getFpbElements = function () {
    return this._fpbElements;
};

FpbModeler.prototype.setProjectDefinition = function (project) {
    this._project = project;
};

FpbModeler.prototype.getProjectDefinition = function () {
    return this._project;
}

FpbModeler.prototype.getProcesses = function () {
    return this._processes;
}
FpbModeler.prototype.getProcess = function (id) {
    let process;
    this._processes.forEach((pro) => {
        if (pro.process) {
            if (pro.process.id == id) {
                process = pro;
            }
        }
    })
    return process;
}
FpbModeler.prototype.getSelectedElements = function (processId) {
    let selectedElements = this.get('selection').get();
    let pro = this.getProcess(processId);
    let vsInfos = [];
    let dataInfos = [];
    let elementIds = [];

    selectedElements.forEach((el) => {
        elementIds.push(el.id);
    })
    while (elementIds.length > 0) {
        let id = elementIds.pop();
        pro.elementVisualInformation.forEach((vs) => {
            if (vs.id == id) {
                vsInfos.push(vs);
            }
        })
        pro.elementDataInformation.forEach((edi) => {
            if (edi.id === id) {
                dataInfos.push(edi);
            }
        })
    }
    return { elementDataInformation: dataInfos, elementVisualInformation: vsInfos }

}



function isFpbConnection(element) {
    return element.type === 'fpb:connection' || element.type === 'fpb:Usage';
}

FpbModeler.prototype.saveSVG = function (options, done) {
    if (!done) {
        done = options;
        options = {};
    }

    this._emit('saveSVG.start');

    var svg, err;

    try {
        var canvas = this.get('canvas');
        
        // Find the layer that contains visible content
        var activeLayer = null;
        Object.keys(canvas._layers).forEach(function(layerName) {
            var layer = canvas._layers[layerName];
            if (layer.group && layer.group.children && layer.group.children.length > 0) {
                var style = window.getComputedStyle(layer.group);
                if (style.display !== 'none' && layer.visible !== false) {
                    activeLayer = layer;
                }
            }
        });
        
        var contentNode = activeLayer ? activeLayer.group : canvas.getDefaultLayer();
        var defsNode = domQuery('defs', canvas._svg);

        var contents = innerSVG(contentNode);
        
        // Fix SVG paths without fill="none" to prevent black fills
        contents = contents.replace(/<path([^>]*?)style="([^"]*?)"([^>]*?)>/g, function(match, before, styleContent, after) {
            // Only add fill="none" if no fill is specified and it's not a hit detection path
            if (!styleContent.includes('fill:') && !match.includes('djs-hit')) {
                var newStyle = styleContent + (styleContent.endsWith(';') ? '' : ';') + ' fill: none;';
                return '<path' + before + 'style="' + newStyle + '"' + after + '>';
            }
            return match;
        });
        
        // Clean defs from grid patterns
        var cleanDefs = '';
        if (defsNode) {
            var defsClone = defsNode.cloneNode(true);
            var gridPatterns = defsClone.querySelectorAll('pattern[id*="djs-grid-pattern"]');
            Array.prototype.forEach.call(gridPatterns, function(pattern) {
                if (pattern.parentNode) {
                    pattern.parentNode.removeChild(pattern);
                }
            });
            cleanDefs = '<defs>' + innerSVG(defsClone) + '</defs>';
        }

        var bbox = contentNode.getBBox();

        svg =
            '<?xml version="1.0" encoding="utf-8"?>\n' +
            '<!-- created with bpmn-js / http://bpmn.io -->\n' +
            '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
            'width="' + bbox.width + '" height="' + bbox.height + '" ' +
            'viewBox="' + bbox.x + ' ' + bbox.y + ' ' + bbox.width + ' ' + bbox.height + '" version="1.1">' +
            cleanDefs + contents +
            '</svg>';
    } catch (e) {
        console.error('SVG generation failed:', e);
        err = e;
    }

    this._emit('saveSVG.done', {
        error: err,
        svg: svg
    });

    done(err, svg);
};