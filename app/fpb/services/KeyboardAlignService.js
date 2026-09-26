/**
 * Keyboard Align Service
 *
 * Provides keyboard shortcuts for alignment operations
 */

// above the default keyboard bindings (1000)
const KEYBOARD_PRIORITY = 1500;

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

    // Store bound reference so it can be removed later
    this._boundHandleKeyDown = this._handleKeyDown.bind(this);
    this._containerEl = null;

    this._setupKeyboardListener();

    // Clean up on diagram destroy to prevent memory leaks
    eventBus.on('diagram.destroy', () => {
      this.destroy();
    });
  }

  /**
   * Setup keyboard event listener
   * @private
   */
  _setupKeyboardListener() {
    // Through the diagram-js keyboard, like every other shortcut: it only
    // hears the canvas, so text fields keep Ctrl+Shift+V (paste as plain
    // text). Above the default bindings, whose copy and paste ignore Shift,
    // so Ctrl+Shift+C/V align and do not copy or paste as well.
    this._keyboard = this._injector.get('keyboard', false);
    if (this._keyboard) {
      this._keyboard.addListener(KEYBOARD_PRIORITY, this._boundHandleKeyDown);
    }
  }

  /**
   * Remove all event listeners to prevent memory leaks
   */
  destroy() {
    if (this._keyboard) {
      this._keyboard.removeListener(this._boundHandleKeyDown);
    }
  }

  /**
   * Handle keyboard events
   * @private
   */
  _handleKeyDown(context) {
    const event = context && context.keyEvent;
    const key = event && this._getKeyCombo(event);

    // Skip if key combo couldn't be determined
    if (!key) {
      return;
    }

    const shortcut = this._shortcuts[key];

    if (shortcut) {
      shortcut();
      // handled: the keyboard prevents the default and no binding below runs
      return true;
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

    // Guard against undefined key (can happen with some browser events)
    if (!event.key) {
      return null;
    }

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