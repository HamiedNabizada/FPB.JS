/**
 * Text Renderer - Refactored
 * 
 * Modernized text rendering with improved modularity and error handling
 */
import TextUtil from 'diagram-js/lib/util/Text';
import { StyleManager } from './text/StyleManager';
import { DimensionCalculator } from './text/DimensionCalculator';

export default function TextRenderer(config) {
  // Initialize components
  this.styleManager = new StyleManager(config);
  this.textUtil = new TextUtil({
    style: this.styleManager.getDefaultStyle()
  });
  this.dimensionCalculator = new DimensionCalculator(this.textUtil, this.styleManager);

  /**
   * Get the new bounds of an externally rendered, layouted label.
   * 
   * @param {Bounds} bounds - The bounds object
   * @param {String} text - The text content
   * @return {Bounds} Calculated bounds for external label
   */
  this.getExternalLabelBounds = function(bounds, text) {
    return this.dimensionCalculator.calculateExternalLabelBounds(bounds, text);
  };

  /**
   * Calculate internal label padding based on text dimensions.
   * 
   * @param {Object} element - The element containing the label
   * @param {String} text - The text content
   * @return {Number} Calculated padding height
   */
  this.getInternalLabelPadding = function(element, text) {
    return this.dimensionCalculator.calculateInternalLabelPadding(element, text);
  };

  /**
   * Create a layouted text element.
   * 
   * @param {String} text - The text content
   * @param {Object} [options] - Text rendering options
   * @return {SVGElement} Rendered text element
   */
  this.createText = function(text, options = {}) {
    try {
      return this.textUtil.createText(text, options);
    } catch (error) {
      console.error('TextRenderer: Error creating text element:', error);
      // Return empty text element as fallback
      return this.textUtil.createText('', options);
    }
  };

  /**
   * Get default text style.
   * 
   * @return {Object} Default style configuration
   */
  this.getDefaultStyle = function() {
    return this.styleManager.getDefaultStyle();
  };

  /**
   * Get the external text style.
   * 
   * @return {Object} External style configuration
   */
  this.getExternalStyle = function() {
    return this.styleManager.getExternalStyle();
  };

  /**
   * Update text renderer configuration.
   * 
   * @param {Object} newConfig - New configuration to merge
   */
  this.updateConfig = function(newConfig) {
    this.styleManager.updateConfig(newConfig);
    
    // Reinitialize TextUtil with updated style
    this.textUtil = new TextUtil({
      style: this.styleManager.getDefaultStyle()
    });
    
    // Update dimension calculator reference
    this.dimensionCalculator = new DimensionCalculator(this.textUtil, this.styleManager);
  };

  /**
   * Validate text content and element parameters.
   * 
   * @param {String} text - Text to validate
   * @param {Object} element - Element to validate  
   * @return {Boolean} True if valid
   */
  this.validateParameters = function(text, element) {
    if (typeof text !== 'string') {
      console.warn('TextRenderer: Text parameter should be a string, got:', typeof text);
      return false;
    }
    
    if (element && (!element.width || !element.height)) {
      console.warn('TextRenderer: Element should have width and height properties');
      return false;
    }
    
    return true;
  };
}

TextRenderer.$inject = [
  'config.textRenderer'
];