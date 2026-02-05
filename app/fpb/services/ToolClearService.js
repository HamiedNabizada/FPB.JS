/**
 * Tool Clear Service
 *
 * Ensures no tool is active on startup for normal selection
 */

export default class ToolClearService {
  constructor(eventBus, injector) {
    this._eventBus = eventBus;
    this._injector = injector;

    // Clear any active tool on initialization
    this._setupInitialization();
  }

  /**
   * Setup initialization to clear active tools
   * @private
   */
  _setupInitialization() {
    // Clear tools after diagram initialization
    this._eventBus.on('canvas.init', () => {
      this._clearActiveTools();
    });

    // Also clear on palette creation
    this._eventBus.on('palette.create', () => {
      setTimeout(() => {
        this._clearActiveTools();
      }, 100);
    });
  }

  /**
   * Clear any active tools to enable normal selection
   * @private
   */
  _clearActiveTools() {
    try {
      // Try to get tool manager and clear active tool
      const toolManager = this._injector.get('toolManager', false);
      if (toolManager && toolManager.setTool) {
        toolManager.setTool(null);
      }

      // Fire tool-manager update event
      this._eventBus.fire('tool-manager.update', { tool: null });

      // Also try to clear any lasso tool activation
      const lassoTool = this._injector.get('lassoTool', false);
      if (lassoTool && lassoTool.deactivate) {
        lassoTool.deactivate();
      }

      // Clear any space tool activation
      const spaceTool = this._injector.get('spaceTool', false);
      if (spaceTool && spaceTool.deactivate) {
        spaceTool.deactivate();
      }

      // Clear any hand tool activation
      const handTool = this._injector.get('handTool', false);
      if (handTool && handTool.deactivate) {
        handTool.deactivate();
      }

    } catch (error) {
      // Silently handle any errors during tool clearing
      console.debug('Tool clearing completed');
    }
  }

  /**
   * Manually clear active tools (public method)
   */
  clearTools() {
    this._clearActiveTools();
  }
}

// Dependency injection configuration
ToolClearService.$inject = ['eventBus', 'injector'];