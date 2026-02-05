/**
 * Align Service
 *
 * Provides element alignment and distribution functionality for FPB diagrams
 */

export default class AlignService {
  constructor(eventBus, injector, selection) {
    this._eventBus = eventBus;
    this._injector = injector;
    this._selection = selection;
    this._modeling = injector.get('modeling');
    this._canvas = injector.get('canvas');

    // Bind methods to maintain context
    this.alignElements = this.alignElements.bind(this);
    this.distributeElements = this.distributeElements.bind(this);

    // Listen to selection changes to update tool states
    this._setupSelectionListener();
  }

  /**
   * Align selected elements
   * @param {Array} elements - Elements to align
   * @param {string} alignment - 'left', 'center', 'right', 'top', 'middle', 'bottom'
   */
  alignElements(elements, alignment) {
    if (!elements || elements.length < 2) {
      return;
    }

    const bounds = this._calculateAlignmentBounds(elements);
    const deltas = [];

    elements.forEach(element => {
      const delta = this._calculateAlignmentDelta(element, bounds, alignment);
      if (delta.x !== 0 || delta.y !== 0) {
        deltas.push({ element, delta });
      }
    });

    if (deltas.length > 0) {
      this._applyDeltas(deltas);
      this._eventBus.fire('elements.aligned', { elements, alignment });
    }
  }

  /**
   * Distribute selected elements evenly
   * @param {Array} elements - Elements to distribute
   * @param {string} orientation - 'horizontal' or 'vertical'
   */
  distributeElements(elements, orientation) {
    if (!elements || elements.length < 3) {
      return;
    }

    const sorted = this._sortElementsForDistribution(elements, orientation);
    const deltas = this._calculateDistributionDeltas(sorted, orientation);

    if (deltas.length > 0) {
      this._applyDeltas(deltas);
      this._eventBus.fire('elements.distributed', { elements, orientation });
    }
  }

  /**
   * Check if alignment/distribution is possible with current selection
   * @param {string} operation - 'align' or 'distribute'
   * @returns {boolean}
   */
  canExecute(operation) {
    const selectedElements = this._selection.get();
    const minElements = operation === 'distribute' ? 3 : 2;
    return selectedElements.length >= minElements;
  }

  /**
   * Calculate bounding box for alignment reference
   * @private
   */
  _calculateAlignmentBounds(elements) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    elements.forEach(element => {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + element.width);
      maxY = Math.max(maxY, element.y + element.height);
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: minX + (maxX - minX) / 2,
      centerY: minY + (maxY - minY) / 2
    };
  }

  /**
   * Calculate delta for single element alignment
   * @private
   */
  _calculateAlignmentDelta(element, bounds, alignment) {
    const delta = { x: 0, y: 0 };

    switch (alignment) {
      case 'left':
        delta.x = bounds.x - element.x;
        break;
      case 'center':
        delta.x = bounds.centerX - (element.x + element.width / 2);
        break;
      case 'right':
        delta.x = (bounds.x + bounds.width) - (element.x + element.width);
        break;
      case 'top':
        delta.y = bounds.y - element.y;
        break;
      case 'middle':
        delta.y = bounds.centerY - (element.y + element.height / 2);
        break;
      case 'bottom':
        delta.y = (bounds.y + bounds.height) - (element.y + element.height);
        break;
    }

    return delta;
  }

  /**
   * Sort elements for distribution calculation
   * @private
   */
  _sortElementsForDistribution(elements, orientation) {
    return elements.slice().sort((a, b) => {
      if (orientation === 'horizontal') {
        return (a.x + a.width / 2) - (b.x + b.width / 2);
      } else {
        return (a.y + a.height / 2) - (b.y + b.height / 2);
      }
    });
  }

  /**
   * Calculate deltas for distribution
   * @private
   */
  _calculateDistributionDeltas(sortedElements, orientation) {
    const deltas = [];
    const first = sortedElements[0];
    const last = sortedElements[sortedElements.length - 1];

    let totalSpace;
    if (orientation === 'horizontal') {
      const firstCenter = first.x + first.width / 2;
      const lastCenter = last.x + last.width / 2;
      totalSpace = lastCenter - firstCenter;
    } else {
      const firstCenter = first.y + first.height / 2;
      const lastCenter = last.y + last.height / 2;
      totalSpace = lastCenter - firstCenter;
    }

    const spacing = totalSpace / (sortedElements.length - 1);

    for (let i = 1; i < sortedElements.length - 1; i++) {
      const element = sortedElements[i];
      const delta = { x: 0, y: 0 };

      if (orientation === 'horizontal') {
        const targetCenter = (first.x + first.width / 2) + (spacing * i);
        const currentCenter = element.x + element.width / 2;
        delta.x = targetCenter - currentCenter;
      } else {
        const targetCenter = (first.y + first.height / 2) + (spacing * i);
        const currentCenter = element.y + element.height / 2;
        delta.y = targetCenter - currentCenter;
      }

      if (delta.x !== 0 || delta.y !== 0) {
        deltas.push({ element, delta });
      }
    }

    return deltas;
  }

  /**
   * Apply calculated deltas to elements
   * @private
   */
  _applyDeltas(deltas) {
    deltas.forEach(({ element, delta }) => {
      this._modeling.moveElements([element], delta);
    });
  }

  /**
   * Setup selection listener to update tool states
   * @private
   */
  _setupSelectionListener() {
    this._eventBus.on('selection.changed', (event) => {
      this._updateToolStates(event.newSelection);
    });
  }

  /**
   * Update tool states based on current selection
   * @private
   */
  _updateToolStates(selectedElements) {
    const canAlign = selectedElements.length >= 2;
    const canDistribute = selectedElements.length >= 3;

    this._eventBus.fire('align.stateChanged', {
      canAlign,
      canDistribute,
      selectedCount: selectedElements.length
    });
  }

  /**
   * Get current tool states
   * @returns {Object} Tool states
   */
  getToolStates() {
    const selectedElements = this._selection.get();
    return {
      canAlign: selectedElements.length >= 2,
      canDistribute: selectedElements.length >= 3,
      selectedCount: selectedElements.length
    };
  }
}

// Dependency injection configuration
AlignService.$inject = ['eventBus', 'injector', 'selection'];