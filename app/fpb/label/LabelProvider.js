/**
 * Label Editing Provider - Refactored
 * 
 * Modernized label editing with improved modularity and better separation of concerns
 */
import { assign } from 'min-dash';
import { getLabel, isAny } from '../help/utils';
import { BoundsCalculator } from './positioning/BoundsCalculator';
import { LABEL_EVENTS, EDITING_OPTIONS } from './constants/LabelConstants';
import { isEmptyText } from './utils/LabelUtils';

export default function LabelEditingProvider(
  eventBus, canvas, directEditing, modeling, resizeHandles, textRenderer
) {
  // Store dependencies
  this._canvas = canvas;
  this._modeling = modeling;
  this._textRenderer = textRenderer;
  this._directEditing = directEditing;
  
  // Initialize bounds calculator
  this._boundsCalculator = new BoundsCalculator(canvas, textRenderer);
  
  // Register this provider
  directEditing.registerProvider(this);
  
  // Set up event listeners
  this._setupEventListeners(eventBus, directEditing, resizeHandles);
}

LabelEditingProvider.$inject = [
  'eventBus',
  'canvas', 
  'directEditing',
  'modeling',
  'resizeHandles',
  'textRenderer'
];

/**
 * Set up all event listeners for label editing
 */
LabelEditingProvider.prototype._setupEventListeners = function(eventBus, directEditing, resizeHandles) {
  // Double-click activation
  eventBus.on(LABEL_EVENTS.ELEMENT_DBLCLICK, (event) => {
    this._activateDirectEdit(event.element, true);
  });

  // Complete editing on various canvas operations
  eventBus.on([
    LABEL_EVENTS.ELEMENT_MOUSEDOWN,
    LABEL_EVENTS.DRAG_INIT,
    LABEL_EVENTS.CANVAS_VIEWBOX_CHANGING,
    LABEL_EVENTS.AUTO_PLACE,
    LABEL_EVENTS.POPUP_MENU_OPEN
  ], () => {
    if (directEditing.isActive()) {
      directEditing.complete();
    }
  });

  // Cancel on command stack changes
  eventBus.on(LABEL_EVENTS.COMMAND_STACK_CHANGED, () => {
    if (directEditing.isActive()) {
      directEditing.cancel();
    }
  });

  // Remove resize handles when editing starts
  eventBus.on(LABEL_EVENTS.ACTIVATE, () => {
    resizeHandles.removeResizers();
  });

  // Auto-activate after auto-placement
  eventBus.on(LABEL_EVENTS.AUTO_PLACE_END, 500, (event) => {
    this._activateDirectEdit(event.shape);
  });
};

/**
 * Activate direct editing for an element
 */
LabelEditingProvider.prototype._activateDirectEdit = function(element, force = false) {
  const editableTypes = [
    'fpb:Energy', 
    'fpb:Information', 
    'fpb:Product', 
    'fpb:ProcessOperator', 
    'fpb:TechnicalResource', 
    'fpb:SystemLimit'
  ];
  
  if (force || isAny(element, editableTypes)) {
    this._directEditing.activate(element);
  }
};

/**
 * Activate editing for an element (required by DirectEditing interface)
 */
LabelEditingProvider.prototype.activate = function(element) {
  // Get current text
  const text = getLabel(element);
  if (text === undefined) {
    return;
  }

  // Calculate editing bounds and style
  const { bounds, style } = this._boundsCalculator.calculateEditingBBox(element);
  
  // Prepare context - DirectEditing expects bounds as a separate property
  const context = {
    text: text,
    bounds: bounds
  };

  // Set editing options for internal labels
  if (this._hasInternalLabel(element)) {
    context.options = { ...EDITING_OPTIONS.DEFAULT };
  }

  // Add style information
  if (style) {
    context.style = style;
  }

  return context;
};

/**
 * Update element with new label text (required by DirectEditing interface)
 */
LabelEditingProvider.prototype.update = function(element, newLabel) {
  const processedLabel = isEmptyText(newLabel) ? null : newLabel;
  this._modeling.updateLabel(element, processedLabel);
};

/**
 * Check if element has internal label
 */
LabelEditingProvider.prototype._hasInternalLabel = function(element) {
  return isAny(element, [
    'fpb:State', 
    'fpb:ProcessOperator', 
    'fpb:TechnicalResource', 
    'fpb:SystemLimit'
  ]);
};

/**
 * Get editing bounds for an element (legacy method for backward compatibility)
 */
LabelEditingProvider.prototype.getEditingBBox = function(element) {
  return this._boundsCalculator.calculateEditingBBox(element);
};