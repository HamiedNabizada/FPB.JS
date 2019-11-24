import {
  assign
} from 'min-dash';


import {
  getLabel,
  is,
  isAny,
  getExternalLabelMid
} from '../help/utils';

export default function LabelEditingProvider(
  eventBus, canvas, directEditing,
  modeling, resizeHandles, textRenderer) {
  this._canvas = canvas;
  this._modeling = modeling;
  this._textRenderer = textRenderer;
  directEditing.registerProvider(this);

  // listen to dblclick on non-root elements
  eventBus.on('element.dblclick', function (event) {
    activateDirectEdit(event.element, true);
  });

  // complete on followup canvas operation
  eventBus.on([
    'element.mousedown',
    'drag.init',
    'canvas.viewbox.changing',
    'autoPlace',
    'popupMenu.open',
  ], function (event) {

    if (directEditing.isActive()) {
      directEditing.complete();
    }
  });

  // cancel on command stack changes
  eventBus.on(['commandStack.changed'], function (e) {
    if (directEditing.isActive()) {
      directEditing.cancel();
    }
  });


  eventBus.on('directEditing.activate', function (event) {
    resizeHandles.removeResizers();
  });

  eventBus.on('autoPlace.end', 500, function (event) {
    activateDirectEdit(event.shape);
  });

  function activateDirectEdit(element, force) {
    if (force ||
      isAny(element, ['fpb:Energy', 'fpb:Information', 'fpb:Product', 'fpb:ProcessOperator', 'fpb:TechnicalResource', 'fpb:SystemLimit'])) {
      directEditing.activate(element);
    }
  }

}
LabelEditingProvider.$inject = [
  'eventBus',
  'canvas',
  'directEditing',
  'modeling',
  'resizeHandles',
  'textRenderer'
];


LabelEditingProvider.prototype.activate = function (element) {
  // text
  var text = getLabel(element);
  if (text === undefined) {
    return;
  }
  var context = {
    text: text
  };
  // bounds
  var bounds = this.getEditingBBox(element);
  assign(context, bounds);
  var options = {};

  if (isAny(element, ['fpb:State', 'fpb:ProcessOperator', 'fpb:TechnicalResource', 'fpb:SystemLimit'])) {
    assign(options, {
      resizable: false,
      autoResize: true
    });
  }
  assign(context, {
    options: options
  });
  return context;
};


LabelEditingProvider.prototype.getEditingBBox = function (element) {
  // Größe der Textbox
  const defaultTextBoxSize = { x: 70, y: 30 };

  var canvas = this._canvas;

  var target = element.label || element;

  var bbox = canvas.getAbsoluteBBox(target);

  var mid = {
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2
  };

  // default position
  var bounds = { x: bbox.x, y: bbox.y };

  var zoom = canvas.zoom();

  var externalStyle = this._textRenderer.getExternalStyle();

  // take zoom into account
  var externalFontSize = externalStyle.fontSize * zoom,
    externalLineHeight = externalStyle.lineHeight;


  var style = {
    fontFamily: this._textRenderer.getDefaultStyle().fontFamily,
    fontWeight: this._textRenderer.getDefaultStyle().fontWeight
  };

  // Für TechnicalResource -> Label Box mittig unten.
  if (is(element, 'fpb:TechnicalResource')) {
    assign(bounds, {

      width: defaultTextBoxSize.x * zoom,
      height: defaultTextBoxSize.y * zoom,
      x: mid.x - (defaultTextBoxSize.x / 2) * zoom,
      y: bbox.y + bbox.height - (defaultTextBoxSize.y) * zoom
    });
    assign(style, {
      textAlign: 'center',
      fontSize: externalFontSize + 'px',
      lineHeight: externalLineHeight
    });
  }
  // Für SytemLimit -> Label Box oben rechts.
  if (is(element, 'fpb:SystemLimit')) {
    assign(bounds, {
      width: defaultTextBoxSize.x * zoom,
      height: defaultTextBoxSize.y * zoom,
      x: bbox.x + bbox.width - defaultTextBoxSize.x * zoom,
      y: bbox.y
    });
    assign(style, {
      textAlign: 'right',
      fontSize: externalFontSize + 'px',
      lineHeight: externalLineHeight
    });
  }
  // Für ProcessOperator -> Label Box unten rechts
  if (is(element, 'fpb:ProcessOperator')) {
    assign(bounds, {
      width: defaultTextBoxSize.x * zoom,
      height: defaultTextBoxSize.y * zoom,
      x: bbox.x + bbox.width - defaultTextBoxSize.x * zoom,
      y: bbox.y + bbox.height - defaultTextBoxSize.y * zoom
    });
    assign(style, {
      textAlign: 'right',
      fontSize: externalFontSize + 'px',
      lineHeight: externalLineHeight
    });
  }
  var width = 90 * zoom,
    paddingTop = 7 * zoom,
    paddingBottom = 4 * zoom;

  if (target.labelTarget) {
    assign(bounds, {
      width: width,
      height: bbox.height + paddingTop + paddingBottom,
      x: mid.x - width / 2,
      y: bbox.y - paddingTop
    });

    assign(style, {
      fontSize: externalFontSize + 'px',
      lineHeight: externalLineHeight,
      paddingTop: paddingTop + 'px',
      paddingBottom: paddingBottom + 'px'
    });
  }
  if (is(target, 'fpb:State') && !(target.label && target.label.labelTarget) && !(target && target.labelTarget)) {
    var externalLabelMid = getExternalLabelMid(element);
    var absoluteBBox = canvas.getAbsoluteBBox({
      x: externalLabelMid.x,
      y: externalLabelMid.y,
      width: 0,
      height: 0
    });
    var height = externalFontSize + paddingTop + paddingBottom;
    assign(bounds, {
      width: width,
      height: height,
      x: absoluteBBox.x - width / 2,
      y: absoluteBBox.y - height / 2
    });

    assign(style, {
      textAlign: 'left',
      fontSize: externalFontSize + 'px',
      lineHeight: externalLineHeight,
      paddingTop: paddingTop + 'px',
      paddingBottom: paddingBottom + 'px'
    });



  }
  return { bounds: bounds, style: style };
};


LabelEditingProvider.prototype.update = function (
  element, newLabel) {
  var newBounds;
  if (isEmptyText(newLabel)) {
    newLabel = null;
  };
  this._modeling.updateLabel(element, newLabel, newBounds);
};

// helpers //////////////////////

function isEmptyText(label) {
  return !label || !label.trim();
}