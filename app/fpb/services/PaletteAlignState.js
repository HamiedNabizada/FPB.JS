/**
 * Palette Align State Service
 *
 * Manages visual state of align tools in the palette based on selection
 */

export default class PaletteAlignState {
  constructor(eventBus, injector) {
    this._eventBus = eventBus;
    this._injector = injector;

    // Initialize state tracking
    this._currentState = {
      canAlign: false,
      canDistribute: false,
      selectedCount: 0
    };

    // Setup listeners
    this._setupEventListeners();
  }

  /**
   * Setup event listeners for align state changes
   * @private
   */
  _setupEventListeners() {
    this._eventBus.on('align.stateChanged', (event) => {
      this._updatePaletteState(event);
    });

    // Also listen for palette creation to set initial state
    this._eventBus.on('palette.create', () => {
      this._setInitialState();
    });
  }

  /**
   * Update palette visual state
   * @private
   */
  _updatePaletteState(state) {
    this._currentState = state;
    this._applyStateToElements();
  }

  /**
   * Set initial state when palette is created
   * @private
   */
  _setInitialState() {
    // Small delay to ensure palette is rendered
    setTimeout(() => {
      this._applyStateToElements();
    }, 100);
  }

  /**
   * Apply current state to palette elements
   * @private
   */
  _applyStateToElements() {
    const alignTools = [
      'align-left',
      'align-center',
      'align-right',
      'align-top',
      'align-middle',
      'align-bottom'
    ];

    const distributeTools = [
      'distribute-horizontal',
      'distribute-vertical'
    ];

    // Update align tools
    alignTools.forEach(toolId => {
      this._updateToolElement(toolId, this._currentState.canAlign);
    });

    // Update distribute tools
    distributeTools.forEach(toolId => {
      this._updateToolElement(toolId, this._currentState.canDistribute);
    });
  }

  /**
   * Update individual tool element state
   * @private
   */
  _updateToolElement(toolId, isEnabled) {
    const element = document.querySelector(`[data-action="${toolId}"]`);
    if (element) {
      if (isEnabled) {
        element.classList.remove('align-tool-disabled');
        element.classList.add('align-tool-enabled');
        element.style.pointerEvents = 'auto';
      } else {
        element.classList.remove('align-tool-enabled');
        element.classList.add('align-tool-disabled');
        element.style.pointerEvents = 'none';
      }
    }
  }

  /**
   * Get current state
   * @returns {Object} Current align state
   */
  getCurrentState() {
    return { ...this._currentState };
  }
}

// Dependency injection configuration
PaletteAlignState.$inject = ['eventBus', 'injector'];