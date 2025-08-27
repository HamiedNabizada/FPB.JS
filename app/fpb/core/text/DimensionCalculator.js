/**
 * Text Dimension Calculator
 * 
 * Handles text dimension calculations and label positioning
 */
import { TEXT_CONFIG } from './TextConstants';

export class DimensionCalculator {
  constructor(textUtil, styleManager) {
    this.textUtil = textUtil;
    this.styleManager = styleManager;
  }

  /**
   * Calculate external label bounds
   */
  calculateExternalLabelBounds(bounds, text) {
    if (!text || !bounds) {
      console.warn('DimensionCalculator: Missing text or bounds for external label calculation');
      return this._getDefaultBounds(bounds);
    }

    const targetElement = this._getTargetElement(bounds);
    if (!targetElement) {
      console.warn('DimensionCalculator: No target element found for label bounds calculation');
      return this._getDefaultBounds(bounds);
    }

    try {
      const layoutedDimensions = this._calculateTextDimensions(text, {
        box: this._createLabelBox(bounds),
        style: this.styleManager.getExternalStyle()
      });

      return this._createBoundsFromDimensions(targetElement, layoutedDimensions);
    } catch (error) {
      console.error('DimensionCalculator: Error calculating external label bounds:', error);
      return this._getDefaultBounds(bounds);
    }
  }

  /**
   * Calculate internal label padding
   */
  calculateInternalLabelPadding(element, text) {
    if (!text || !element) {
      return 0;
    }

    try {
      const layoutedDimensions = this._calculateTextDimensions(text, {
        box: {
          width: element.width,
          height: element.height,
          x: element.x || 0,
          y: element.y || 0
        },
        style: this.styleManager.getDefaultStyle()
      });

      return Math.ceil(layoutedDimensions.height);
    } catch (error) {
      console.error('DimensionCalculator: Error calculating internal label padding:', error);
      return TEXT_CONFIG.DEFAULT_STYLE.fontSize; // Fallback
    }
  }

  /**
   * Calculate text dimensions using TextUtil
   */
  _calculateTextDimensions(text, options) {
    return this.textUtil.getDimensions(text, options);
  }

  /**
   * Get target element for label positioning
   */
  _getTargetElement(bounds) {
    // Assuming isLabel utility function exists
    if (bounds && typeof bounds === 'object' && bounds.labelTarget) {
      return bounds.labelTarget;
    }
    return bounds;
  }

  /**
   * Create label box for dimension calculation
   */
  _createLabelBox(bounds) {
    return {
      width: TEXT_CONFIG.DEFAULT_LABEL_BOX.width,
      height: TEXT_CONFIG.DEFAULT_LABEL_BOX.height,
      x: (bounds.width / 2) + (bounds.x || 0),
      y: (bounds.height / 2) + (bounds.y || 0)
    };
  }

  /**
   * Create bounds object from calculated dimensions
   */
  _createBoundsFromDimensions(targetElement, dimensions) {
    return {
      x: Math.round(targetElement.x - dimensions.width),
      y: Math.round(targetElement.y - dimensions.height),
      width: Math.ceil(dimensions.width),
      height: Math.ceil(dimensions.height)
    };
  }

  /**
   * Get default bounds as fallback
   */
  _getDefaultBounds(bounds) {
    return {
      x: bounds?.x || 0,
      y: bounds?.y || 0,
      width: TEXT_CONFIG.DEFAULT_LABEL_BOX.width,
      height: TEXT_CONFIG.DEFAULT_LABEL_BOX.height
    };
  }
}