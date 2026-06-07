// tests/unit/label/LabelUtils.test.js
import { describe, it, expect } from 'vitest';

import {
  isEmptyText,
  getElementMid,
  scaleByZoom,
  calculatePositionedBounds,
  createTextAlignmentStyle,
  createExternalLabelStyle
} from '../../../app/fpb/label/utils/LabelUtils.js';

describe('LabelUtils', () => {

  // ============================================
  // isEmptyText
  // ============================================

  describe('isEmptyText(label)', () => {

    it('returns true for null', () => {
      expect(isEmptyText(null)).toBe(true);
    });

    it('returns true for undefined', () => {
      expect(isEmptyText(undefined)).toBe(true);
    });

    it('returns true for empty string', () => {
      expect(isEmptyText('')).toBe(true);
    });

    it('returns true for whitespace only', () => {
      expect(isEmptyText('   ')).toBe(true);
    });

    it('returns true for tabs and newlines', () => {
      expect(isEmptyText('\t\n\r')).toBe(true);
    });

    it('returns false for text with content', () => {
      expect(isEmptyText('Hello')).toBe(false);
    });

    it('returns false for text with leading/trailing whitespace', () => {
      expect(isEmptyText('  Hello  ')).toBe(false);
    });

    it('returns false for single character', () => {
      expect(isEmptyText('A')).toBe(false);
    });

  });

  // ============================================
  // getElementMid
  // ============================================

  describe('getElementMid(bbox)', () => {

    it('calculates midpoint of simple bounding box', () => {
      const bbox = { x: 0, y: 0, width: 100, height: 100 };

      const result = getElementMid(bbox);

      expect(result.x).toBe(50);
      expect(result.y).toBe(50);
    });

    it('calculates midpoint with offset position', () => {
      const bbox = { x: 100, y: 200, width: 50, height: 30 };

      const result = getElementMid(bbox);

      expect(result.x).toBe(125);  // 100 + 50/2
      expect(result.y).toBe(215);  // 200 + 30/2
    });

    it('handles zero dimensions', () => {
      const bbox = { x: 50, y: 50, width: 0, height: 0 };

      const result = getElementMid(bbox);

      expect(result.x).toBe(50);
      expect(result.y).toBe(50);
    });

    it('handles negative coordinates', () => {
      const bbox = { x: -100, y: -50, width: 40, height: 20 };

      const result = getElementMid(bbox);

      expect(result.x).toBe(-80);  // -100 + 40/2
      expect(result.y).toBe(-40);  // -50 + 20/2
    });

  });

  // ============================================
  // scaleByZoom
  // ============================================

  describe('scaleByZoom(value, zoom)', () => {

    it('returns same value at zoom 1', () => {
      expect(scaleByZoom(100, 1)).toBe(100);
    });

    it('doubles value at zoom 2', () => {
      expect(scaleByZoom(50, 2)).toBe(100);
    });

    it('halves value at zoom 0.5', () => {
      expect(scaleByZoom(100, 0.5)).toBe(50);
    });

    it('handles decimal values', () => {
      expect(scaleByZoom(33.33, 3)).toBeCloseTo(99.99, 2);
    });

    it('returns 0 for value 0', () => {
      expect(scaleByZoom(0, 5)).toBe(0);
    });

    it('returns 0 for zoom 0', () => {
      expect(scaleByZoom(100, 0)).toBe(0);
    });

  });

  // ============================================
  // calculatePositionedBounds
  // ============================================

  describe('calculatePositionedBounds(bbox, textBoxSize, position, align, zoom)', () => {

    const bbox = { x: 100, y: 100, width: 200, height: 150 };
    const textBoxSize = { width: 50, height: 20 };

    describe('horizontal alignment', () => {

      it('aligns left', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'center', 'left', 1);
        expect(result.x).toBe(100);  // bbox.x
      });

      it('aligns right', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'center', 'right', 1);
        expect(result.x).toBe(250);  // 100 + 200 - 50
      });

      it('aligns center', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'center', 'center', 1);
        expect(result.x).toBe(175);  // 100 + (200 - 50) / 2
      });

      it('defaults to center for unknown align', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'center', 'unknown', 1);
        expect(result.x).toBe(175);
      });

    });

    describe('vertical positioning', () => {

      it('positions at top', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'top', 'center', 1);
        expect(result.y).toBe(100);  // bbox.y
      });

      it('positions at bottom', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'bottom', 'center', 1);
        expect(result.y).toBe(230);  // 100 + 150 - 20
      });

      it('positions at center', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'center', 'center', 1);
        expect(result.y).toBe(165);  // 100 + (150 - 20) / 2
      });

      it('defaults to center for unknown position', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'unknown', 'center', 1);
        expect(result.y).toBe(165);
      });

    });

    describe('zoom scaling', () => {

      it('scales dimensions by zoom factor', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'top', 'left', 2);

        expect(result.width).toBe(100);  // 50 * 2
        expect(result.height).toBe(40);  // 20 * 2
      });

      it('handles zoom < 1', () => {
        const result = calculatePositionedBounds(bbox, textBoxSize, 'top', 'left', 0.5);

        expect(result.width).toBe(25);   // 50 * 0.5
        expect(result.height).toBe(10);  // 20 * 0.5
      });

    });

    it('returns complete bounds object', () => {
      const result = calculatePositionedBounds(bbox, textBoxSize, 'top', 'left', 1);

      expect(result).toHaveProperty('x');
      expect(result).toHaveProperty('y');
      expect(result).toHaveProperty('width');
      expect(result).toHaveProperty('height');
    });

  });

  // ============================================
  // createTextAlignmentStyle
  // ============================================

  describe('createTextAlignmentStyle(align, fontSize, lineHeight)', () => {

    it('creates style with all properties', () => {
      const result = createTextAlignmentStyle('center', 14, 1.5);

      expect(result.textAlign).toBe('center');
      expect(result.fontSize).toBe('14px');
      expect(result.lineHeight).toBe(1.5);
    });

    it('handles left alignment', () => {
      const result = createTextAlignmentStyle('left', 12, 1.2);

      expect(result.textAlign).toBe('left');
    });

    it('handles right alignment', () => {
      const result = createTextAlignmentStyle('right', 16, 1.8);

      expect(result.textAlign).toBe('right');
    });

    it('appends px to fontSize', () => {
      const result = createTextAlignmentStyle('center', 20, 1);

      expect(result.fontSize).toBe('20px');
    });

  });

  // ============================================
  // createExternalLabelStyle
  // ============================================

  describe('createExternalLabelStyle(fontSize, lineHeight, paddingTop, paddingBottom)', () => {

    it('creates style with all properties', () => {
      const result = createExternalLabelStyle(14, 1.5, 7, 4);

      expect(result.fontSize).toBe('14px');
      expect(result.lineHeight).toBe(1.5);
      expect(result.paddingTop).toBe('7px');
      expect(result.paddingBottom).toBe('4px');
    });

    it('appends px to padding values', () => {
      const result = createExternalLabelStyle(12, 1, 10, 5);

      expect(result.paddingTop).toBe('10px');
      expect(result.paddingBottom).toBe('5px');
    });

    it('handles zero padding', () => {
      const result = createExternalLabelStyle(14, 1.5, 0, 0);

      expect(result.paddingTop).toBe('0px');
      expect(result.paddingBottom).toBe('0px');
    });

  });

});
