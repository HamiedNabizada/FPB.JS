/**
 * Label Editing Preview - Refactored
 * 
 * Handles preview functionality during label editing with improved structure
 */
import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  remove as svgRemove
} from 'tiny-svg';

import { isAny } from '../help/utils';
import { LABEL_MARKERS, LABEL_EVENTS } from './constants/LabelConstants';

export default function LabelEditingPreview(eventBus, canvas, elementRegistry) {
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;
  
  // Internal state
  this._activeElement = null;
  this._previewGfx = null;
  
  this._setupEventListeners(eventBus);
}

LabelEditingPreview.$inject = [
  'eventBus',
  'canvas',
  'elementRegistry'
];

/**
 * Set up event listeners for preview functionality
 */
LabelEditingPreview.prototype._setupEventListeners = function(eventBus) {
  // Handle editing activation
  eventBus.on(LABEL_EVENTS.ACTIVATE, (context) => {
    this._onEditingActivate(context);
  });

  // Handle editing completion/cancellation
  eventBus.on([LABEL_EVENTS.COMPLETE, LABEL_EVENTS.CANCEL], (context) => {
    this._onEditingComplete(context);
  });
};

/**
 * Handle editing activation - hide labels during editing
 */
LabelEditingPreview.prototype._onEditingActivate = function(context) {
  const activeProvider = context.active;
  const element = activeProvider.element.label || activeProvider.element;
  
  this._activeElement = element;
  
  // Apply appropriate marker based on element type
  const marker = this._getMarkerForElement(element);
  this._canvas.addMarker(element, marker);
};

/**
 * Handle editing completion - restore label visibility
 */
LabelEditingPreview.prototype._onEditingComplete = function(context) {
  const activeProvider = context.active;
  
  if (activeProvider) {
    // Remove markers from both element and active element
    const providerElement = activeProvider.element.label || activeProvider.element;
    this._canvas.removeMarker(providerElement, LABEL_MARKERS.ELEMENT_HIDDEN);
    
    if (this._activeElement) {
      this._canvas.removeMarker(this._activeElement, LABEL_MARKERS.LABEL_HIDDEN);
    }
  }
  
  // Clean up preview graphics if any
  this._cleanupPreviewGraphics();
  
  // Reset state
  this._activeElement = null;
};

/**
 * Get appropriate marker for element type
 */
LabelEditingPreview.prototype._getMarkerForElement = function(element) {
  const labelEditableTypes = [
    'fpb:Product', 
    'fpb:Information', 
    'fpb:Energy', 
    'fpb:TechnicalResource', 
    'fpb:ProcessOperator', 
    'fpb:SystemLimit'
  ];
  
  return isAny(element, labelEditableTypes) 
    ? LABEL_MARKERS.LABEL_HIDDEN 
    : LABEL_MARKERS.ELEMENT_HIDDEN;
};

/**
 * Clean up any preview graphics
 */
LabelEditingPreview.prototype._cleanupPreviewGraphics = function() {
  if (this._previewGfx) {
    svgRemove(this._previewGfx);
    this._previewGfx = null;
  }
};

/**
 * Create preview graphics (extensible for future enhancements)
 */
LabelEditingPreview.prototype._createPreviewGraphics = function() {
  // Placeholder for future preview graphics functionality
  // Could be used for showing edit boundaries, guidelines, etc.
  return null;
};