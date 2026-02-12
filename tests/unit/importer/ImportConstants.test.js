// tests/unit/importer/ImportConstants.test.js
import { describe, it, expect } from 'vitest';

import {
  FPB_TYPES,
  TYPE_GROUPS,
  IMPORT_TIMING,
  FALLBACK_VALUES,
  IMPORT_ERRORS,
  IMPORT_EVENTS
} from '../../../app/fpb/importer/ImportConstants.js';

describe('ImportConstants', () => {

  // ============================================
  // FPB_TYPES
  // ============================================

  describe('FPB_TYPES', () => {

    it('defines all 14 FPB types', () => {
      expect(Object.keys(FPB_TYPES)).toHaveLength(14);
    });

    it('defines structural types', () => {
      expect(FPB_TYPES.PROJECT).toBe('fpb:Project');
      expect(FPB_TYPES.PROCESS).toBe('fpb:Process');
      expect(FPB_TYPES.SYSTEM_LIMIT).toBe('fpb:SystemLimit');
    });

    it('defines process types', () => {
      expect(FPB_TYPES.PROCESS_OPERATOR).toBe('fpb:ProcessOperator');
      expect(FPB_TYPES.TECHNICAL_RESOURCE).toBe('fpb:TechnicalResource');
    });

    it('defines state types', () => {
      expect(FPB_TYPES.PRODUCT).toBe('fpb:Product');
      expect(FPB_TYPES.INFORMATION).toBe('fpb:Information');
      expect(FPB_TYPES.ENERGY).toBe('fpb:Energy');
    });

    it('defines connection types', () => {
      expect(FPB_TYPES.FLOW).toBe('fpb:Flow');
      expect(FPB_TYPES.ALTERNATIVE_FLOW).toBe('fpb:AlternativeFlow');
      expect(FPB_TYPES.PARALLEL_FLOW).toBe('fpb:ParallelFlow');
      expect(FPB_TYPES.USAGE).toBe('fpb:Usage');
    });

    it('defines characteristic types', () => {
      expect(FPB_TYPES.CHARACTERISTICS).toBe('fpbch:Characteristics');
      expect(FPB_TYPES.VALIDITY_LIMITS).toBe('fpbch:ValidityLimits');
    });

    it('all FPB types have fpb: or fpbch: prefix', () => {
      Object.values(FPB_TYPES).forEach(type => {
        expect(type).toMatch(/^fpb(ch)?:/);
      });
    });

  });

  // ============================================
  // TYPE_GROUPS
  // ============================================

  describe('TYPE_GROUPS', () => {

    describe('STATES', () => {

      it('contains 3 state types', () => {
        expect(TYPE_GROUPS.STATES).toHaveLength(3);
      });

      it('contains Product, Information, Energy', () => {
        expect(TYPE_GROUPS.STATES).toContain(FPB_TYPES.PRODUCT);
        expect(TYPE_GROUPS.STATES).toContain(FPB_TYPES.INFORMATION);
        expect(TYPE_GROUPS.STATES).toContain(FPB_TYPES.ENERGY);
      });

    });

    describe('FLOWS', () => {

      it('contains 3 flow types', () => {
        expect(TYPE_GROUPS.FLOWS).toHaveLength(3);
      });

      it('contains Flow, AlternativeFlow, ParallelFlow', () => {
        expect(TYPE_GROUPS.FLOWS).toContain(FPB_TYPES.FLOW);
        expect(TYPE_GROUPS.FLOWS).toContain(FPB_TYPES.ALTERNATIVE_FLOW);
        expect(TYPE_GROUPS.FLOWS).toContain(FPB_TYPES.PARALLEL_FLOW);
      });

    });

    describe('CONNECTIONS', () => {

      it('contains 4 connection types', () => {
        expect(TYPE_GROUPS.CONNECTIONS).toHaveLength(4);
      });

      it('includes all flows plus Usage', () => {
        TYPE_GROUPS.FLOWS.forEach(flow => {
          expect(TYPE_GROUPS.CONNECTIONS).toContain(flow);
        });
        expect(TYPE_GROUPS.CONNECTIONS).toContain(FPB_TYPES.USAGE);
      });

    });

    describe('SHAPES', () => {

      it('contains 6 shape types', () => {
        expect(TYPE_GROUPS.SHAPES).toHaveLength(6);
      });

      it('includes all states', () => {
        TYPE_GROUPS.STATES.forEach(state => {
          expect(TYPE_GROUPS.SHAPES).toContain(state);
        });
      });

      it('includes SystemLimit, ProcessOperator, TechnicalResource', () => {
        expect(TYPE_GROUPS.SHAPES).toContain(FPB_TYPES.SYSTEM_LIMIT);
        expect(TYPE_GROUPS.SHAPES).toContain(FPB_TYPES.PROCESS_OPERATOR);
        expect(TYPE_GROUPS.SHAPES).toContain(FPB_TYPES.TECHNICAL_RESOURCE);
      });

    });

  });

  // ============================================
  // IMPORT_TIMING
  // ============================================

  describe('IMPORT_TIMING', () => {

    it('defines UI_INITIALIZATION_DELAY', () => {
      expect(IMPORT_TIMING.UI_INITIALIZATION_DELAY).toBeDefined();
    });

    it('UI_INITIALIZATION_DELAY is 2000ms', () => {
      expect(IMPORT_TIMING.UI_INITIALIZATION_DELAY).toBe(2000);
    });

    it('delay is a reasonable value (1000-5000ms)', () => {
      expect(IMPORT_TIMING.UI_INITIALIZATION_DELAY).toBeGreaterThanOrEqual(1000);
      expect(IMPORT_TIMING.UI_INITIALIZATION_DELAY).toBeLessThanOrEqual(5000);
    });

  });

  // ============================================
  // FALLBACK_VALUES
  // ============================================

  describe('FALLBACK_VALUES', () => {

    describe('POSITION', () => {

      it('defines base positions', () => {
        expect(FALLBACK_VALUES.POSITION.X_BASE).toBe(100);
        expect(FALLBACK_VALUES.POSITION.Y_BASE).toBe(100);
      });

      it('defines random range', () => {
        expect(FALLBACK_VALUES.POSITION.X_RANDOM).toBe(400);
        expect(FALLBACK_VALUES.POSITION.Y_RANDOM).toBe(300);
      });

    });

    describe('SIZE', () => {

      it('defines default width', () => {
        expect(FALLBACK_VALUES.SIZE.WIDTH).toBe(50);
      });

      it('defines default height', () => {
        expect(FALLBACK_VALUES.SIZE.HEIGHT).toBe(50);
      });

    });

  });

  // ============================================
  // IMPORT_ERRORS
  // ============================================

  describe('IMPORT_ERRORS', () => {

    it('defines all 5 error types', () => {
      expect(Object.keys(IMPORT_ERRORS)).toHaveLength(5);
    });

    it('defines INVALID_DATA_STRUCTURE', () => {
      expect(IMPORT_ERRORS.INVALID_DATA_STRUCTURE).toBe('INVALID_DATA_STRUCTURE');
    });

    it('defines MISSING_PROJECT_DEFINITION', () => {
      expect(IMPORT_ERRORS.MISSING_PROJECT_DEFINITION).toBe('MISSING_PROJECT_DEFINITION');
    });

    it('defines MISSING_VISUAL_INFORMATION', () => {
      expect(IMPORT_ERRORS.MISSING_VISUAL_INFORMATION).toBe('MISSING_VISUAL_INFORMATION');
    });

    it('defines DEPENDENCY_RESOLUTION_FAILED', () => {
      expect(IMPORT_ERRORS.DEPENDENCY_RESOLUTION_FAILED).toBe('DEPENDENCY_RESOLUTION_FAILED');
    });

    it('defines UNEXPECTED_ERROR', () => {
      expect(IMPORT_ERRORS.UNEXPECTED_ERROR).toBe('UNEXPECTED_ERROR');
    });

    it('all values are SCREAMING_SNAKE_CASE strings', () => {
      Object.values(IMPORT_ERRORS).forEach(value => {
        expect(value).toMatch(/^[A-Z_]+$/);
      });
    });

  });

  // ============================================
  // IMPORT_EVENTS
  // ============================================

  describe('IMPORT_EVENTS', () => {

    it('defines all 5 event types', () => {
      expect(Object.keys(IMPORT_EVENTS)).toHaveLength(5);
    });

    it('defines IMPORT_REQUEST', () => {
      expect(IMPORT_EVENTS.IMPORT_REQUEST).toBe('FPBJS.import');
    });

    it('defines IMPORT_ERROR', () => {
      expect(IMPORT_EVENTS.IMPORT_ERROR).toBe('import.error');
    });

    it('defines PROJECT_ADDED', () => {
      expect(IMPORT_EVENTS.PROJECT_ADDED).toBe('dataStore.addedProjectDefinition');
    });

    it('defines NEW_PROCESS events', () => {
      expect(IMPORT_EVENTS.NEW_PROCESS).toBe('dataStore.newProcess');
      expect(IMPORT_EVENTS.LAYER_PANEL_NEW_PROCESS).toBe('layerPanel.newProcess');
    });

  });

});
