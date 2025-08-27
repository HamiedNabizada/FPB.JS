/**
 * Bounds Calculator
 * 
 * Handles calculation of text editing bounds for different element types
 */
import { assign } from 'min-dash';
import { is } from '../../help/utils';
import { getExternalLabelMid } from '../../help/utils';
import { LABEL_CONFIG } from '../constants/LabelConstants';
import {
  calculatePositionedBounds,
  createTextAlignmentStyle,
  createExternalLabelStyle,
  getElementMid,
  scaleByZoom
} from '../utils/LabelUtils';

export class BoundsCalculator {
  constructor(canvas, textRenderer) {
    this.canvas = canvas;
    this.textRenderer = textRenderer;
  }

  /**
   * Calculate editing bounds for an element
   */
  calculateEditingBBox(element) {
    const target = element.label || element;
    const bbox = this.canvas.getAbsoluteBBox(target);
    const zoom = this.canvas.zoom();
    
    const externalStyle = this.textRenderer.getExternalStyle();
    const defaultStyle = this.textRenderer.getDefaultStyle();
    
    const externalFontSize = externalStyle.fontSize * zoom;
    const externalLineHeight = externalStyle.lineHeight;
    
    const baseStyle = {
      fontFamily: defaultStyle.fontFamily,
      fontWeight: defaultStyle.fontWeight
    };

    // Handle different element types
    if (is(element, 'fpb:TechnicalResource')) {
      return this._calculateTechnicalResourceBounds(bbox, zoom, externalFontSize, externalLineHeight, baseStyle);
    }
    
    if (is(element, 'fpb:SystemLimit')) {
      return this._calculateSystemLimitBounds(bbox, zoom, externalFontSize, externalLineHeight, baseStyle);
    }
    
    if (is(element, 'fpb:ProcessOperator')) {
      return this._calculateProcessOperatorBounds(bbox, zoom, externalFontSize, externalLineHeight, baseStyle);
    }
    
    // Handle external labels
    if (target.labelTarget) {
      return this._calculateExternalLabelBounds(bbox, zoom, externalFontSize, externalLineHeight, baseStyle);
    }
    
    // Handle state elements
    if (is(target, 'fpb:State') && !this._hasExternalLabel(target)) {
      return this._calculateStateBounds(element, bbox, zoom, externalFontSize, externalLineHeight, baseStyle);
    }
    
    // Default bounds
    return this._getDefaultBounds(bbox, baseStyle);
  }

  /**
   * Calculate bounds for TechnicalResource (center-bottom)
   */
  _calculateTechnicalResourceBounds(bbox, zoom, fontSize, lineHeight, baseStyle) {
    const bounds = calculatePositionedBounds(
      bbox,
      LABEL_CONFIG.DEFAULT_TEXT_BOX,
      'bottom',
      'center', 
      zoom
    );
    
    const style = assign(
      {},
      baseStyle,
      createTextAlignmentStyle('center', fontSize, lineHeight)
    );
    
    return { bounds, style };
  }

  /**
   * Calculate bounds for SystemLimit (top-right)
   */
  _calculateSystemLimitBounds(bbox, zoom, fontSize, lineHeight, baseStyle) {
    const bounds = calculatePositionedBounds(
      bbox,
      LABEL_CONFIG.DEFAULT_TEXT_BOX,
      'top',
      'right',
      zoom
    );
    
    const style = assign(
      {},
      baseStyle,
      createTextAlignmentStyle('right', fontSize, lineHeight)
    );
    
    return { bounds, style };
  }

  /**
   * Calculate bounds for ProcessOperator (bottom-right)
   */
  _calculateProcessOperatorBounds(bbox, zoom, fontSize, lineHeight, baseStyle) {
    const bounds = calculatePositionedBounds(
      bbox,
      LABEL_CONFIG.DEFAULT_TEXT_BOX,
      'bottom',
      'right',
      zoom
    );
    
    const style = assign(
      {},
      baseStyle,
      createTextAlignmentStyle('right', fontSize, lineHeight)
    );
    
    return { bounds, style };
  }

  /**
   * Calculate bounds for external labels
   */
  _calculateExternalLabelBounds(bbox, zoom, fontSize, lineHeight, baseStyle) {
    const mid = getElementMid(bbox);
    const width = scaleByZoom(LABEL_CONFIG.EXTERNAL_LABEL.width, zoom);
    const paddingTop = scaleByZoom(LABEL_CONFIG.EXTERNAL_LABEL.paddingTop, zoom);
    const paddingBottom = scaleByZoom(LABEL_CONFIG.EXTERNAL_LABEL.paddingBottom, zoom);
    
    const bounds = {
      width: width,
      height: bbox.height + paddingTop + paddingBottom,
      x: mid.x - width / 2,
      y: bbox.y - paddingTop
    };
    
    const style = assign(
      {},
      baseStyle,
      createExternalLabelStyle(fontSize, lineHeight, paddingTop, paddingBottom)
    );
    
    return { bounds, style };
  }

  /**
   * Calculate bounds for State elements
   */
  _calculateStateBounds(element, bbox, zoom, fontSize, lineHeight, baseStyle) {
    const externalLabelMid = getExternalLabelMid(element);
    const absoluteBBox = this.canvas.getAbsoluteBBox({
      x: externalLabelMid.x,
      y: externalLabelMid.y,
      width: 0,
      height: 0
    });
    
    const width = scaleByZoom(LABEL_CONFIG.EXTERNAL_LABEL.width, zoom);
    const paddingTop = scaleByZoom(LABEL_CONFIG.EXTERNAL_LABEL.paddingTop, zoom);
    const paddingBottom = scaleByZoom(LABEL_CONFIG.EXTERNAL_LABEL.paddingBottom, zoom);
    const height = fontSize + paddingTop + paddingBottom;
    
    const bounds = {
      width: width,
      height: height,
      x: absoluteBBox.x - width / 2,
      y: absoluteBBox.y - height / 2
    };
    
    const style = assign(
      {},
      baseStyle,
      createTextAlignmentStyle('left', fontSize, lineHeight),
      createExternalLabelStyle(fontSize, lineHeight, paddingTop, paddingBottom)
    );
    
    return { bounds, style };
  }

  /**
   * Get default bounds as fallback
   */
  _getDefaultBounds(bbox, baseStyle) {
    const bounds = { 
      x: bbox.x, 
      y: bbox.y,
      width: bbox.width,
      height: bbox.height
    };
    const style = baseStyle;
    return { bounds, style };
  }

  /**
   * Check if target has external label
   */
  _hasExternalLabel(target) {
    return (target.label && target.label.labelTarget) || (target && target.labelTarget);
  }
}