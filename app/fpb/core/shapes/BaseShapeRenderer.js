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
import { COLORS, STROKE_WIDTHS, LABEL_CONFIG, LABEL_LIMITS } from '../FpbConstants';

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
   * Renders embedded labels for shapes, with truncation and tooltip
   */
  renderEmbeddedLabel(parentGfx, element, align = 'center-middle') {
    const semantic = element.businessObject;
    if (!semantic.name || !semantic.name.trim()) {
      return;
    }

    let displayText = semantic.name;
    let wasTruncated = false;

    // Truncate text if element type has a line limit
    const maxLines = this._getMaxLines(element.type);
    if (maxLines) {
      const result = this._truncateText(displayText, element.width, maxLines);
      displayText = result.text;
      wasTruncated = result.truncated;
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
        ? config.top(element, displayText)
        : config.top;

      padding = {
        top: element.height - topPadding,
        bottom: config.bottom,
        left: config.left,
        right: config.right
      };
    }

    const textElement = this.renderLabel(parentGfx, displayText, {
      box: box,
      align: align,
      padding: padding,
      style: {
        fill: COLORS.FPB_STROKE
      }
    });

    this._setTooltip(element, semantic, wasTruncated);

    return textElement;
  }

  /**
   * Returns the max line count for a given element type, or null for no limit
   */
  _getMaxLines(elementType) {
    switch (elementType) {
    case 'fpb:ProcessOperator': return LABEL_LIMITS.PROCESS_OPERATOR.maxLines;
    case 'fpb:TechnicalResource': return LABEL_LIMITS.TECHNICAL_RESOURCE.maxLines;
    case 'fpb:SystemLimit': return LABEL_LIMITS.SYSTEM_LIMIT.maxLines;
    default: return null;
    }
  }

  /**
   * Truncates text to fit within maxLines using the TextUtil layout engine.
   * Returns { text, truncated } where truncated indicates if text was shortened.
   */
  _truncateText(text, boxWidth, maxLines) {
    const layout = this.textRenderer.textUtil.layoutText(text, {
      box: { width: boxWidth, height: 1000 }
    });

    const tspans = layout.element.querySelectorAll('tspan');
    if (tspans.length <= maxLines) {
      return { text: text, truncated: false };
    }

    // Build truncated text from the first maxLines lines
    let truncatedText = '';
    for (let i = 0; i < maxLines; i++) {
      if (i > 0) truncatedText += ' ';
      truncatedText += tspans[i].textContent;
    }
    truncatedText = truncatedText.trimEnd() + '\u2026';

    return { text: truncatedText, truncated: true };
  }

  /**
   * Stores tooltip text on the element for the hover tooltip system
   */
  _setTooltip(element, semantic, wasTruncated) {
    const longName = semantic.identification?.longName;

    if (longName && wasTruncated) {
      element._tooltipText = semantic.name + '\n' + longName;
    } else if (longName) {
      element._tooltipText = longName;
    } else if (wasTruncated) {
      element._tooltipText = semantic.name;
    } else {
      element._tooltipText = null;
    }
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