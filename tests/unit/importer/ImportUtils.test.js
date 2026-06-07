// tests/unit/importer/ImportUtils.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ArrayUtils,
  TypeUtils,
  LookupUtils,
  VisualUtils,
  ValidationUtils
} from '../../../app/fpb/importer/ImportUtils.js';

import { FPB_TYPES, FALLBACK_VALUES } from '../../../app/fpb/importer/ImportConstants.js';

describe('ImportUtils', () => {

  // ============================================
  // ArrayUtils
  // ============================================

  describe('ArrayUtils', () => {

    describe('ensureArray()', () => {

      it('returns same array if already an array', () => {
        const arr = [1, 2, 3];
        expect(ArrayUtils.ensureArray(arr)).toBe(arr);
      });

      it('wraps single value in array', () => {
        expect(ArrayUtils.ensureArray('test')).toEqual(['test']);
      });

      it('wraps object in array', () => {
        const obj = { id: 1 };
        expect(ArrayUtils.ensureArray(obj)).toEqual([obj]);
      });

      it('returns empty array for null', () => {
        expect(ArrayUtils.ensureArray(null)).toEqual([]);
      });

      it('returns empty array for undefined', () => {
        expect(ArrayUtils.ensureArray(undefined)).toEqual([]);
      });

      it('returns empty array for falsy 0', () => {
        // Note: ensureArray uses truthy check, so 0 is treated as empty
        expect(ArrayUtils.ensureArray(0)).toEqual([]);
      });

      it('wraps empty string in array', () => {
        expect(ArrayUtils.ensureArray('')).toEqual([]);
      });

    });

    describe('safeReplaceInArray()', () => {

      it('removes old item and adds new item', () => {
        const arr = ['a', 'b', 'c'];
        ArrayUtils.safeReplaceInArray(arr, 'b', 'd');
        expect(arr).toEqual(['a', 'c', 'd']);
      });

      it('only removes old item if no new item provided', () => {
        const arr = ['a', 'b', 'c'];
        ArrayUtils.safeReplaceInArray(arr, 'b', null);
        expect(arr).toEqual(['a', 'c']);
      });

      it('only adds new item if old item not found', () => {
        const arr = ['a', 'b'];
        ArrayUtils.safeReplaceInArray(arr, 'x', 'c');
        expect(arr).toEqual(['a', 'b', 'c']);
      });

      it('does not add duplicate item', () => {
        const arr = ['a', 'b', 'c'];
        ArrayUtils.safeReplaceInArray(arr, 'b', 'a');
        expect(arr).toEqual(['a', 'c']);
      });

      it('logs warning for non-array input', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        ArrayUtils.safeReplaceInArray('not-array', 'a', 'b');
        expect(console.warn).toHaveBeenCalled();
      });

    });

  });

  // ============================================
  // TypeUtils
  // ============================================

  describe('TypeUtils', () => {

    describe('isStringLike()', () => {

      it('returns true for primitive string', () => {
        expect(TypeUtils.isStringLike('hello')).toBe(true);
      });

      it('returns true for String object', () => {
        expect(TypeUtils.isStringLike(new String('hello'))).toBe(true);
      });

      it('returns false for number', () => {
        expect(TypeUtils.isStringLike(123)).toBe(false);
      });

      it('returns false for object', () => {
        expect(TypeUtils.isStringLike({ text: 'hello' })).toBe(false);
      });

      it('returns false for null', () => {
        expect(TypeUtils.isStringLike(null)).toBe(false);
      });

      it('returns false for undefined', () => {
        expect(TypeUtils.isStringLike(undefined)).toBe(false);
      });

      it('returns true for empty string', () => {
        expect(TypeUtils.isStringLike('')).toBe(true);
      });

    });

    describe('isValidFpbType()', () => {

      it('returns true when $type matches expected', () => {
        const obj = { $type: 'fpb:Product' };
        expect(TypeUtils.isValidFpbType(obj, 'fpb:Product')).toBe(true);
      });

      it('returns false when $type does not match', () => {
        const obj = { $type: 'fpb:Energy' };
        expect(TypeUtils.isValidFpbType(obj, 'fpb:Product')).toBe(false);
      });

      it('returns falsy for null object', () => {
        expect(TypeUtils.isValidFpbType(null, 'fpb:Product')).toBeFalsy();
      });

      it('returns false for object without $type', () => {
        expect(TypeUtils.isValidFpbType({ name: 'test' }, 'fpb:Product')).toBe(false);
      });

    });

    describe('getFpbType()', () => {

      it('returns $type value', () => {
        const obj = { $type: 'fpb:ProcessOperator' };
        expect(TypeUtils.getFpbType(obj)).toBe('fpb:ProcessOperator');
      });

      it('returns null for null object', () => {
        expect(TypeUtils.getFpbType(null)).toBeNull();
      });

      it('returns null for object without $type', () => {
        expect(TypeUtils.getFpbType({ name: 'test' })).toBeNull();
      });

    });

  });

  // ============================================
  // LookupUtils
  // ============================================

  describe('LookupUtils', () => {

    describe('createElementMap()', () => {

      it('creates Map from array of elements', () => {
        const elements = [
          { id: 'elem1', name: 'First' },
          { id: 'elem2', name: 'Second' }
        ];
        const map = LookupUtils.createElementMap(elements);

        expect(map).toBeInstanceOf(Map);
        expect(map.size).toBe(2);
      });

      it('maps elements by id', () => {
        const elements = [
          { id: 'elem1', name: 'First' },
          { id: 'elem2', name: 'Second' }
        ];
        const map = LookupUtils.createElementMap(elements);

        expect(map.get('elem1').name).toBe('First');
        expect(map.get('elem2').name).toBe('Second');
      });

      it('skips elements without id', () => {
        const elements = [
          { id: 'elem1' },
          { name: 'no-id' },
          { id: 'elem2' }
        ];
        const map = LookupUtils.createElementMap(elements);

        expect(map.size).toBe(2);
      });

      it('returns empty Map for non-array', () => {
        const map = LookupUtils.createElementMap('not-array');
        expect(map.size).toBe(0);
      });

      it('returns empty Map for null', () => {
        const map = LookupUtils.createElementMap(null);
        expect(map.size).toBe(0);
      });

    });

    describe('findElementById()', () => {

      it('finds element in Map', () => {
        const map = new Map([
          ['elem1', { id: 'elem1', name: 'First' }]
        ]);
        const result = LookupUtils.findElementById(map, 'elem1');
        expect(result.name).toBe('First');
      });

      it('returns null if not found in Map', () => {
        const map = new Map([['elem1', { id: 'elem1' }]]);
        expect(LookupUtils.findElementById(map, 'elem2')).toBeNull();
      });

      it('searches fallback array if not a Map', () => {
        const arr = [{ id: 'elem1', name: 'First' }];
        const result = LookupUtils.findElementById(null, 'elem1', arr);
        expect(result.name).toBe('First');
      });

      it('returns null if not found in array', () => {
        const arr = [{ id: 'elem1' }];
        expect(LookupUtils.findElementById(null, 'elem2', arr)).toBeNull();
      });

      it('returns null if no Map or array provided', () => {
        expect(LookupUtils.findElementById(null, 'elem1')).toBeNull();
      });

    });

    describe('groupElementsByType()', () => {

      it('returns grouped structure', () => {
        const elements = [];
        const result = LookupUtils.groupElementsByType(elements);

        expect(result).toHaveProperty('visual');
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('byType');
      });

      it('separates visual elements (with x position)', () => {
        const elements = [
          { $type: 'fpb:Product', id: 'p1', x: 100, y: 100 },
          { $type: 'fpb:Product', id: 'p2', name: 'data only' }
        ];
        const result = LookupUtils.groupElementsByType(elements);

        expect(result.visual).toHaveLength(1);
        expect(result.data).toHaveLength(1);
      });

      it('separates visual elements (with waypoints)', () => {
        const elements = [
          { $type: 'fpb:Flow', id: 'f1', waypoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }
        ];
        const result = LookupUtils.groupElementsByType(elements);

        expect(result.visual).toHaveLength(1);
      });

      it('groups by $type', () => {
        const elements = [
          { $type: 'fpb:Product', id: 'p1' },
          { $type: 'fpb:Product', id: 'p2' },
          { $type: 'fpb:Energy', id: 'e1' }
        ];
        const result = LookupUtils.groupElementsByType(elements);

        expect(result.byType.get('fpb:Product')).toHaveLength(2);
        expect(result.byType.get('fpb:Energy')).toHaveLength(1);
      });

      it('skips elements without $type', () => {
        const elements = [
          { id: 'no-type' },
          { $type: 'fpb:Product', id: 'p1' }
        ];
        const result = LookupUtils.groupElementsByType(elements);

        expect(result.data).toHaveLength(1);
      });

      it('handles non-array input', () => {
        const result = LookupUtils.groupElementsByType('not-array');
        expect(result.visual).toHaveLength(0);
        expect(result.data).toHaveLength(0);
      });

    });

  });

  // ============================================
  // VisualUtils
  // ============================================

  describe('VisualUtils', () => {

    describe('createFallbackVisualInfo()', () => {

      it('creates visual info with correct id', () => {
        const result = VisualUtils.createFallbackVisualInfo('elem123');
        expect(result.id).toBe('elem123');
      });

      it('sets type from parameter', () => {
        const result = VisualUtils.createFallbackVisualInfo('elem1', 'fpb:Product');
        expect(result.type).toBe('fpb:Product');
      });

      it('defaults type to unknown', () => {
        const result = VisualUtils.createFallbackVisualInfo('elem1');
        expect(result.type).toBe('unknown');
      });

      it('sets position within expected range', () => {
        const result = VisualUtils.createFallbackVisualInfo('elem1');

        expect(result.x).toBeGreaterThanOrEqual(FALLBACK_VALUES.POSITION.X_BASE);
        expect(result.x).toBeLessThanOrEqual(
          FALLBACK_VALUES.POSITION.X_BASE + FALLBACK_VALUES.POSITION.X_RANDOM
        );
        expect(result.y).toBeGreaterThanOrEqual(FALLBACK_VALUES.POSITION.Y_BASE);
        expect(result.y).toBeLessThanOrEqual(
          FALLBACK_VALUES.POSITION.Y_BASE + FALLBACK_VALUES.POSITION.Y_RANDOM
        );
      });

      it('sets default size', () => {
        const result = VisualUtils.createFallbackVisualInfo('elem1');
        expect(result.width).toBe(FALLBACK_VALUES.SIZE.WIDTH);
        expect(result.height).toBe(FALLBACK_VALUES.SIZE.HEIGHT);
      });

    });

    describe('validateVisualInfo()', () => {

      it('returns false for null', () => {
        expect(VisualUtils.validateVisualInfo(null)).toBe(false);
      });

      it('returns false for undefined', () => {
        expect(VisualUtils.validateVisualInfo(undefined)).toBe(false);
      });

      describe('shape validation', () => {

        it('returns true for complete shape info', () => {
          const info = { x: 100, y: 100, width: 50, height: 50 };
          expect(VisualUtils.validateVisualInfo(info)).toBe(true);
        });

        it('returns false if missing width', () => {
          const info = { x: 100, y: 100, height: 50 };
          expect(VisualUtils.validateVisualInfo(info)).toBe(false);
        });

        it('returns false if missing height', () => {
          const info = { x: 100, y: 100, width: 50 };
          expect(VisualUtils.validateVisualInfo(info)).toBe(false);
        });

        it('returns false if missing y', () => {
          const info = { x: 100, width: 50, height: 50 };
          expect(VisualUtils.validateVisualInfo(info)).toBe(false);
        });

      });

      describe('connection validation', () => {

        it('returns true for valid waypoints', () => {
          const info = {
            waypoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }]
          };
          expect(VisualUtils.validateVisualInfo(info)).toBe(true);
        });

        it('returns false for single waypoint', () => {
          const info = {
            waypoints: [{ x: 0, y: 0 }]
          };
          expect(VisualUtils.validateVisualInfo(info)).toBe(false);
        });

        it('returns false for empty waypoints', () => {
          const info = { waypoints: [] };
          expect(VisualUtils.validateVisualInfo(info)).toBe(false);
        });

        it('returns false for non-array waypoints', () => {
          const info = { waypoints: 'not-array' };
          expect(VisualUtils.validateVisualInfo(info)).toBe(false);
        });

      });

      it('returns false for empty object', () => {
        expect(VisualUtils.validateVisualInfo({})).toBe(false);
      });

    });

  });

  // ============================================
  // ValidationUtils
  // ============================================

  describe('ValidationUtils', () => {

    describe('validateImportData()', () => {

      it('returns isValid true for non-empty array', () => {
        const result = ValidationUtils.validateImportData([{ id: 1 }]);
        expect(result.isValid).toBe(true);
      });

      it('returns error for null', () => {
        const result = ValidationUtils.validateImportData(null);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid data structure');
      });

      it('returns error for non-array', () => {
        const result = ValidationUtils.validateImportData({ key: 'value' });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('expected array');
      });

      it('returns error for empty array', () => {
        const result = ValidationUtils.validateImportData([]);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Empty data array');
      });

    });

    describe('validateProjectDefinition()', () => {

      it('returns isValid true for valid project', () => {
        const data = [
          { $type: FPB_TYPES.PROJECT, name: 'Test', targetNamespace: 'http://test.com' }
        ];
        const result = ValidationUtils.validateProjectDefinition(data);

        expect(result.isValid).toBe(true);
        expect(result.project).toBeDefined();
      });

      it('returns error if no project found', () => {
        const data = [{ $type: 'fpb:Process' }];
        const result = ValidationUtils.validateProjectDefinition(data);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('No project definition found');
      });

      it('returns error if project missing name', () => {
        const data = [
          { $type: FPB_TYPES.PROJECT, targetNamespace: 'http://test.com' }
        ];
        const result = ValidationUtils.validateProjectDefinition(data);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('missing required fields');
      });

      it('returns error if project missing targetNamespace', () => {
        const data = [
          { $type: FPB_TYPES.PROJECT, name: 'Test' }
        ];
        const result = ValidationUtils.validateProjectDefinition(data);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('missing required fields');
      });

    });

    describe('validateProcessData()', () => {

      it('returns isValid true for complete data', () => {
        const processData = {
          process: { id: 'p1' },
          elementVisualInformation: [],
          elementDataInformation: []
        };
        const result = ValidationUtils.validateProcessData(processData);

        expect(result.isValid).toBe(true);
      });

      it('returns error for missing process', () => {
        const processData = {
          elementVisualInformation: [],
          elementDataInformation: []
        };
        const result = ValidationUtils.validateProcessData(processData);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Missing process definition');
      });

      it('returns error for missing visual information', () => {
        const processData = {
          process: { id: 'p1' },
          elementDataInformation: []
        };
        const result = ValidationUtils.validateProcessData(processData);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Missing visual information');
      });

      it('returns error for missing data information', () => {
        const processData = {
          process: { id: 'p1' },
          elementVisualInformation: []
        };
        const result = ValidationUtils.validateProcessData(processData);

        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Missing data information');
      });

    });

  });

});
