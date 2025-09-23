/**
 * Process Shape Renderer (ProcessOperator, TechnicalResource, SystemLimit)
 * 
 * Handles rendering of FPB process elements
 */
import { BaseShapeRenderer } from './BaseShapeRenderer';
import { attr as svgAttr, append as svgAppend, create as svgCreate } from 'tiny-svg';
import { COLORS, DASH_PATTERNS, STROKE_WIDTHS } from '../FpbConstants';

export class ProcessShapeRenderer extends BaseShapeRenderer {
  
  /**
   * Renders an FPB ProcessOperator (rectangle)
   */
  drawProcessOperator(parentGfx, element) {
    const { width, height } = element;

    const rect = this.renderShape(parentGfx, element, 'rect', {
      fill: COLORS.FPB_PROCESS_OPERATOR
    });

    svgAttr(rect, {
      width: width,
      height: height,
      x: 0,
      y: 0,
      rx: 0,
      ry: 0
    });

    this.renderEmbeddedLabel(parentGfx, element, 'right-top');
    return rect;
  }

  /**
   * Renders an FPB TechnicalResource (rounded rectangle)
   */
  drawTechnicalResource(parentGfx, element) {
    const { width, height } = element;
    const rx = width / 5;
    const ry = height / 2;

    const rect = this.renderShape(parentGfx, element, 'rect', {
      fill: COLORS.FPB_TECHNICAL_RESOURCE
    });

    svgAttr(rect, {
      width: width,
      height: height,
      x: 0,
      y: 0,
      rx: rx,
      ry: ry
    });

    this.renderEmbeddedLabel(parentGfx, element, 'center-top');
    return rect;
  }

  /**
   * Renders an FPB SystemLimit (dashed rectangle) - like Flows without computeStyle
   */
  drawSystemLimit(parentGfx, element) {
    const { width, height } = element;

    // Create rect directly like createLine does for flows
    const rect = svgCreate('rect');

    // Set attributes directly without computeStyle (like flows)
    svgAttr(rect, {
      width: width,
      height: height,
      x: 0,
      y: 0,
      rx: 0,
      ry: 0,
      fill: 'none',
      stroke: COLORS.FPB_STROKE,
      strokeWidth: STROKE_WIDTHS.DEFAULT,
      'stroke-dasharray': DASH_PATTERNS.SYSTEM_LIMIT  // Use kebab-case for SVG attributes
    });

    svgAppend(parentGfx, rect);

    this.renderEmbeddedLabel(parentGfx, element, 'right-top');
    return rect;
  }
}