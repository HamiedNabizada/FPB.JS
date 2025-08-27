/**
 * State Shape Renderer (Product, Energy, Information)
 * 
 * Handles rendering of FPB state elements: Product (circle), Energy (diamond), Information (hexagon)
 */
import { BaseShapeRenderer } from './BaseShapeRenderer';
import { attr as svgAttr } from 'tiny-svg';
import { COLORS } from '../FpbConstants';

export class StateShapeRenderer extends BaseShapeRenderer {
  
  /**
   * Renders an FPB Product (circle)
   */
  drawProduct(parentGfx, element) {
    const { width, height } = element;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.round((width + height) / 4);

    const circle = this.renderShape(parentGfx, element, 'circle', {
      fill: COLORS.FPB_PRODUCT
    });

    svgAttr(circle, { cx, cy, r: radius });
    return circle;
  }

  /**
   * Renders an FPB Energy (diamond)
   */
  drawEnergy(parentGfx, element) {
    const { width, height } = element;
    const points = [
      width / 2, 0,      // top
      width, height / 2,  // right
      width / 2, height, // bottom
      0, height / 2      // left
    ];

    const polygon = this.renderShape(parentGfx, element, 'polygon', {
      fill: COLORS.FPB_ENERGY
    });

    svgAttr(polygon, { points });
    return polygon;
  }

  /**
   * Renders an FPB Information (hexagon)
   */
  drawInformation(parentGfx, element) {
    const { width, height } = element;
    const points = [
      0, 0.5 * height,           // left middle
      0.25 * width, 0.02 * height, // top left
      0.75 * width, 0.02 * height, // top right  
      width, 0.5 * height,       // right middle
      0.75 * width, 0.98 * height, // bottom right
      0.25 * width, 0.98 * height  // bottom left
    ];

    const polygon = this.renderShape(parentGfx, element, 'polygon', {
      fill: COLORS.FPB_INFORMATION
    });

    svgAttr(polygon, { points });
    return polygon;
  }
}