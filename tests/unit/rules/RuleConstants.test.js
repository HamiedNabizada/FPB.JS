// tests/unit/rules/RuleConstants.test.js
import { describe, it, expect } from 'vitest';

import {
  ELEMENT_TYPES,
  ELEMENT_GROUPS,
  FLOW_HINTS,
  RULE_PRIORITIES
} from '../../../app/fpb/rules/RuleConstants.js';

describe('RuleConstants', () => {

  // ============================================
  // ELEMENT_TYPES
  // ============================================

  describe('ELEMENT_TYPES', () => {

    describe('States', () => {
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

    describe('Process Elements', () => {
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

    describe('Connections', () => {
      it('defines FLOW', () => {
        expect(ELEMENT_TYPES.FLOW).toBe('fpb:Flow');
      });

      it('defines PARALLEL_FLOW', () => {
        expect(ELEMENT_TYPES.PARALLEL_FLOW).toBe('fpb:ParallelFlow');
      });

      it('defines ALTERNATIVE_FLOW', () => {
        expect(ELEMENT_TYPES.ALTERNATIVE_FLOW).toBe('fpb:AlternativeFlow');
      });

      it('defines USAGE', () => {
        expect(ELEMENT_TYPES.USAGE).toBe('fpb:Usage');
      });
    });

    describe('Meta Types', () => {
      it('defines PROCESS', () => {
        expect(ELEMENT_TYPES.PROCESS).toBe('fpb:Process');
      });

      it('defines LABEL', () => {
        expect(ELEMENT_TYPES.LABEL).toBe('label');
      });
    });

  });

  // ============================================
  // ELEMENT_GROUPS
  // ============================================

  describe('ELEMENT_GROUPS', () => {

    describe('STATES', () => {
      it('contains exactly 3 state types', () => {
        expect(ELEMENT_GROUPS.STATES).toHaveLength(3);
      });

      it('contains Product, Energy, Information', () => {
        expect(ELEMENT_GROUPS.STATES).toContain('fpb:Product');
        expect(ELEMENT_GROUPS.STATES).toContain('fpb:Energy');
        expect(ELEMENT_GROUPS.STATES).toContain('fpb:Information');
      });
    });

    describe('PROCESS_ELEMENTS', () => {
      it('contains exactly 3 process element types', () => {
        expect(ELEMENT_GROUPS.PROCESS_ELEMENTS).toHaveLength(3);
      });

      it('contains ProcessOperator, TechnicalResource, SystemLimit', () => {
        expect(ELEMENT_GROUPS.PROCESS_ELEMENTS).toContain('fpb:ProcessOperator');
        expect(ELEMENT_GROUPS.PROCESS_ELEMENTS).toContain('fpb:TechnicalResource');
        expect(ELEMENT_GROUPS.PROCESS_ELEMENTS).toContain('fpb:SystemLimit');
      });
    });

    describe('CONNECTIONS', () => {
      it('contains exactly 4 connection types', () => {
        expect(ELEMENT_GROUPS.CONNECTIONS).toHaveLength(4);
      });

      it('contains Flow, ParallelFlow, AlternativeFlow, Usage', () => {
        expect(ELEMENT_GROUPS.CONNECTIONS).toContain('fpb:Flow');
        expect(ELEMENT_GROUPS.CONNECTIONS).toContain('fpb:ParallelFlow');
        expect(ELEMENT_GROUPS.CONNECTIONS).toContain('fpb:AlternativeFlow');
        expect(ELEMENT_GROUPS.CONNECTIONS).toContain('fpb:Usage');
      });
    });

    describe('FLOWS', () => {
      it('contains exactly 3 flow types (no Usage)', () => {
        expect(ELEMENT_GROUPS.FLOWS).toHaveLength(3);
      });

      it('contains Flow, ParallelFlow, AlternativeFlow', () => {
        expect(ELEMENT_GROUPS.FLOWS).toContain('fpb:Flow');
        expect(ELEMENT_GROUPS.FLOWS).toContain('fpb:ParallelFlow');
        expect(ELEMENT_GROUPS.FLOWS).toContain('fpb:AlternativeFlow');
      });

      it('does not contain Usage', () => {
        expect(ELEMENT_GROUPS.FLOWS).not.toContain('fpb:Usage');
      });
    });

    describe('INSIDE_SYSTEM_LIMIT', () => {
      it('contains states and ProcessOperator', () => {
        expect(ELEMENT_GROUPS.INSIDE_SYSTEM_LIMIT).toContain('fpb:Product');
        expect(ELEMENT_GROUPS.INSIDE_SYSTEM_LIMIT).toContain('fpb:Energy');
        expect(ELEMENT_GROUPS.INSIDE_SYSTEM_LIMIT).toContain('fpb:Information');
        expect(ELEMENT_GROUPS.INSIDE_SYSTEM_LIMIT).toContain('fpb:ProcessOperator');
      });

      it('does not contain TechnicalResource', () => {
        expect(ELEMENT_GROUPS.INSIDE_SYSTEM_LIMIT).not.toContain('fpb:TechnicalResource');
      });

      it('does not contain SystemLimit', () => {
        expect(ELEMENT_GROUPS.INSIDE_SYSTEM_LIMIT).not.toContain('fpb:SystemLimit');
      });
    });

    describe('OUTSIDE_SYSTEM_LIMIT', () => {
      it('contains only TechnicalResource', () => {
        expect(ELEMENT_GROUPS.OUTSIDE_SYSTEM_LIMIT).toHaveLength(1);
        expect(ELEMENT_GROUPS.OUTSIDE_SYSTEM_LIMIT).toContain('fpb:TechnicalResource');
      });
    });

  });

  // ============================================
  // FLOW_HINTS
  // ============================================

  describe('FLOW_HINTS', () => {

    it('defines PARALLEL', () => {
      expect(FLOW_HINTS.PARALLEL).toBe('Parallel');
    });

    it('defines ALTERNATIVE', () => {
      expect(FLOW_HINTS.ALTERNATIVE).toBe('Alternative');
    });

    it('defines USAGE', () => {
      expect(FLOW_HINTS.USAGE).toBe('Usage');
    });

  });

  // ============================================
  // RULE_PRIORITIES
  // ============================================

  describe('RULE_PRIORITIES', () => {

    it('defines HIGH as 1500', () => {
      expect(RULE_PRIORITIES.HIGH).toBe(1500);
    });

  });

});
