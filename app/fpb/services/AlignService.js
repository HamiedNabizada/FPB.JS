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
    this._elementRegistry = injector.get('elementRegistry');
    this._rules = injector.get('rules', false);

    // One alignment is one command: a single undo takes it back as a whole
    injector.get('commandStack').registerHandler('fpb.moveEach', MoveEachHandler);

    // Bind methods to maintain context
    this.alignElements = this.alignElements.bind(this);
    this.distributeElements = this.distributeElements.bind(this);
  }

  /**
   * Align selected elements
   * @param {Array} elements - Elements to align
   * @param {string} alignment - 'left', 'center', 'right', 'top', 'middle', 'bottom'
   */
  alignElements(elements, alignment) {
    elements = this._alignable(elements);
    if (elements.length < 2) {
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
    elements = this._alignable(elements);
    if (elements.length < 3) {
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
    // The same rules as dragging with the mouse: a boundary state stays on
    // the border, a technical resource outside the system limit
    const moves = deltas.filter(({ element, delta }) => this._moveAllowed(element, delta));
    if (moves.length) {
      this._injector.get('commandStack').execute('fpb.moveEach', { moves });
    }
  }

  /**
   * The shapes of a selection that can be aligned. Ctrl+A and the lasso also
   * select connections (no x/y) and external labels (they follow their
   * element); the layer itself never moves.
   * @private
   */
  _alignable(elements) {
    const root = this._canvas.getRootElement();
    return (elements || []).filter((element) => element &&
      !element.waypoints &&
      element.type !== 'label' &&
      !element.labelTarget &&
      element !== root &&
      Number.isFinite(element.x) && Number.isFinite(element.y));
  }

  /**
   * Asks the move rule as a drag would: with the new center as position and
   * the shape found there as target.
   * @private
   */
  _moveAllowed(element, delta) {
    if (!this._rules) {
      return true;
    }
    const position = {
      x: element.x + element.width / 2 + delta.x,
      y: element.y + element.height / 2 + delta.y
    };
    const target = this._targetAt(position, element);
    return this._rules.allowed('elements.move', { shapes: [ element ], delta, position, target }) !== false;
  }

  /**
   * The innermost shape at a point, not counting the moved element itself and
   * its children; the layer when there is none.
   * @private
   */
  _targetAt(point, moved) {
    const root = this._canvas.getRootElement();
    const inside = (child) => {
      for (let e = child; e; e = e.parent) {
        if (e === moved) {
          return true;
        }
      }
      return false;
    };
    const hits = this._elementRegistry.filter((e) => e !== root &&
      !e.waypoints && e.type !== 'label' && !e.labelTarget && !inside(e) &&
      point.x >= e.x && point.x <= e.x + e.width &&
      point.y >= e.y && point.y <= e.y + e.height);
    hits.sort((a, b) => a.width * a.height - b.width * b.height);
    return hits[0] || root;
  }
}

// Dependency injection configuration
AlignService.$inject = ['eventBus', 'injector', 'selection'];

/**
 * Moves each element by its own delta, all in one command.
 */
function MoveEachHandler(modeling) {
  this._modeling = modeling;
}

MoveEachHandler.$inject = ['modeling'];

MoveEachHandler.prototype.preExecute = function (context) {
  context.moves.forEach(({ element, delta }) => {
    this._modeling.moveElements([ element ], delta);
  });
};