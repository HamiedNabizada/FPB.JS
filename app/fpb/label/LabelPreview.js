import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  remove as svgRemove
} from 'tiny-svg';

import {
  getBusinessObject,
  is,
  isAny
} from '../help/utils';

import {
  translate
} from 'diagram-js/lib/util/SvgTransformUtil';

var MARKER_HIDDEN = 'djs-element-hidden',
  MARKER_LABEL_HIDDEN = 'djs-label-hidden';


export default function LabelEditingPreview(
  eventBus, canvas, elementRegistry) {

  var self = this;

  var defaultLayer = canvas.getDefaultLayer();

  var element, absoluteElementBBox, gfx;

  eventBus.on('directEditing.activate', function (context) {
    var activeProvider = context.active;
    element = activeProvider.element.label || activeProvider.element;
    if (isAny(element, ['fpb:Product', 'fpb:Information', 'fpb:Energy', 'fpb:TechnicalResource', 'fpb:ProcessOperator', 'fpb:SystemLimit'])) {
      canvas.addMarker(element, MARKER_LABEL_HIDDEN);
    }
    else {
      canvas.addMarker(element, MARKER_HIDDEN);
    };
  });
 
  eventBus.on(['directEditing.complete', 'directEditing.cancel'], function (context) {
    var activeProvider = context.active;

    if (activeProvider) {
      canvas.removeMarker(activeProvider.element.label || activeProvider.element, MARKER_HIDDEN);
      canvas.removeMarker(element, MARKER_LABEL_HIDDEN);
    }

    element = undefined;
    absoluteElementBBox = undefined;

    if (gfx) {
      svgRemove(gfx);

      gfx = undefined;
    }
  });
}

LabelEditingPreview.$inject = [
  'eventBus',
  'canvas',
  'elementRegistry'
];