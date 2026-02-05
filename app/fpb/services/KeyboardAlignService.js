/**
 * Keyboard Align Service
 *
 * Provides keyboard shortcuts for alignment operations
 */

export default class KeyboardAlignService {
  constructor(eventBus, injector, alignService, selection) {
    this._eventBus = eventBus;
    this._injector = injector;
    this._alignService = alignService;
    this._selection = selection;
    this._canvas = injector.get('canvas');

    // Keyboard shortcuts configuration
    this._shortcuts = {
      // Alignment shortcuts
      'ctrl+shift+l': () => this._executeAlign('left'),      // Align Left
      'ctrl+shift+c': () => this._executeAlign('center'),    // Align Center
      'ctrl+shift+r': () => this._executeAlign('right'),     // Align Right
      'ctrl+shift+t': () => this._executeAlign('top'),       // Align Top
      'ctrl+shift+m': () => this._executeAlign('middle'),    // Align Middle
      'ctrl+shift+b': () => this._executeAlign('bottom'),    // Align Bottom

      // Distribution shortcuts
      'ctrl+shift+h': () => this._executeDistribute('horizontal'), // Distribute Horizontal
      'ctrl+shift+v': () => this._executeDistribute('vertical')    // Distribute Vertical
    };

    this._setupKeyboardListener();
  }

  /**
   * Setup keyboard event listener
   * @private
   */
  _setupKeyboardListener() {
    // Listen to keyboard events on the canvas container
    this._eventBus.on('canvas.init', () => {
      const container = this._canvas.getContainer();
      if (container) {
        container.addEventListener('keydown', this._handleKeyDown.bind(this));
      }
    });

    // Also listen globally to document in case canvas doesn't have focus
    document.addEventListener('keydown', this._handleKeyDown.bind(this));
  }

  /**
   * Handle keyboard events
   * @private
   */
  _handleKeyDown(event) {
    const key = this._getKeyCombo(event);
    const shortcut = this._shortcuts[key];

    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      shortcut();
    }
  }

  /**
   * Get key combination string from event
   * @private
   */
  _getKeyCombo(event) {
    const parts = [];

    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.shiftKey) parts.push('shift');
    if (event.altKey) parts.push('alt');

    const key = event.key.toLowerCase();
    parts.push(key);

    return parts.join('+');
  }

  /**
   * Execute alignment operation
   * @private
   */
  _executeAlign(alignment) {
    const selectedElements = this._selection.get();

    if (selectedElements.length >= 2) {
      this._alignService.alignElements(selectedElements, alignment);

      // Fire event for user feedback
      this._eventBus.fire('keyboard.align.executed', {
        alignment,
        elementCount: selectedElements.length
      });
    } else {
      // Fire event for insufficient selection feedback
      this._eventBus.fire('keyboard.align.insufficient', {
        alignment,
        elementCount: selectedElements.length,
        required: 2
      });
    }
  }

  /**
   * Execute distribution operation
   * @private
   */
  _executeDistribute(orientation) {
    const selectedElements = this._selection.get();

    if (selectedElements.length >= 3) {
      this._alignService.distributeElements(selectedElements, orientation);

      // Fire event for user feedback
      this._eventBus.fire('keyboard.distribute.executed', {
        orientation,
        elementCount: selectedElements.length
      });
    } else {
      // Fire event for insufficient selection feedback
      this._eventBus.fire('keyboard.distribute.insufficient', {
        orientation,
        elementCount: selectedElements.length,
        required: 3
      });
    }
  }

  /**
   * Get available shortcuts
   * @returns {Object} Shortcuts configuration
   */
  getShortcuts() {
    return {
      'Alignment': [
        { keys: ['Ctrl+Shift+L'], description: 'Align Left' },
        { keys: ['Ctrl+Shift+C'], description: 'Align Center' },
        { keys: ['Ctrl+Shift+R'], description: 'Align Right' },
        { keys: ['Ctrl+Shift+T'], description: 'Align Top' },
        { keys: ['Ctrl+Shift+M'], description: 'Align Middle' },
        { keys: ['Ctrl+Shift+B'], description: 'Align Bottom' }
      ],
      'Distribution': [
        { keys: ['Ctrl+Shift+H'], description: 'Distribute Horizontally' },
        { keys: ['Ctrl+Shift+V'], description: 'Distribute Vertically' }
      ]
    };
  }
}

// Dependency injection configuration
KeyboardAlignService.$inject = ['eventBus', 'injector', 'alignService', 'selection'];