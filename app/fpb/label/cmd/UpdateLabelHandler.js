/**
 * Update Label Handler - Refactored
 * 
 * Handles label update operations with improved structure
 */
import {
  setLabel,
  getLabel,
  getExternalLabelMid,
  isLabelExternal,
  hasExternalLabel,
  isLabel,
  getBusinessObject,
  is
} from '../../help/utils';
import { isEmptyText } from '../utils/LabelUtils';

const NULL_DIMENSIONS = {
  width: 0,
  height: 0
};

export default function UpdateLabelHandler(modeling, textRenderer, eventBus, canvas) {
  this._modeling = modeling;
  this._textRenderer = textRenderer;
  this._eventBus = eventBus;
  this._canvas = canvas;
}

UpdateLabelHandler.$inject = [
  'modeling',
  'textRenderer',
  'eventBus',
  'canvas'
];

/**
 * Pre-execute: Create external label if needed
 */
UpdateLabelHandler.prototype.preExecute = function(ctx) {
  const { element, newLabel } = ctx;
  const businessObject = element.businessObject;

  // Create external label if element needs one and doesn't have it
  if (this._needsExternalLabel(element, newLabel)) {
    const labelCenter = this._calculateExternalLabelCenter(element);
    
    this._modeling.createLabel(element, labelCenter, {
      id: businessObject.id + '_label',
      businessObject: businessObject
    });
  }
};

/**
 * Execute: Set the new label text
 */
UpdateLabelHandler.prototype.execute = function(ctx) {
  ctx.oldLabel = getLabel(ctx.element);
  return this._setText(ctx.element, ctx.newLabel);
};

/**
 * Revert: Restore the old label text
 */
UpdateLabelHandler.prototype.revert = function(ctx) {
  return this._setText(ctx.element, ctx.oldLabel);
};

/**
 * Post-execute: Handle label removal, resize, and business object updates
 */
UpdateLabelHandler.prototype.postExecute = function(ctx) {
  const { element, newLabel, newBounds, hints = {} } = ctx;
  const label = element.label || element;

  // Remove empty labels
  if (isLabel(label) && isEmptyText(newLabel)) {
    if (hints.removeShape !== false) {
      this._modeling.removeShape(label, { unsetLabel: false });
    }
    return;
  }

  // Handle ProcessOperator-specific logic
  this._handleProcessOperatorUpdate(element);
  
  // Update business object identification
  this._updateBusinessObjectIdentification(element, ctx.newLabel);
  
  // Handle State element resizing
  if (is(element, 'fpb:State')) {
    this._handleStateElementResize(element, label, newBounds);
  }
};

/**
 * Set label text and return changed elements
 */
UpdateLabelHandler.prototype._setText = function(element, text) {
  const label = element.label || element;
  const labelTarget = element.labelTarget || element;
  
  setLabel(label, text, labelTarget !== label);
  return [label, labelTarget];
};

/**
 * Check if element needs external label creation
 */
UpdateLabelHandler.prototype._needsExternalLabel = function(element, newLabel) {
  return !isLabel(element) &&
         isLabelExternal(element) &&
         !hasExternalLabel(element) &&
         !isEmptyText(newLabel);
};

/**
 * Calculate external label center position
 */
UpdateLabelHandler.prototype._calculateExternalLabelCenter = function(element) {
  const paddingTop = 7;
  const labelCenter = getExternalLabelMid(element);
  
  return {
    x: labelCenter.x,
    y: labelCenter.y + paddingTop
  };
};

/**
 * Handle ProcessOperator-specific updates
 */
UpdateLabelHandler.prototype._handleProcessOperatorUpdate = function(element) {
  if (is(element, 'fpb:ProcessOperator') && element.businessObject.decomposedView) {
    // Trigger LayerPanel re-render
    this._eventBus.fire('layerPanel.processSwitched', {
      selectedProcess: this._canvas.getRootElement()
    });
  }
};

/**
 * Update business object identification
 */
UpdateLabelHandler.prototype._updateBusinessObjectIdentification = function(element, newLabel) {
  if (element.businessObject.identification) {
    element.businessObject.identification.shortName = newLabel;
  }
};

/**
 * Handle State element label resizing
 */
UpdateLabelHandler.prototype._handleStateElementResize = function(element, label, newBounds) {
  const businessObject = getBusinessObject(label);
  const text = businessObject.name;
  
  // Don't resize without text
  if (!text) {
    return;
  }
  
  // Calculate new bounds if not provided
  let calculatedBounds = newBounds;
  if (typeof newBounds === 'undefined') {
    calculatedBounds = this._textRenderer.getExternalLabelBounds(label, text);
  }
  
  // Resize label if bounds are available
  // Setting newBounds to false or null disables resize operation
  if (calculatedBounds) {
    this._modeling.resizeShape(label, calculatedBounds, NULL_DIMENSIONS);
  }
};