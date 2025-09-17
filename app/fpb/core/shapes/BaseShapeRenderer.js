/**
 * Base Shape Renderer
 * 
 * Abstract base class for all FPB shape renderers
 */
import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  classes as svgClasses
} from 'tiny-svg';
import { assign } from 'min-dash';
import { COLORS, STROKE_WIDTHS, LABEL_CONFIG } from '../FpbConstants';

export class BaseShapeRenderer {
  constructor(styles, textRenderer) {
    this.styles = styles;
    this.textRenderer = textRenderer;
  }

  /**
   * Renders a shape with the given SVG element type and attributes
   */
  renderShape(parentGfx, element, svgElementType, specificAttrs = {}) {
    const defaultAttrs = {
      stroke: COLORS.FPB_STROKE,
      strokeWidth: STROKE_WIDTHS.DEFAULT
    };
    
    const attrs = this.styles.computeStyle(assign(defaultAttrs, specificAttrs));
    const shape = svgCreate(svgElementType);
    
    svgAttr(shape, attrs);
    svgAppend(parentGfx, shape);
    
    return shape;
  }

  /**
   * Renders embedded labels for shapes
   */
  renderEmbeddedLabel(parentGfx, element, align = 'center-middle') {
    const semantic = element.businessObject;
    if (!semantic.name) {
      return;
    }

    const box = {
      width: element.width,
      height: element.height
    };

    let padding = LABEL_CONFIG.padding.default;

    // Special padding calculation for ProcessOperator and TechnicalResource
    if (element.type === 'fpb:ProcessOperator' || element.type === 'fpb:TechnicalResource') {
      const config = LABEL_CONFIG.padding.processOperator;
      const topPadding = typeof config.top === 'function' 
        ? config.top(element, semantic.name)
        : config.top;
        
      padding = {
        top: element.height - topPadding,
        bottom: config.bottom,
        left: config.left,
        right: config.right
      };
    }

    return this.renderLabel(parentGfx, semantic.name, {
      box: box,
      align: align,
      padding: padding,
      style: {
        fill: COLORS.FPB_STROKE
      }
    });
  }

  /**
   * Renders a text label
   */
  renderLabel(parentGfx, text, options) {
    const defaultOptions = {
      size: {
        width: LABEL_CONFIG.defaultWidth
      }
    };
    
    const mergedOptions = assign(defaultOptions, options);
    const textElement = this.textRenderer.createText(text || '', mergedOptions);

    svgClasses(textElement).add('djs-label');
    svgAppend(parentGfx, textElement);
    
    return textElement;
  }
}