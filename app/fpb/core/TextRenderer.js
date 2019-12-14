import { assign } from 'min-dash';
import { isLabel } from '../help/utils';

import TextUtil from 'diagram-js/lib/util/Text';

var DEFAULT_FONT_SIZE = 15;
var LINE_HEIGHT_RATIO = 1.2;


export default function TextRenderer(config) {

  var defaultStyle = assign({
    fontFamily: 'Arial, sans-serif',
    fontSize: DEFAULT_FONT_SIZE,
    fontWeight: 'normal',
    lineHeight: LINE_HEIGHT_RATIO
  }, config && config.defaultStyle || {});

  var fontSize = parseInt(defaultStyle.fontSize, 10) - 1;
  var externalStyle = assign({}, defaultStyle, {
    fontSize: fontSize
  }, config && config.externalStyle || {});

  var textUtil = new TextUtil({
    style: defaultStyle
  });

  /**
   * Get the new bounds of an externally rendered,
   * layouted label.
   *
   * @param  {Bounds} bounds
   * @param  {String} text
   *
   * @return {Bounds}
   */
  this.getExternalLabelBounds = function (bounds, text) {
    let targetElement;
    if(isLabel(bounds)){
      targetElement = bounds.labelTarget;
    }
    var layoutedDimensions = textUtil.getDimensions(text, {
      box: {
        width: 90,
        height: 30,
        x: bounds.width / 2 + bounds.x,
        y: bounds.height / 2 + bounds.y
      },

      style: externalStyle
    });
    // resize label shape to fit label text
    return {
      x: Math.round(targetElement.x - layoutedDimensions.width),
      y: Math.round(targetElement.y -  layoutedDimensions.height),
      width: Math.ceil(layoutedDimensions.width),
      height: Math.ceil(layoutedDimensions.height)
    };
  };
  this.getInternalLabelPadding = function (element, text) {

    var layoutedDimensions = textUtil.getDimensions(text, {
      box: {
        width: element.width,
        height: element.height,
        x: element.x,
        y: element.y
      },
      style: defaultStyle
    });
    return Math.ceil(layoutedDimensions.height);
  }


  /**
   * Create a layouted text element.
   *
   * @param {String} text
   * @param {Object} [options]
   *
   * @return {SVGElement} rendered text
   */
  this.createText = function (text, options) {
    return textUtil.createText(text, options || {});
  };

  /**
   * Get default text style.
   */
  this.getDefaultStyle = function () {
    return defaultStyle;
  };

  /**
   * Get the external text style.
   */
  this.getExternalStyle = function () {
    return externalStyle;
  };

}

TextRenderer.$inject = [
  'config.textRenderer'
];