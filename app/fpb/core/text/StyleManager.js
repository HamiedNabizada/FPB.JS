/**
 * Text Style Manager
 * 
 * Manages text styling configuration and style calculations
 */
import { assign } from 'min-dash';
import { TEXT_CONFIG } from './TextConstants';

export class StyleManager {
  constructor(config = {}) {
    this.config = config;
    this._initializeStyles();
  }

  /**
   * Initialize default and external styles
   */
  _initializeStyles() {
    // Default style for internal labels
    this.defaultStyle = assign(
      {},
      TEXT_CONFIG.DEFAULT_STYLE,
      this.config.defaultStyle || {}
    );

    // External style for external labels (slightly smaller font)
    const externalFontSize = parseInt(this.defaultStyle.fontSize, 10) + TEXT_CONFIG.EXTERNAL_FONT_SIZE_OFFSET;
    this.externalStyle = assign(
      {},
      this.defaultStyle,
      { fontSize: externalFontSize },
      this.config.externalStyle || {}
    );
  }

  /**
   * Get default text style
   */
  getDefaultStyle() {
    return { ...this.defaultStyle };
  }

  /**
   * Get external text style  
   */
  getExternalStyle() {
    return { ...this.externalStyle };
  }

  /**
   * Merge custom styles with defaults
   */
  mergeWithDefaultStyle(customStyle = {}) {
    return assign({}, this.defaultStyle, customStyle);
  }

  /**
   * Merge custom styles with external defaults
   */
  mergeWithExternalStyle(customStyle = {}) {
    return assign({}, this.externalStyle, customStyle);
  }

  /**
   * Update configuration and reinitialize styles
   */
  updateConfig(newConfig) {
    this.config = assign({}, this.config, newConfig);
    this._initializeStyles();
  }
}