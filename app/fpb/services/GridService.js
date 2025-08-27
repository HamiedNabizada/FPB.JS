/**
 * Grid Service
 * 
 * Provides basic grid functionality for diagram display
 */

export default class GridService {
  constructor(eventBus, injector, config, settingsService) {
    this._eventBus = eventBus;
    this._injector = injector;
    this._canvas = injector.get('canvas');
    
    // Initialize basic grid functionality
    this._initializeGrid();
  }
  
  /**
   * Initialize basic grid functionality
   */
  _initializeGrid() {
    try {
      // Get grid services from injector
      this._grid = this._injector.get('grid', false);
      this._gridSnapping = this._injector.get('gridSnapping', false);
      
      if (this._grid && this._gridSnapping) {
        // Enable basic grid with default settings
        this._grid.toggle(true);
        this._eventBus.fire('gridSnapping.toggle', { active: true });
      }
    } catch (error) {
      // Silently handle initialization errors
    }
  }
}

// Dependency injection configuration
GridService.$inject = ['eventBus', 'injector', 'config', 'settingsService'];