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
  is,
  isAny
} from '../../help/utils';
import { isEmptyText } from '../utils/LabelUtils';
import { getSystemLimit } from '../../help/helpUtils';
import { stateCopies } from '../../help/processShapes';

const NULL_DIMENSIONS = {
  width: 0,
  height: 0
};

/**
 * Write a value that postExecute puts straight into the model (no command of its
 * own) and remember it on the context, so revert can take it back and a redo can
 * apply it again. Without this, undo left renamed states on other layers and the
 * identification of the renamed element on the new name.
 */
function trackedWrite(ctx, target, key, value) {
  if (!target) {
    return;
  }
  ctx.directWrites = ctx.directWrites || [];
  ctx.directWrites.push({ target, key, oldValue: target[key], newValue: value });
  target[key] = value;
}

export default function UpdateLabelHandler(modeling, textRenderer, eventBus, canvas, fpbjs) {
  this._modeling = modeling;
  this._textRenderer = textRenderer;
  this._eventBus = eventBus;
  this._canvas = canvas;
  this._fpbjs = fpbjs;
}

UpdateLabelHandler.$inject = [
  'modeling',
  'textRenderer',
  'eventBus',
  'canvas',
  'fpbjs'
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

  // On redo postExecute does not run again, so re-apply its direct writes.
  (ctx.directWrites || []).forEach((write) => {
    write.target[write.key] = write.newValue;
  });

  return this._setText(ctx.element, ctx.newLabel);
};

/**
 * Revert: Restore the old label text
 */
UpdateLabelHandler.prototype.revert = function(ctx) {
  const changed = this._setText(ctx.element, ctx.oldLabel);

  const writes = ctx.directWrites || [];
  for (let i = writes.length - 1; i >= 0; i--) {
    writes[i].target[writes[i].key] = writes[i].oldValue;
  }

  return changed;
};

/**
 * Post-execute: Handle label removal, resize, and business object updates
 */
UpdateLabelHandler.prototype.postExecute = function(ctx) {
  const { element, newLabel, newBounds, hints = {} } = ctx;
  const label = element.label || element;
  // The state, also when its label was edited on the canvas; removing an
  // empty label below unsets the label's labelTarget
  ctx.labelTarget = element.labelTarget || element;

  // Remove empty labels
  if (isLabel(label) && isEmptyText(newLabel)) {
    if (hints.removeShape !== false) {
      this._modeling.removeShape(label, { unsetLabel: false });
    }
    // A cleared name is a name like any other: the short name goes with it,
    // as it does for an operator, whose name is no shape of its own, and so
    // do the copies on other layers (B16)
    this._updateBusinessObjectIdentification(element, newLabel, ctx);
    if (isAny(ctx.labelTarget, ['fpb:Product', 'fpb:Energy', 'fpb:Information'])) {
      this._handleStateNameSync(ctx.labelTarget, newLabel, ctx);
    }
    return;
  }

  // Handle ProcessOperator-specific logic
  this._handleProcessOperatorUpdate(element, ctx);

  // Update business object identification
  this._updateBusinessObjectIdentification(element, ctx.newLabel, ctx);

  // Handle State element resizing
  if (is(element, 'fpb:State')) {
    this._handleStateElementResize(element, label, newBounds);
  }

  // Scenario 7 & 8: Bidirectional state name synchronization
  if (isAny(ctx.labelTarget, ['fpb:Product', 'fpb:Energy', 'fpb:Information'])) {
    this._handleStateNameSync(ctx.labelTarget, newLabel, ctx);
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
UpdateLabelHandler.prototype._handleProcessOperatorUpdate = function(element, ctx) {
  if (is(element, 'fpb:ProcessOperator') && element.businessObject.decomposedView) {
    this._syncSystemLimitName(element, ctx);

    // Trigger LayerPanel re-render
    this._eventBus.fire('layerPanel.processSwitched', {
      selectedProcess: this._canvas.getRootElement()
    });
  }
};

/**
 * Scenario 10: the system limit of the decomposition carries the name of the
 * operator it belongs to, so it follows a rename.
 *
 * Only while it still carries the generated name though. A system limit the
 * user named himself keeps that name, the same consideration that keeps
 * DecomposeProcessOperator from overwriting an existing name.
 */
UpdateLabelHandler.prototype._syncSystemLimitName = function(element, ctx) {
  const childProcess = element.businessObject.decomposedView;
  const container = childProcess.businessObject && childProcess.businessObject.elementsContainer;

  if (!container) {
    return;
  }

  const systemLimit = getSystemLimit(container);
  const generatedName = (operatorName) => 'SL_' + (operatorName || '');

  if (!systemLimit || systemLimit.businessObject.name !== generatedName(ctx.oldLabel)) {
    return;
  }

  trackedWrite(ctx, systemLimit.businessObject, 'name', generatedName(ctx.newLabel));

  if (systemLimit.businessObject.identification) {
    trackedWrite(ctx, systemLimit.businessObject.identification, 'shortName', generatedName(ctx.newLabel));
  }
};

/**
 * Update business object identification
 */
UpdateLabelHandler.prototype._updateBusinessObjectIdentification = function(element, newLabel, ctx) {
  if (element.businessObject.identification) {
    trackedWrite(ctx, element.businessObject.identification, 'shortName', newLabel);
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

/**
 * Scenario 7 & 8: a state renamed on one layer is renamed on every layer it
 * shows on. It used to reach only the layer right below (through the
 * operators the state flows to) or right above (from a boundary state), so a
 * name changed two layers down stayed there (B14). All copies share the id
 * of the state (help/processShapes.stateCopies), so `element` must be the
 * state, not its label.
 *
 * A copy an older file left with another name keeps it, as copies with other
 * data do in StateCopySyncBehavior: overwriting it would lose it, aligning
 * such copies is the user's choice (B16, decided 2026-10-19).
 */
UpdateLabelHandler.prototype._handleStateNameSync = function(element, newLabel, ctx) {
  const before = ctx.oldLabel || '';
  stateCopies(this._fpbjs.getProjectDefinition(), element).forEach((copy) => {
    if ((copy.businessObject.name || '') !== before) {
      return;
    }
    trackedWrite(ctx, copy.businessObject, 'name', newLabel);
    if (copy.businessObject.identification) {
      trackedWrite(ctx, copy.businessObject.identification, 'shortName', newLabel);
    }
  });
};