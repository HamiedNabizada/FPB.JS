// tests/unit/context-pad/ContextPadConstants.test.js
import { describe, it, expect } from 'vitest';

import {
  ELEMENT_TYPES,
  CONTEXT_PAD_ICONS,
  FLOW_HINTS,
  FLOW_TYPES,
  ENTRY_GROUPS,
  ENTRY_IDS,
  TOOLTIP_KEYS,
  LAYOUT_CONSTANTS
} from '../../../app/fpb/context-pad/ContextPadConstants.js';

describe('ContextPadConstants', () => {

  // ============================================
  // ELEMENT_TYPES
  // ============================================

  describe('ELEMENT_TYPES', () => {

    it('defines all 5 element types', () => {
      expect(Object.keys(ELEMENT_TYPES)).toHaveLength(5);
    });

    it('defines STATE type', () => {
      expect(ELEMENT_TYPES.STATE).toBe('fpb:State');
    });

    it('defines PROCESS_OPERATOR type', () => {
      expect(ELEMENT_TYPES.PROCESS_OPERATOR).toBe('fpb:ProcessOperator');
    });

    it('defines TECHNICAL_RESOURCE type', () => {
      expect(ELEMENT_TYPES.TECHNICAL_RESOURCE).toBe('fpb:TechnicalResource');
    });

    it('defines SYSTEM_LIMIT type', () => {
      expect(ELEMENT_TYPES.SYSTEM_LIMIT).toBe('fpb:SystemLimit');
    });

    it('defines LABEL type', () => {
      expect(ELEMENT_TYPES.LABEL).toBe('label');
    });

    it('FPB types have fpb: prefix except LABEL', () => {
      Object.entries(ELEMENT_TYPES).forEach(([key, value]) => {
        if (key !== 'LABEL') {
          expect(value).toMatch(/^fpb:/);
        }
      });
    });

  });

  // ============================================
  // CONTEXT_PAD_ICONS
  // ============================================

  describe('CONTEXT_PAD_ICONS', () => {

    it('defines all 8 icons', () => {
      expect(Object.keys(CONTEXT_PAD_ICONS)).toHaveLength(8);
    });

    it('defines REMOVE icon', () => {
      expect(CONTEXT_PAD_ICONS.REMOVE).toBe('context-pad-icon-remove');
    });

    it('defines connection icons', () => {
      expect(CONTEXT_PAD_ICONS.CONNECT).toBe('context-pad-icon-fpbconnection');
      expect(CONTEXT_PAD_ICONS.PARALLEL_CONNECTION).toBe('context-pad-icon-fpbparallelconnection');
      expect(CONTEXT_PAD_ICONS.ALTERNATIVE_CONNECTION).toBe('context-pad-icon-fpbalternativeconnection');
      expect(CONTEXT_PAD_ICONS.USAGE).toBe('context-pad-icon-fpbusage');
    });

    it('defines process icons', () => {
      expect(CONTEXT_PAD_ICONS.DECOMPOSE).toBe('context-pad-icon-fpbdecompose');
      expect(CONTEXT_PAD_ICONS.COMPOSE).toBe('context-pad-icon-fpbcompose');
      expect(CONTEXT_PAD_ICONS.SWITCH_UP).toBe('context-pad-icon-fpbswitchup');
    });

    it('all icons follow context-pad-icon-* convention', () => {
      Object.values(CONTEXT_PAD_ICONS).forEach(icon => {
        expect(icon).toMatch(/^context-pad-icon-/);
      });
    });

  });

  // ============================================
  // FLOW_HINTS
  // ============================================

  describe('FLOW_HINTS', () => {

    it('defines all 4 flow hints', () => {
      expect(Object.keys(FLOW_HINTS)).toHaveLength(4);
    });

    it('defines basic Flow', () => {
      expect(FLOW_HINTS.FLOW).toBe('Flow');
    });

    it('defines Parallel', () => {
      expect(FLOW_HINTS.PARALLEL).toBe('Parallel');
    });

    it('defines Alternative', () => {
      expect(FLOW_HINTS.ALTERNATIVE).toBe('Alternative');
    });

    it('defines Usage', () => {
      expect(FLOW_HINTS.USAGE).toBe('Usage');
    });

    it('all hints are PascalCase strings', () => {
      Object.values(FLOW_HINTS).forEach(hint => {
        expect(hint).toMatch(/^[A-Z][a-z]+$/);
      });
    });

  });

  // ============================================
  // FLOW_TYPES
  // ============================================

  describe('FLOW_TYPES', () => {

    it('defines 2 flow types', () => {
      expect(Object.keys(FLOW_TYPES)).toHaveLength(2);
    });

    it('defines ALTERNATIVE_FLOW', () => {
      expect(FLOW_TYPES.ALTERNATIVE_FLOW).toBe('fpb:AlternativeFlow');
    });

    it('defines PARALLEL_FLOW', () => {
      expect(FLOW_TYPES.PARALLEL_FLOW).toBe('fpb:ParallelFlow');
    });

  });

  // ============================================
  // ENTRY_GROUPS
  // ============================================

  describe('ENTRY_GROUPS', () => {

    it('defines EDIT group', () => {
      expect(ENTRY_GROUPS.EDIT).toBe('edit');
    });

  });

  // ============================================
  // ENTRY_IDS
  // ============================================

  describe('ENTRY_IDS', () => {

    it('defines all 7 entry IDs', () => {
      expect(Object.keys(ENTRY_IDS)).toHaveLength(7);
    });

    it('defines DELETE', () => {
      expect(ENTRY_IDS.DELETE).toBe('delete');
    });

    it('defines CONNECT', () => {
      expect(ENTRY_IDS.CONNECT).toBe('connect');
    });

    it('defines connection variants', () => {
      expect(ENTRY_IDS.CONNECT_PARALLEL).toBe('connect_parallel');
      expect(ENTRY_IDS.CONNECT_ALTERNATIVE).toBe('connect_alternative');
      expect(ENTRY_IDS.CONNECT_USAGE).toBe('connect_usage');
    });

    it('defines process entries', () => {
      expect(ENTRY_IDS.DECOMPOSE).toBe('decompose');
      expect(ENTRY_IDS.COMPOSE).toBe('compose');
    });

    it('all IDs are lowercase with underscores', () => {
      Object.values(ENTRY_IDS).forEach(id => {
        expect(id).toMatch(/^[a-z_]+$/);
      });
    });

  });

  // ============================================
  // TOOLTIP_KEYS
  // ============================================

  describe('TOOLTIP_KEYS', () => {

    it('defines all 12 tooltip keys', () => {
      expect(Object.keys(TOOLTIP_KEYS)).toHaveLength(12);
    });

    it('defines REMOVE tooltip', () => {
      expect(TOOLTIP_KEYS.REMOVE).toBe('Remove {type}');
    });

    it('defines connection tooltips', () => {
      expect(TOOLTIP_KEYS.CONNECT_WITH_PROCESS_OPERATOR).toBe('Connect {type} with ProcessOperator');
      expect(TOOLTIP_KEYS.CONNECT_WITH_STATES).toBe('Connect {type} with Product, Energy or Information');
      expect(TOOLTIP_KEYS.CONNECT_PROCESS_OPERATOR_WITH_TR).toBe('Connect Process Operator with a Technical Resource');
      expect(TOOLTIP_KEYS.CONNECT_TR_WITH_PROCESS_OPERATOR).toBe('Connect Technical Resource with a Process Operator');
    });

    it('defines flow tooltips', () => {
      expect(TOOLTIP_KEYS.PARALLEL_PROCESS).toBe('Parallel Process');
      expect(TOOLTIP_KEYS.ALTERNATIVE_PROCESS).toBe('Alternative Process');
      expect(TOOLTIP_KEYS.PARALLEL_USED).toBe('Parallel used {type}');
      expect(TOOLTIP_KEYS.ALTERNATIVE_FLOW).toBe('Alternative Flow');
    });

    it('defines process tooltips', () => {
      expect(TOOLTIP_KEYS.DECOMPOSE_PROCESS_OPERATOR).toBe('Decompose this ProcessOperator');
      expect(TOOLTIP_KEYS.SWITCH_TO_PARENT).toBe('Switch to parent process');
      expect(TOOLTIP_KEYS.COMPOSE_SYSTEM_LIMIT).toBe('Compose SystemLimit');
    });

  });

  // ============================================
  // LAYOUT_CONSTANTS
  // ============================================

  describe('LAYOUT_CONSTANTS', () => {

    it('defines MIN_DISTANCE', () => {
      expect(LAYOUT_CONSTANTS.MIN_DISTANCE).toBe(50);
    });

    it('defines HALF_ELEMENT_OFFSET', () => {
      expect(LAYOUT_CONSTANTS.HALF_ELEMENT_OFFSET).toBe(2);
    });

    it('MIN_DISTANCE is reasonable value', () => {
      expect(LAYOUT_CONSTANTS.MIN_DISTANCE).toBeGreaterThan(0);
      expect(LAYOUT_CONSTANTS.MIN_DISTANCE).toBeLessThan(200);
    });

  });

});
