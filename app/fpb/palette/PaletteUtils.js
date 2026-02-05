/**
 * Palette Utilities
 * 
 * Helper functions for FPB Palette operations
 */

import { assign } from 'min-dash';

/**
 * Action builder utilities for palette entries
 */
export class PaletteActionBuilder {
  
  /**
   * Creates a standardized element creation action
   */
  static createElementAction(type, group, className, title, options, create, elementFactory) {
    function createListener(event) {
      const shape = elementFactory.createShape(assign({ type: type }, options));
      create.start(event, shape);
    }

    const shortType = type.replace(/^fpb:/, '');
    
    return {
      group: group,
      className: className,
      title: title || 'Create ' + shortType,
      action: {
        dragstart: createListener,
        click: createListener
      }
    };
  }

  /**
   * Creates a tool action with click handler
   */
  static createToolAction(group, className, title, clickHandler) {
    return {
      group: group,
      className: className,
      title: title,
      action: {
        click: clickHandler
      }
    };
  }

  /**
   * Creates a separator entry
   */
  static createSeparator(group) {
    return {
      group: group,
      separator: true
    };
  }
}

/**
 * Helper for building FPB element entries from configuration
 */
export class FpbElementBuilder {
  
  /**
   * Builds all FPB element entries from element configuration
   */
  static buildElementEntries(elementConfig, create, elementFactory, translate) {
    const entries = {};
    
    Object.entries(elementConfig).forEach(([entryId, config]) => {
      entries[entryId] = PaletteActionBuilder.createElementAction(
        config.type,
        config.group,
        config.icon,
        translate(config.tooltip),
        {},
        create,
        elementFactory
      );
    });
    
    return entries;
  }
}

/**
 * Tool action handlers
 */
export class ToolActionHandlers {
  
  /**
   * Creates select tool handler (clears any active tools)
   */
  static createSelectHandler(toolClearService) {
    return function(event) {
      toolClearService.clearTools();
    };
  }

  /**
   * Creates lasso tool activation handler
   */
  static createLassoHandler(lassoTool) {
    return function(event) {
      lassoTool.activateSelection(event);
    };
  }

  /**
   * Creates space tool activation handler
   */
  static createSpaceHandler(spaceTool) {
    return function(event) {
      spaceTool.activateSelection(event);
    };
  }

  /**
   * Creates hand tool activation handler
   */
  static createHandHandler(handTool) {
    return function(event) {
      handTool.activateHand(event);
    };
  }

  /**
   * Creates align tool handler
   */
  static createAlignHandler(alignService, selection, alignment) {
    return function(event) {
      const selectedElements = selection.get();
      if (alignService.canExecute('align') && selectedElements.length >= 2) {
        alignService.alignElements(selectedElements, alignment);
      }
    };
  }

  /**
   * Creates distribute tool handler
   */
  static createDistributeHandler(alignService, selection, orientation) {
    return function(event) {
      const selectedElements = selection.get();
      if (alignService.canExecute('distribute') && selectedElements.length >= 3) {
        alignService.distributeElements(selectedElements, orientation);
      }
    };
  }
}