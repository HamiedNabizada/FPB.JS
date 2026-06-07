// tests/unit/core/FpbConstants.test.js
import { describe, it, expect } from 'vitest';

import {
  COLORS,
  STROKE_WIDTHS,
  MARKER_CONFIG,
  DASH_PATTERNS,
  LABEL_CONFIG,
  ELEMENT_TYPES,
  MARKER_TYPES
} from '../../../app/fpb/core/FpbConstants.js';

describe('FpbConstants', () => {

  // ============================================
  // COLORS - VDI 3682 Standard Colors
  // ============================================

  describe('COLORS', () => {

    it('defines Product color as red (#ed2028)', () => {
      expect(COLORS.FPB_PRODUCT).toBe('#ed2028');
    });

    it('defines Energy color as light blue (#6e9ad1)', () => {
      expect(COLORS.FPB_ENERGY).toBe('#6e9ad1');
    });

    it('defines Information color as dark blue (#3050a2)', () => {
      expect(COLORS.FPB_INFORMATION).toBe('#3050a2');
    });

    it('defines ProcessOperator color as green (#13ae4d)', () => {
      expect(COLORS.FPB_PROCESS_OPERATOR).toBe('#13ae4d');
    });

    it('defines TechnicalResource color as gray (#888889)', () => {
      expect(COLORS.FPB_TECHNICAL_RESOURCE).toBe('#888889');
    });

    it('defines stroke color as black (#000000)', () => {
      expect(COLORS.FPB_STROKE).toBe('#000000');
    });

    it('all colors are valid hex color codes', () => {
      const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
      Object.values(COLORS).forEach(color => {
        expect(color).toMatch(hexColorRegex);
      });
    });

  });

  // ============================================
  // STROKE_WIDTHS
  // ============================================

  describe('STROKE_WIDTHS', () => {

    it('defines DEFAULT stroke width as 2', () => {
      expect(STROKE_WIDTHS.DEFAULT).toBe(2);
    });

    it('defines CONNECTION stroke width as 2', () => {
      expect(STROKE_WIDTHS.CONNECTION).toBe(2);
    });

  });

  // ============================================
  // MARKER_CONFIG
  // ============================================

  describe('MARKER_CONFIG', () => {

    it('has viewBox of "0 0 20 20"', () => {
      expect(MARKER_CONFIG.viewBox).toBe('0 0 20 20');
    });

    it('has scale of 0.5', () => {
      expect(MARKER_CONFIG.scale).toBe(0.5);
    });

    it('has defaultAttrs with fill black', () => {
      expect(MARKER_CONFIG.defaultAttrs.fill).toBe('black');
    });

    it('has defaultAttrs with strokeWidth 1', () => {
      expect(MARKER_CONFIG.defaultAttrs.strokeWidth).toBe(1);
    });

    it('has defaultAttrs with strokeLinecap round', () => {
      expect(MARKER_CONFIG.defaultAttrs.strokeLinecap).toBe('round');
    });

    it('has defaultAttrs with strokeDasharray for Safari fix', () => {
      expect(MARKER_CONFIG.defaultAttrs.strokeDasharray).toEqual([10000, 1]);
    });

  });

  // ============================================
  // DASH_PATTERNS
  // ============================================

  describe('DASH_PATTERNS', () => {

    it('defines SYSTEM_LIMIT dash pattern', () => {
      expect(DASH_PATTERNS.SYSTEM_LIMIT).toBe('10, 12');
    });

    it('defines USAGE dash pattern', () => {
      expect(DASH_PATTERNS.USAGE).toBe('10, 12');
    });

  });

  // ============================================
  // LABEL_CONFIG
  // ============================================

  describe('LABEL_CONFIG', () => {

    it('has defaultWidth of 100', () => {
      expect(LABEL_CONFIG.defaultWidth).toBe(100);
    });

    it('has default padding of 5', () => {
      expect(LABEL_CONFIG.padding.default).toBe(5);
    });

    describe('processOperator padding', () => {

      it('has bottom padding of 5', () => {
        expect(LABEL_CONFIG.padding.processOperator.bottom).toBe(5);
      });

      it('has left padding of 5', () => {
        expect(LABEL_CONFIG.padding.processOperator.left).toBe(5);
      });

      it('has right padding of 3', () => {
        expect(LABEL_CONFIG.padding.processOperator.right).toBe(3);
      });

      it('has top as a function', () => {
        expect(typeof LABEL_CONFIG.padding.processOperator.top).toBe('function');
      });

      it('top function returns double padding for long names', () => {
        // When name length >= 19 and topPadding is 18, should return 36
        const mockElement = { _textRenderer: null };
        const longName = 'This is a very long name!'; // 25 characters

        const result = LABEL_CONFIG.padding.processOperator.top(mockElement, longName);
        // Without _textRenderer, topPadding defaults to 18
        // Since name.length (25) >= 19 and topPadding === 18, should return 36
        expect(result).toBe(36);
      });

      it('top function returns normal padding for short names', () => {
        const mockElement = { _textRenderer: null };
        const shortName = 'Short';

        const result = LABEL_CONFIG.padding.processOperator.top(mockElement, shortName);
        // Without _textRenderer, topPadding defaults to 18
        // Since name.length (5) < 19, should return 18
        expect(result).toBe(18);
      });

    });

  });

  // ============================================
  // ELEMENT_TYPES
  // ============================================

  describe('ELEMENT_TYPES', () => {

    describe('State types', () => {
      it('defines PRODUCT', () => {
        expect(ELEMENT_TYPES.PRODUCT).toBe('fpb:Product');
      });

      it('defines ENERGY', () => {
        expect(ELEMENT_TYPES.ENERGY).toBe('fpb:Energy');
      });

      it('defines INFORMATION', () => {
        expect(ELEMENT_TYPES.INFORMATION).toBe('fpb:Information');
      });
    });

    describe('Process element types', () => {
      it('defines PROCESS_OPERATOR', () => {
        expect(ELEMENT_TYPES.PROCESS_OPERATOR).toBe('fpb:ProcessOperator');
      });

      it('defines TECHNICAL_RESOURCE', () => {
        expect(ELEMENT_TYPES.TECHNICAL_RESOURCE).toBe('fpb:TechnicalResource');
      });

      it('defines SYSTEM_LIMIT', () => {
        expect(ELEMENT_TYPES.SYSTEM_LIMIT).toBe('fpb:SystemLimit');
      });
    });

    describe('Connection types', () => {
      it('defines FLOW', () => {
        expect(ELEMENT_TYPES.FLOW).toBe('fpb:Flow');
      });

      it('defines ALTERNATIVE_FLOW', () => {
        expect(ELEMENT_TYPES.ALTERNATIVE_FLOW).toBe('fpb:AlternativeFlow');
      });

      it('defines PARALLEL_FLOW', () => {
        expect(ELEMENT_TYPES.PARALLEL_FLOW).toBe('fpb:ParallelFlow');
      });

      it('defines USAGE', () => {
        expect(ELEMENT_TYPES.USAGE).toBe('fpb:Usage');
      });
    });

    it('all types start with fpb: prefix', () => {
      Object.values(ELEMENT_TYPES).forEach(type => {
        expect(type).toMatch(/^fpb:/);
      });
    });

  });

  // ============================================
  // MARKER_TYPES
  // ============================================

  describe('MARKER_TYPES', () => {

    it('defines ARROW_END', () => {
      expect(MARKER_TYPES.ARROW_END).toBe('Arrow-At-End');
    });

    it('defines ARROW_START', () => {
      expect(MARKER_TYPES.ARROW_START).toBe('Arrow-At-Start');
    });

  });

});
