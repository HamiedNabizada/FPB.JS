// tests/unit/rules/RuleUtils.test.js
import { describe, it, expect } from 'vitest';

import {
  checkIfItsWithinSystemLimits,
  moveOnTechnicalResource,
  getConnectionType,
  areAlreadyConnected
} from '../../../app/fpb/rules/RuleUtils.js';

describe('RuleUtils', () => {

  // ============================================
  // checkIfItsWithinSystemLimits
  // ============================================

  describe('checkIfItsWithinSystemLimits(shape, target, position)', () => {

    it('returns true when shape is completely inside target', () => {
      const shape = { width: 40, height: 40 };
      const target = { x: 200, y: 200, width: 400, height: 300 };
      const position = { x: 200, y: 200 }; // Center of target

      const result = checkIfItsWithinSystemLimits(shape, target, position);
      expect(result).toBe(true);
    });

    it('returns true when shape touches left edge', () => {
      const shape = { width: 40, height: 40 };
      const target = { x: 200, y: 200, width: 400, height: 300 };
      // Target left edge: 200 - 200 = 0
      // Shape at position x=20 means shape left edge at 20-20=0
      const position = { x: 20, y: 200 };

      const result = checkIfItsWithinSystemLimits(shape, target, position);
      expect(result).toBe(true);
    });

    it('returns true when shape touches right edge', () => {
      const shape = { width: 40, height: 40 };
      const target = { x: 200, y: 200, width: 400, height: 300 };
      // Target right edge: 200 + 200 = 400
      // Shape at position x=380 means shape right edge at 380+20=400
      const position = { x: 380, y: 200 };

      const result = checkIfItsWithinSystemLimits(shape, target, position);
      expect(result).toBe(true);
    });

    it('returns true when shape touches top edge', () => {
      const shape = { width: 40, height: 40 };
      const target = { x: 200, y: 200, width: 400, height: 300 };
      // Target top edge: 200 - 150 = 50
      const position = { x: 200, y: 70 };

      const result = checkIfItsWithinSystemLimits(shape, target, position);
      expect(result).toBe(true);
    });

    it('returns true when shape touches bottom edge', () => {
      const shape = { width: 40, height: 40 };
      const target = { x: 200, y: 200, width: 400, height: 300 };
      // Target bottom edge: 200 + 150 = 350
      const position = { x: 200, y: 330 };

      const result = checkIfItsWithinSystemLimits(shape, target, position);
      expect(result).toBe(true);
    });

    it('handles small shapes', () => {
      const shape = { width: 10, height: 10 };
      const target = { x: 100, y: 100, width: 200, height: 200 };
      const position = { x: 100, y: 100 };

      const result = checkIfItsWithinSystemLimits(shape, target, position);
      expect(result).toBe(true);
    });

    it('handles large shapes', () => {
      const shape = { width: 100, height: 100 };
      const target = { x: 200, y: 200, width: 400, height: 300 };
      const position = { x: 200, y: 200 };

      const result = checkIfItsWithinSystemLimits(shape, target, position);
      expect(result).toBe(true);
    });

  });

  // ============================================
  // moveOnTechnicalResource
  // ============================================

  describe('moveOnTechnicalResource(systemLimit, technicalResource, position)', () => {

    it('returns true when SystemLimit overlaps TechnicalResource from left', () => {
      const systemLimit = { width: 200, height: 150 };
      const technicalResource = { x: 300, y: 100, width: 80, height: 100 };
      // SystemLimit positioned so right edge overlaps TR left edge
      const position = { x: 250, y: 150 };

      const result = moveOnTechnicalResource(systemLimit, technicalResource, position);
      expect(result).toBe(true);
    });

    it('returns true when SystemLimit overlaps TechnicalResource from right', () => {
      const systemLimit = { width: 200, height: 150 };
      const technicalResource = { x: 100, y: 100, width: 80, height: 100 };
      // SystemLimit positioned so left edge overlaps TR right edge
      const position = { x: 250, y: 150 };

      const result = moveOnTechnicalResource(systemLimit, technicalResource, position);
      expect(result).toBe(true);
    });

    it('returns false when no overlap', () => {
      const systemLimit = { width: 200, height: 150 };
      const technicalResource = { x: 500, y: 100, width: 80, height: 100 };
      const position = { x: 100, y: 100 };

      const result = moveOnTechnicalResource(systemLimit, technicalResource, position);
      expect(result).toBe(false);
    });

    it('returns false when SystemLimit is above TechnicalResource', () => {
      const systemLimit = { width: 200, height: 150 };
      const technicalResource = { x: 200, y: 300, width: 80, height: 100 };
      const position = { x: 200, y: 100 };

      const result = moveOnTechnicalResource(systemLimit, technicalResource, position);
      expect(result).toBe(false);
    });

    it('returns false when SystemLimit is below TechnicalResource', () => {
      const systemLimit = { width: 200, height: 150 };
      const technicalResource = { x: 200, y: 50, width: 80, height: 100 };
      const position = { x: 200, y: 400 };

      const result = moveOnTechnicalResource(systemLimit, technicalResource, position);
      expect(result).toBe(false);
    });

  });

  // ============================================
  // getConnectionType
  // ============================================

  describe('getConnectionType(source, flowHint)', () => {

    it('returns Flow for null flowHint', () => {
      const result = getConnectionType({}, null);
      expect(result).toEqual({ type: 'fpb:Flow' });
    });

    it('returns Flow for undefined flowHint', () => {
      const result = getConnectionType({}, undefined);
      expect(result).toEqual({ type: 'fpb:Flow' });
    });

    it('returns ParallelFlow for Parallel hint', () => {
      const result = getConnectionType({}, 'Parallel');
      expect(result).toEqual({ type: 'fpb:ParallelFlow' });
    });

    it('returns AlternativeFlow for Alternative hint', () => {
      const result = getConnectionType({}, 'Alternative');
      expect(result).toEqual({ type: 'fpb:AlternativeFlow' });
    });

    it('returns Usage for Usage hint', () => {
      const result = getConnectionType({}, 'Usage');
      expect(result).toEqual({ type: 'fpb:Usage' });
    });

    it('returns Flow for unknown hint', () => {
      const result = getConnectionType({}, 'Unknown');
      expect(result).toEqual({ type: 'fpb:Flow' });
    });

    it('returns Flow for empty string hint', () => {
      const result = getConnectionType({}, '');
      expect(result).toEqual({ type: 'fpb:Flow' });
    });

  });

  // ============================================
  // areAlreadyConnected
  // ============================================

  describe('areAlreadyConnected(source, target)', () => {

    it('returns true when source has outgoing connection to target', () => {
      const target = { id: 'target_1' };
      const source = {
        outgoing: [
          {
            businessObject: {
              targetRef: { id: 'target_1' }
            }
          }
        ]
      };

      const result = areAlreadyConnected(source, target);
      expect(result).toBe(true);
    });

    it('returns false when source has no connection to target', () => {
      const target = { id: 'target_1' };
      const source = {
        outgoing: [
          {
            businessObject: {
              targetRef: { id: 'other_target' }
            }
          }
        ]
      };

      const result = areAlreadyConnected(source, target);
      expect(result).toBe(false);
    });

    it('returns false when source has no outgoing connections', () => {
      const target = { id: 'target_1' };
      const source = { outgoing: [] };

      const result = areAlreadyConnected(source, target);
      expect(result).toBe(false);
    });

    it('returns falsy when source.outgoing is undefined', () => {
      const target = { id: 'target_1' };
      const source = {};

      const result = areAlreadyConnected(source, target);
      expect(result).toBeFalsy();
    });

    it('returns true when one of multiple connections targets the element', () => {
      const target = { id: 'target_2' };
      const source = {
        outgoing: [
          { businessObject: { targetRef: { id: 'target_1' } } },
          { businessObject: { targetRef: { id: 'target_2' } } },
          { businessObject: { targetRef: { id: 'target_3' } } }
        ]
      };

      const result = areAlreadyConnected(source, target);
      expect(result).toBe(true);
    });

  });

});
