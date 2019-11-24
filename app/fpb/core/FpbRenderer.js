import inherits from 'inherits';

import {
  isObject,
  assign,
  forEach
} from 'min-dash';

import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';

import { is, isAny } from '../help/utils';

import {
  rotate,
  transform,
  translate
} from 'diagram-js/lib/util/SvgTransformUtil';
import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  classes as svgClasses
} from 'tiny-svg';

import Ids from 'ids';

import {
  componentsToPath,
  createLine
} from 'diagram-js/lib/util/RenderUtil';

import {
  query as domQuery
} from 'min-dom';

var RENDERER_IDS = new Ids();

var COLOR_FPB_PRODUCT = '#ed2028',
  COLOR_FPB_ENERGY = '#6e9ad1',
  COLOR_FPB_INFORMATION = '#3050a2',
  COLOR_FPB_PROCESS_OPERATOR = '#13ae4d',
  COLOR_FPB_TECHNICAL_RESOURCE = '#888889',
  COLOR_FPB_STROKE = '#000000',
  WIDTH_FPB_STROKE = 2;

export default function FpbRenderer(eventBus, styles, canvas, textRenderer) {

  this.CONNECTION_STYLE = styles.style(['no-fill'], { strokeWidth: 5, stroke: 'fuchsia' });
  BaseRenderer.call(this, eventBus, 2000);

  var computeStyle = styles.computeStyle;

  var rendererId = RENDERER_IDS.next();

  var markers = {};

  function addMarker(id, options) {
    var attrs = assign({
      fill: 'black',
      strokeWidth: 1,
      strokeLinecap: 'round',
      strokeDasharray: 'none'
    }, options.attrs);

    var ref = options.ref || { x: 0, y: 0 };

    var scale = options.scale || 1;

    // fix for safari / chrome / firefox bug not correctly
    // resetting stroke dash array
    if (attrs.strokeDasharray === 'none') {
      attrs.strokeDasharray = [10000, 1];
    }

    var marker = svgCreate('marker');

    svgAttr(options.element, attrs);

    svgAppend(marker, options.element);

    svgAttr(marker, {
      id: id,
      viewBox: '0 0 20 20',
      refX: ref.x,
      refY: ref.y,
      markerWidth: 20 * scale,
      markerHeight: 20 * scale,
      orient: 'auto'
    });

    var defs = domQuery('defs', canvas._svg);

    if (!defs) {
      defs = svgCreate('defs');

      svgAppend(canvas._svg, defs);
    }

    svgAppend(defs, marker);

    markers[id] = marker;
  }

  function colorEscape(str) {
    return str.replace(/[()\s,#]+/g, '_');
  }

  function marker(type, fill, stroke) {
    var id = type + '-' + colorEscape(fill) + '-' + colorEscape(stroke) + '-' + rendererId;
    if (!markers[id]) {
      createMarker(id, type, fill, stroke);
    }

    return 'url(#' + id + ')';
  }

  function createMarker(id, type, fill, stroke) {
    if (type === 'Arrow-At-End') {
      var arrowHead = svgCreate('path');
      svgAttr(arrowHead, { d: 'M 1 5 L 11 10 L 1 15 Z' });

      addMarker(id, {
        element: arrowHead,
        ref: { x: 11, y: 10 },
        scale: 0.5,
        attrs: {
          fill: stroke,
          stroke: stroke
        }
      });
    }
    if (type === 'Arrow-At-Start') {
      var arrowHead = svgCreate('path');
      svgAttr(arrowHead, { d: 'M 11 5 L 1 10 L 11 15 Z' });

      addMarker(id, {
        element: arrowHead,
        ref: { x: 0, y: 10 },
        scale: 0.5,
        attrs: {
          fill: stroke,
          stroke: stroke
        }
      });
    }

  }

  function renderLabel(parentGfx, label, options) {
    options = assign({
      size: {
        width: 100
      }
    }, options);
    var text = textRenderer.createText(label || '', options);

    svgClasses(text).add('djs-label');
    svgAppend(parentGfx, text);
    return text;
  };

  function renderEmbeddedLabel(parentGfx, element, align) {
    var semantic = element.businessObject;
    var box;
    var padding = 5;
    box = {
      width: element.width,
      height: element.height
    }
    if(!semantic.name){
      return
    }
    
    if (isAny(element, ['fpb:ProcessOperator', 'fpb:TechnicalResource'])) {
      let topPadding = textRenderer.getInternalLabelPadding(element,semantic.name);
      // TODO: Randfälle überprüfen und Logik eventuell anpassen
      if(semantic.name.length >= 19 && topPadding == 18){
        topPadding *=2;
      }
      padding = {
        top: element.height - topPadding,
        bottom: 5,
        left: 5,
        right: 3
      }
    }

    return renderLabel(parentGfx, semantic.name, {
      box: box,
      align: align,
      padding: padding,
      style: {
        fill: COLOR_FPB_STROKE
      }
    });
  }

  this.renderExternalLabel = function (parentGfx, element) {
    var semantic = element.businessObject;
    var box = {

      width: element.width,
      height: element.height,
      x: element.x,
      y: element.y
    };
    return renderLabel(parentGfx, semantic.name, {
      box: box,
      fitBox: true,
      align: 'left',
      style: assign(
        {},
        textRenderer.getExternalStyle(),
        {
          fill: COLOR_FPB_STROKE
        }
      )
    });
  };


  function createPathFromConnection(connection) {
    var waypoints = connection.waypoints;

    var pathData = 'm  ' + waypoints[0].x + ',' + waypoints[0].y;
    for (var i = 1; i < waypoints.length; i++) {
      pathData += 'L' + waypoints[i].x + ',' + waypoints[i].y + ' ';
    }
    return pathData;
  };
  function drawPath(parentGfx, d, attrs) {

    attrs = computeStyle(attrs, ['no-fill'], {
      strokeWidth: 2,
      stroke: 'black'
    });

    var path = svgCreate('path');
    svgAttr(path, { d: d });
    svgAttr(path, attrs);

    svgAppend(parentGfx, path);

    return path;
  }


  this.drawFpbProduct = function (p, element) {
    let width = element.width;
    let height = element.height;
    var cx = width / 2,
      cy = height / 2;

    var attrs = computeStyle(attrs, {
      stroke: COLOR_FPB_STROKE,
      strokeWidth: WIDTH_FPB_STROKE,
      fill: COLOR_FPB_PRODUCT
    });

    var circle = svgCreate('circle');

    svgAttr(circle, {
      cx: cx,
      cy: cy,
      r: Math.round((width + height) / 4)
    });

    svgAttr(circle, attrs);
    svgAppend(p, circle);
    //renderExternalLabel(p, element);
    return circle;
  };

  this.drawFpbEnergy = function (p, element) {
    var width = element.width;
    var height = element.height;
    var width_2 = width / 2;
    var height_2 = height / 2;
    var points = [width_2, 0,
      width, height_2,
      width_2, height,
      0, height_2
    ];
    var attrs = computeStyle(attrs, {
      stroke: COLOR_FPB_STROKE,
      strokeWidth: WIDTH_FPB_STROKE,
      fill: COLOR_FPB_ENERGY
    });
    var polygon = svgCreate('polygon');

    svgAttr(polygon, {
      points: points
    });

    svgAttr(polygon, attrs);

    svgAppend(p, polygon);
    //renderExternalLabel(p, element);
    return polygon;

  };

  // TODO: Nochmal Gedanken über die Berechnung machen.
  this.drawFpbInformation = function (p, element) {
    var width = element.width;
    var height = element.height;
    var points = [0, 0.5 * height,
      0.25 * width, 0.02 * height,
      0.75 * width, 0.02 * height,
      width, 0.5 * height,
      0.75 * width, 0.98 * height,
      0.25 * width, 0.98 * height
    ];

    var attrs = computeStyle(attrs, {
      stroke: COLOR_FPB_STROKE,
      strokeWidth: WIDTH_FPB_STROKE,
      fill: COLOR_FPB_INFORMATION
    });

    var polygon = svgCreate('polygon');

    svgAttr(polygon, {
      points: points
    });

    svgAttr(polygon, attrs);

    svgAppend(p, polygon);
    //renderExternalLabel(p, element);
    return polygon;
  };

  this.drawFpbProcessOperator = function (p, element) {
    let width = element.width;
    let height = element.height;
    var attrs = computeStyle(attrs, {
      stroke: COLOR_FPB_STROKE,
      strokeWidth: WIDTH_FPB_STROKE,
      fill: COLOR_FPB_PROCESS_OPERATOR
    });
    var rect = svgCreate('rect');
    svgAttr(rect, {
      height: height,
      rx: 0,
      ry: 0,
      width: width,
      x: 0,
      y: 0
    });
    svgAttr(rect, attrs);
    svgAppend(p, rect);
    // renderEmbeddedLabel(p, element, 'center-middle');
    renderEmbeddedLabel(p, element, 'right-top');
    return rect;
  };

  this.drawFpbTechnicalResource = function (p, element) {
    var width = element.width;
    var height = element.height;
    var rx = width / 5;
    var ry = height / 2;
    var attrs = computeStyle(attrs, {
      stroke: COLOR_FPB_STROKE,
      strokeWidth: WIDTH_FPB_STROKE,
      fill: COLOR_FPB_TECHNICAL_RESOURCE
    });
    var rect = svgCreate('rect');
    svgAttr(rect, {
      height: height,
      width: width,
      rx: rx,
      ry: ry,
      x: 0,
      y: 0
    });
    svgAttr(rect, attrs);
    svgAppend(p, rect);
    renderEmbeddedLabel(p, element, 'center-top');
    return rect;
  };

  this.drawFpbSystemLimit = function (p, element) {
    var width = element.width;
    var height = element.height;
    var attrs = computeStyle(attrs, {
      stroke: COLOR_FPB_STROKE,
      strokeWidth: WIDTH_FPB_STROKE,
      fill: 'none',
      strokeDasharray: '10, 12'
    });
    var rect = svgCreate('rect');
    svgAttr(rect, {
      height: height,
      rx: 0,
      ry: 0,
      width: width,
      x: 0,
      y: 0
    });

    svgAttr(rect, attrs);
    svgAppend(p, rect);
    renderEmbeddedLabel(p, element, 'right-top');
    return rect;
  };


  this.getFpbProductPath = function (shape) {
    var cx = shape.x + shape.width / 2,
      cy = shape.y + shape.height / 2,
      radius = shape.width / 2;

    var productPath = [
      ['M', cx, cy],
      ['m', 0, -radius],
      ['a', radius, radius, 0, 1, 1, 0, 2 * radius],
      ['a', radius, radius, 0, 1, 1, 0, -2 * radius],
      ['z']
    ];

    return componentsToPath(productPath);
  };


  this.getFpbEnergyPath = function (element) {
    var x = element.x,
      y = element.y,
      width = element.width,
      height = element.height;
    var energyPath = [
      ['M', x + width / 2, y],    // Startpunkt (Obere Ecke) 
      ['l', width / 2, height / 2], // Linie zur rechten Ecke
      ['l', -(width / 2), height / 2], // Linie zur unteren Ecke
      ['l', -(width / 2), -(height)], // Linie zur linken Ecke
      ['z'] // Linie zum Startpunkt
    ];
    return componentsToPath(energyPath);
  };

  // TODO: Hier passt was vermutlich nicht
  this.getFpbInformationPath = function (element) {
    var x = element.x,
      y = element.y,
      width = element.width,
      height = element.height;

    var informationPath = [
      ['M', x + width / 4, y],
      ['l', width / 2, 0],  //l1
      ['l', width / 4, height / 2], //l2 
      ['l', -(width / 4), height / 2], //l3
      ['l', -(width / 2), 0], //l4 
      ['l', -(width / 4), -(height / 2)], //l4
      ['z']
    ];
    return componentsToPath(informationPath);


  };

  this.getFpbProcessOperatorPath = function (element) {
    var x = element.x,
      y = element.y,
      width = element.width,
      height = element.height;

    var processOperatorPath = [
      ['M', x, y],
      ['l', width, 0],
      ['l', 0, height],
      ['l', -width, 0],
      ['z']
    ];
    return componentsToPath(processOperatorPath);
  };

  // TODO: Nochmal Gedanken über die Berechnung machen.
  this.getFpbTechnicalResourcePath = function (element) {
    var x = element.x,
      y = element.y,
      width = element.width,
      height = element.height;
    // Crazy Berechnungen
    var m1x = (11 / 46) * width + x,

      m1y = (10 / 46) * height + y,
      h1 = (24 / 46) * width,
      c1x1 = (5 / 46) * width,
      c1y1 = 0,
      c1x2 = (9 / 46) * width,
      c1y2 = (4.5 / 46) * height,
      c1x3 = (9 / 46) * width,
      c1y3 = (10 / 46) * height,
      c1x4 = 0,
      c1y4 = (5.5 / 46) * height,
      c1x5 = (-4 / 46) * width,
      c1y5 = (10 / 46) * height,
      c1x6 = (-9 / 46) * width,
      c1y6 = (10 / 46) * height,
      h2 = (24 / 46) * width,
      c2x1 = (6 / 46) * width,
      c2y1 = (30 / 46) * height,
      c2x2 = (2 / 46) * width,
      c2y2 = (25.5 / 46) * height,
      c2x3 = (2 / 46) * width,
      c2y3 = (20 / 46) * height,
      c2x4 = (2 / 46) * width,
      c2y4 = (14.5 / 46) * height,
      c2x5 = (6 / 46) * width,
      c2y5 = (10 / 46) * height,
      c2x6 = (11 / 46) * width,
      c2y6 = (10 / 46) * height;


    var processOperatorPath = [
      ['m', m1x, m1y],
      ['h', h1],
      ['c', c1x1, c1y1, c1x2, c1y2, c1x3, c1y3, c1x4, c1y4, c1x5, c1y5, c1x6, c1y6],
      ['H', h2],
      ['C', c2x1, c2y1, c2x2, c2y2, c2x3, c2y3, c2x4, c2y4, c2x5, c2y5, c2x6, c2y6],
      ['z']
    ];
    return componentsToPath(processOperatorPath);
  };
  // TODO: Das ist vermutlich nicht gestrichelt.
  this.getFpbSystemLimitPath = function (element) {
    var x = element.x,
      y = element.y,
      width = element.width,
      height = element.height;

    var systemLimitPath = [
      ['M', x, y],
      ['l', width, 0],
      ['l', 0, height],
      ['l', -width, 0],
      ['z']
    ];
    return componentsToPath(systemLimitPath);
  };

  this.drawFpbFlow = function (p, element) {
    var pathData = createPathFromConnection(element);
    var attrs = {
      strokeLinejoin: 'round',
      markerEnd: marker('Arrow-At-End', 'white', 'black'),
      stroke: 'black',
      strokeWidth: 2
    };
    var path = drawPath(p, pathData, attrs);

    return path;
  }

  this.drawFpbConnection = function (p, element) {
    var attrs = {
      strokeLinejoin: 'round',
      markerEnd: marker('Arrow-At-End', 'white', 'black'),
      stroke: 'black',
      strokeWidth: 2
    };
    return svgAppend(p, createLine(element.waypoints, attrs));
  };

  this.getFpbConnectionPath = function (connection) {
    var waypoints = connection.waypoints.map(function (p) {
      return p.original || p;
    });
    var connectionPath = [
      ['M', waypoints[0].x, waypoints[0].y]
    ];

    waypoints.forEach(function (waypoint, index) {
      if (index !== 0) {
        connectionPath.push(['L', waypoint.x, waypoint.y]);
      }
    });

    return componentsToPath(connectionPath);
  };

  this.drawFpbUsage = function (p, element) {
    var attrs = {
      strokeLinejoin: 'round',
      markerStart: marker('Arrow-At-Start', 'white', 'black'),
      markerEnd: marker('Arrow-At-End', 'white', 'black'),
      strokeDasharray: '10, 12',
      stroke: 'black',
      strokeWidth: 2
    };
    return svgAppend(p, createLine(element.waypoints, attrs));
  };

  this.getFpbUsagenPath = function (connection) {
    var waypoints = connection.waypoints.map(function (p) {
      return p.original || p;
    });
    var connectionPath = [
      ['M', waypoints[0].x, waypoints[0].y]
    ];

    waypoints.forEach(function (waypoint, index) {
      if (index !== 0) {
        connectionPath.push(['L', waypoint.x, waypoint.y]);
      }
    });

    return componentsToPath(connectionPath);
  };

}

inherits(FpbRenderer, BaseRenderer);

FpbRenderer.$inject = ['eventBus', 'styles', 'canvas', 'textRenderer'];




FpbRenderer.prototype.canRender = function (element) {
  return is(element, 'fpb:BaseElement');
};

FpbRenderer.prototype.drawShape = function (p, element) {
  var type = element.type;
  if (type === 'label') {
    return this.renderExternalLabel(p, element);
  };

  if (is(element, 'fpb:Product')) {
    return this.drawFpbProduct(p, element);
  };
  if (is(element, 'fpb:Information')) {
    return this.drawFpbInformation(p, element);
  };
  if (is(element, 'fpb:Energy')) {
    return this.drawFpbEnergy(p, element);
  };
  if (is(element, 'fpb:ProcessOperator')) {
    return this.drawFpbProcessOperator(p, element);
  };
  if (is(element, 'fpb:TechnicalResource')) {
    return this.drawFpbTechnicalResource(p, element);
  };
  if (is(element, 'fpb:SystemLimit')) {
    return this.drawFpbSystemLimit(p, element);
  };

};

FpbRenderer.prototype.getShapePath = function (shape) {
  if (is(shape, 'fpb:Product')) {
    return this.getFpbProductPath(shape);
  };
  if (is(shape, 'fpb:Information')) {
    return this.getFpbInformationPath(shape);
  };
  if (is(shape, 'fpb:Energy')) {
    return this.getFpbEnergyPath(shape);
  };
  if (is(shape, 'fpb:ProcessOperator')) {
    return this.getFpbProcessOperatorPath(shape);
  };
  if (is(shape, 'fpb:TechnicalResource')) {
    return this.getFpbTechnicalResourcePath(shape);
  };
  if (is(shape, 'fpb:SystemLimit')) {
    return this.getFpbSystemLimitPath(shape);
  };

};

FpbRenderer.prototype.drawConnection = function (p, element) {
  if (is(element, 'fpb:Usage')) {
    return this.drawFpbUsage(p, element);
  };
  if (is(element, 'fpb:ParallelFlow')) {
    return this.drawFpbFlow(p, element);
  };
  if (is(element, 'fpb:AlternativeFlow')) {
    return this.drawFpbFlow(p, element);
  };
  if (is(element, 'fpb:Flow')) {
    return this.drawFpbFlow(p, element);
  };
};

// TODO: Vermutlich überflüssig wenn COnnections eh mit Path erstellt werden
/*
FpbRenderer.prototype.getConnectionPath = function (connection) {

  var type = connection.type;

  if (type === 'fpb:connection') {
    return this.getFpbConnectionPath(connection);
  }
  if (type === 'fpb:Usage') {
    return this.getFpbConnectionPath(connection);
  }
};
*/