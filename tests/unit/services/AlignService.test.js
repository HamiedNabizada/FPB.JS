// tests/unit/services/AlignService.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

import AlignService from '../../../app/fpb/services/AlignService.js';

describe('AlignService', () => {

  let alignService;
  let mockEventBus;
  let mockSelection;
  let mockModeling;
  let mockCanvas;
  let mockInjector;

  beforeEach(() => {
    mockEventBus = {
      on: vi.fn(),
      fire: vi.fn()
    };

    mockSelection = {
      get: vi.fn().mockReturnValue([])
    };

    mockModeling = {
      moveElements: vi.fn()
    };

    mockCanvas = {};

    mockInjector = {
      get: vi.fn((name) => {
        if (name === 'modeling') return mockModeling;
        if (name === 'canvas') return mockCanvas;
        return null;
      })
    };

    alignService = new AlignService(mockEventBus, mockInjector, mockSelection);
  });

  // ============================================
  // Constructor
  // ============================================

  describe('constructor', () => {

    it('stores eventBus reference', () => {
      expect(alignService._eventBus).toBe(mockEventBus);
    });

    it('stores selection reference', () => {
      expect(alignService._selection).toBe(mockSelection);
    });

    it('sets up selection listener', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith('selection.changed', expect.any(Function));
    });

  });

  // ============================================
  // canExecute
  // ============================================

  describe('canExecute()', () => {

    it('returns false for align when less than 2 elements selected', () => {
      mockSelection.get.mockReturnValue([{ id: 'elem1' }]);
      expect(alignService.canExecute('align')).toBe(false);
    });

    it('returns true for align when 2+ elements selected', () => {
      mockSelection.get.mockReturnValue([{ id: 'elem1' }, { id: 'elem2' }]);
      expect(alignService.canExecute('align')).toBe(true);
    });

    it('returns false for distribute when less than 3 elements selected', () => {
      mockSelection.get.mockReturnValue([{ id: 'elem1' }, { id: 'elem2' }]);
      expect(alignService.canExecute('distribute')).toBe(false);
    });

    it('returns true for distribute when 3+ elements selected', () => {
      mockSelection.get.mockReturnValue([
        { id: 'elem1' },
        { id: 'elem2' },
        { id: 'elem3' }
      ]);
      expect(alignService.canExecute('distribute')).toBe(true);
    });

  });

  // ============================================
  // alignElements
  // ============================================

  describe('alignElements()', () => {

    it('does nothing for null elements', () => {
      alignService.alignElements(null, 'left');
      expect(mockModeling.moveElements).not.toHaveBeenCalled();
    });

    it('does nothing for less than 2 elements', () => {
      alignService.alignElements([{ id: 'elem1' }], 'left');
      expect(mockModeling.moveElements).not.toHaveBeenCalled();
    });

    it('aligns elements left', () => {
      const elements = [
        { id: 'elem1', x: 100, y: 50, width: 50, height: 30 },
        { id: 'elem2', x: 200, y: 100, width: 50, height: 30 }
      ];

      alignService.alignElements(elements, 'left');

      // elem2 should move left to x=100
      expect(mockModeling.moveElements).toHaveBeenCalledWith(
        [elements[1]],
        { x: -100, y: 0 }
      );
    });

    it('aligns elements right', () => {
      const elements = [
        { id: 'elem1', x: 100, y: 50, width: 50, height: 30 },
        { id: 'elem2', x: 200, y: 100, width: 50, height: 30 }
      ];

      alignService.alignElements(elements, 'right');

      // elem1 should move right to align with elem2's right edge (250)
      expect(mockModeling.moveElements).toHaveBeenCalledWith(
        [elements[0]],
        { x: 100, y: 0 }
      );
    });

    it('aligns elements top', () => {
      const elements = [
        { id: 'elem1', x: 100, y: 50, width: 50, height: 30 },
        { id: 'elem2', x: 200, y: 100, width: 50, height: 30 }
      ];

      alignService.alignElements(elements, 'top');

      // elem2 should move up to y=50
      expect(mockModeling.moveElements).toHaveBeenCalledWith(
        [elements[1]],
        { x: 0, y: -50 }
      );
    });

    it('aligns elements bottom', () => {
      const elements = [
        { id: 'elem1', x: 100, y: 50, width: 50, height: 30 },
        { id: 'elem2', x: 200, y: 100, width: 50, height: 30 }
      ];

      alignService.alignElements(elements, 'bottom');

      // elem1 should move down to align with elem2's bottom (130)
      expect(mockModeling.moveElements).toHaveBeenCalledWith(
        [elements[0]],
        { x: 0, y: 50 }
      );
    });

    it('fires elements.aligned event after alignment', () => {
      const elements = [
        { id: 'elem1', x: 100, y: 50, width: 50, height: 30 },
        { id: 'elem2', x: 200, y: 100, width: 50, height: 30 }
      ];

      alignService.alignElements(elements, 'left');

      expect(mockEventBus.fire).toHaveBeenCalledWith('elements.aligned', {
        elements,
        alignment: 'left'
      });
    });

    it('does not fire event if no elements moved', () => {
      const elements = [
        { id: 'elem1', x: 100, y: 50, width: 50, height: 30 },
        { id: 'elem2', x: 100, y: 100, width: 50, height: 30 }  // Already left-aligned
      ];

      alignService.alignElements(elements, 'left');

      expect(mockEventBus.fire).not.toHaveBeenCalledWith('elements.aligned', expect.anything());
    });

  });

  // ============================================
  // distributeElements
  // ============================================

  describe('distributeElements()', () => {

    it('does nothing for null elements', () => {
      alignService.distributeElements(null, 'horizontal');
      expect(mockModeling.moveElements).not.toHaveBeenCalled();
    });

    it('does nothing for less than 3 elements', () => {
      alignService.distributeElements([{ id: 'elem1' }, { id: 'elem2' }], 'horizontal');
      expect(mockModeling.moveElements).not.toHaveBeenCalled();
    });

    it('distributes elements horizontally', () => {
      const elements = [
        { id: 'elem1', x: 0, y: 0, width: 50, height: 30 },
        { id: 'elem2', x: 100, y: 0, width: 50, height: 30 },
        { id: 'elem3', x: 300, y: 0, width: 50, height: 30 }
      ];

      alignService.distributeElements(elements, 'horizontal');

      // Middle element should be moved to center between first and last
      // First center: 25, Last center: 325, spacing: 150
      // Target center: 25 + 150 = 175, current center: 125, delta.x = 50
      expect(mockModeling.moveElements).toHaveBeenCalled();
    });

    it('distributes elements vertically', () => {
      const elements = [
        { id: 'elem1', x: 0, y: 0, width: 50, height: 30 },
        { id: 'elem2', x: 0, y: 100, width: 50, height: 30 },
        { id: 'elem3', x: 0, y: 300, width: 50, height: 30 }
      ];

      alignService.distributeElements(elements, 'vertical');

      expect(mockModeling.moveElements).toHaveBeenCalled();
    });

    it('fires elements.distributed event after distribution', () => {
      const elements = [
        { id: 'elem1', x: 0, y: 0, width: 50, height: 30 },
        { id: 'elem2', x: 100, y: 0, width: 50, height: 30 },
        { id: 'elem3', x: 300, y: 0, width: 50, height: 30 }
      ];

      alignService.distributeElements(elements, 'horizontal');

      expect(mockEventBus.fire).toHaveBeenCalledWith('elements.distributed', {
        elements,
        orientation: 'horizontal'
      });
    });

  });

  // ============================================
  // _calculateAlignmentBounds
  // ============================================

  describe('_calculateAlignmentBounds()', () => {

    it('calculates bounding box for elements', () => {
      const elements = [
        { id: 'elem1', x: 100, y: 50, width: 50, height: 30 },
        { id: 'elem2', x: 200, y: 100, width: 60, height: 40 }
      ];

      const bounds = alignService._calculateAlignmentBounds(elements);

      expect(bounds.x).toBe(100);  // minX
      expect(bounds.y).toBe(50);   // minY
      expect(bounds.width).toBe(160);  // 260 - 100
      expect(bounds.height).toBe(90);  // 140 - 50
    });

    it('calculates center coordinates', () => {
      const elements = [
        { id: 'elem1', x: 0, y: 0, width: 100, height: 100 },
        { id: 'elem2', x: 100, y: 100, width: 100, height: 100 }
      ];

      const bounds = alignService._calculateAlignmentBounds(elements);

      expect(bounds.centerX).toBe(100);  // 0 + (200 - 0) / 2
      expect(bounds.centerY).toBe(100);  // 0 + (200 - 0) / 2
    });

  });

  // ============================================
  // _calculateAlignmentDelta
  // ============================================

  describe('_calculateAlignmentDelta()', () => {

    const bounds = {
      x: 100,
      y: 50,
      width: 200,
      height: 100,
      centerX: 200,
      centerY: 100
    };

    it('calculates left alignment delta', () => {
      const element = { x: 150, y: 75, width: 50, height: 30 };
      const delta = alignService._calculateAlignmentDelta(element, bounds, 'left');

      expect(delta.x).toBe(-50);  // 100 - 150
      expect(delta.y).toBe(0);
    });

    it('calculates right alignment delta', () => {
      const element = { x: 150, y: 75, width: 50, height: 30 };
      const delta = alignService._calculateAlignmentDelta(element, bounds, 'right');

      expect(delta.x).toBe(100);  // (100 + 200) - (150 + 50) = 100
      expect(delta.y).toBe(0);
    });

    it('calculates center alignment delta', () => {
      const element = { x: 150, y: 75, width: 50, height: 30 };
      const delta = alignService._calculateAlignmentDelta(element, bounds, 'center');

      expect(delta.x).toBe(25);  // 200 - (150 + 25) = 25
      expect(delta.y).toBe(0);
    });

    it('calculates top alignment delta', () => {
      const element = { x: 150, y: 75, width: 50, height: 30 };
      const delta = alignService._calculateAlignmentDelta(element, bounds, 'top');

      expect(delta.x).toBe(0);
      expect(delta.y).toBe(-25);  // 50 - 75
    });

    it('calculates bottom alignment delta', () => {
      const element = { x: 150, y: 75, width: 50, height: 30 };
      const delta = alignService._calculateAlignmentDelta(element, bounds, 'bottom');

      expect(delta.x).toBe(0);
      expect(delta.y).toBe(45);  // (50 + 100) - (75 + 30) = 45
    });

    it('calculates middle alignment delta', () => {
      const element = { x: 150, y: 75, width: 50, height: 30 };
      const delta = alignService._calculateAlignmentDelta(element, bounds, 'middle');

      expect(delta.x).toBe(0);
      expect(delta.y).toBe(10);  // 100 - (75 + 15) = 10
    });

  });

  // ============================================
  // _sortElementsForDistribution
  // ============================================

  describe('_sortElementsForDistribution()', () => {

    it('sorts elements horizontally by center', () => {
      const elements = [
        { id: 'elem2', x: 100, y: 0, width: 50, height: 30 },
        { id: 'elem1', x: 0, y: 0, width: 50, height: 30 },
        { id: 'elem3', x: 200, y: 0, width: 50, height: 30 }
      ];

      const sorted = alignService._sortElementsForDistribution(elements, 'horizontal');

      expect(sorted[0].id).toBe('elem1');  // center at 25
      expect(sorted[1].id).toBe('elem2');  // center at 125
      expect(sorted[2].id).toBe('elem3');  // center at 225
    });

    it('sorts elements vertically by center', () => {
      const elements = [
        { id: 'elem2', x: 0, y: 100, width: 50, height: 30 },
        { id: 'elem1', x: 0, y: 0, width: 50, height: 30 },
        { id: 'elem3', x: 0, y: 200, width: 50, height: 30 }
      ];

      const sorted = alignService._sortElementsForDistribution(elements, 'vertical');

      expect(sorted[0].id).toBe('elem1');  // center at 15
      expect(sorted[1].id).toBe('elem2');  // center at 115
      expect(sorted[2].id).toBe('elem3');  // center at 215
    });

    it('does not modify original array', () => {
      const elements = [
        { id: 'elem2', x: 100, y: 0, width: 50, height: 30 },
        { id: 'elem1', x: 0, y: 0, width: 50, height: 30 }
      ];

      alignService._sortElementsForDistribution(elements, 'horizontal');

      expect(elements[0].id).toBe('elem2');  // Original order preserved
    });

  });

  // ============================================
  // getToolStates
  // ============================================

  describe('getToolStates()', () => {

    it('returns canAlign false with 0 elements', () => {
      mockSelection.get.mockReturnValue([]);
      const states = alignService.getToolStates();

      expect(states.canAlign).toBe(false);
      expect(states.canDistribute).toBe(false);
    });

    it('returns canAlign false with 1 element', () => {
      mockSelection.get.mockReturnValue([{ id: 'elem1' }]);
      const states = alignService.getToolStates();

      expect(states.canAlign).toBe(false);
    });

    it('returns canAlign true with 2 elements', () => {
      mockSelection.get.mockReturnValue([{ id: 'elem1' }, { id: 'elem2' }]);
      const states = alignService.getToolStates();

      expect(states.canAlign).toBe(true);
      expect(states.canDistribute).toBe(false);
    });

    it('returns canDistribute true with 3 elements', () => {
      mockSelection.get.mockReturnValue([
        { id: 'elem1' },
        { id: 'elem2' },
        { id: 'elem3' }
      ]);
      const states = alignService.getToolStates();

      expect(states.canAlign).toBe(true);
      expect(states.canDistribute).toBe(true);
    });

    it('returns selectedCount', () => {
      mockSelection.get.mockReturnValue([{ id: 'elem1' }, { id: 'elem2' }]);
      const states = alignService.getToolStates();

      expect(states.selectedCount).toBe(2);
    });

  });

});
