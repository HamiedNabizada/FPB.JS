// tests/unit/help/utils.test.js
import { describe, it, expect } from 'vitest';

import {
  isFpb,
  is,
  getBusinessObject,
  isAny,
  getParent,
  getLabel,
  setLabel,
  isLabel,
  DEFAULT_LABEL_SIZE,
  FLOW_LABEL_INDENT,
  getExternalLabelMid
} from '../../../app/fpb/help/utils.js';

describe('utils.js', () => {

  // ============================================
  // isFpb
  // ============================================

  describe('isFpb(element)', () => {

    it('returns true for fpb:Product', () => {
      const element = { type: 'fpb:Product' };
      expect(isFpb(element)).toBe(true);
    });

    it('returns true for fpb:Energy', () => {
      const element = { type: 'fpb:Energy' };
      expect(isFpb(element)).toBe(true);
    });

    it('returns true for fpb:ProcessOperator', () => {
      const element = { type: 'fpb:ProcessOperator' };
      expect(isFpb(element)).toBe(true);
    });

    it('returns false for non-fpb types', () => {
      const element = { type: 'bpmn:Task' };
      expect(isFpb(element)).toBe(false);
    });

    it('returns falsy for null element', () => {
      expect(isFpb(null)).toBeFalsy();
    });

    it('returns falsy for undefined element', () => {
      expect(isFpb(undefined)).toBeFalsy();
    });

    it('returns falsy for element without type', () => {
      const element = { id: 'test' };
      expect(isFpb(element)).toBeFalsy();
    });

  });

  // ============================================
  // getBusinessObject
  // ============================================

  describe('getBusinessObject(element)', () => {

    it('returns businessObject when present', () => {
      const bo = { $type: 'fpb:Product', name: 'Test' };
      const element = { businessObject: bo };

      expect(getBusinessObject(element)).toBe(bo);
    });

    it('returns element itself when no businessObject', () => {
      const element = { $type: 'fpb:Product', name: 'Test' };

      expect(getBusinessObject(element)).toBe(element);
    });

    it('returns null for null input', () => {
      expect(getBusinessObject(null)).toBe(null);
    });

    it('returns undefined for undefined input', () => {
      expect(getBusinessObject(undefined)).toBeUndefined();
    });

  });

  // ============================================
  // is (with mock $instanceOf)
  // ============================================

  describe('is(element, type)', () => {

    it('returns true when type matches via $instanceOf', () => {
      const element = createMockElement('fpb:Product');
      expect(is(element, 'fpb:Product')).toBe(true);
    });

    it('returns false when type does not match', () => {
      const element = createMockElement('fpb:Product');
      expect(is(element, 'fpb:Energy')).toBe(false);
    });

    it('returns falsy for null element', () => {
      expect(is(null, 'fpb:Product')).toBeFalsy();
    });

    it('returns falsy for element without $instanceOf', () => {
      const element = {
        businessObject: { $type: 'fpb:Product' }
      };
      expect(is(element, 'fpb:Product')).toBeFalsy();
    });

  });

  // ============================================
  // isAny
  // ============================================

  describe('isAny(element, types)', () => {

    it('returns true when element matches first type', () => {
      const element = createMockElement('fpb:Product');
      const types = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];

      expect(isAny(element, types)).toBe(true);
    });

    it('returns true when element matches last type', () => {
      const element = createMockElement('fpb:Information');
      const types = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];

      expect(isAny(element, types)).toBe(true);
    });

    it('returns false when element matches none', () => {
      const element = createMockElement('fpb:ProcessOperator');
      const types = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];

      expect(isAny(element, types)).toBe(false);
    });

    it('returns false for empty types array', () => {
      const element = createMockElement('fpb:Product');
      expect(isAny(element, [])).toBe(false);
    });

  });

  // ============================================
  // getParent
  // ============================================

  describe('getParent(element, anyType)', () => {

    it('finds parent of specified type', () => {
      const systemLimit = createMockElement('fpb:SystemLimit');
      const process = createMockElement('fpb:Process');
      process.parent = systemLimit;
      const product = createMockElement('fpb:Product');
      product.parent = process;

      const result = getParent(product, 'fpb:SystemLimit');
      expect(result).toBe(systemLimit);
    });

    it('returns null when no parent matches', () => {
      const product = createMockElement('fpb:Product');
      product.parent = createMockElement('fpb:Process');

      const result = getParent(product, 'fpb:TechnicalResource');
      expect(result).toBeNull();
    });

    it('handles string type parameter', () => {
      const systemLimit = createMockElement('fpb:SystemLimit');
      const product = createMockElement('fpb:Product');
      product.parent = systemLimit;

      const result = getParent(product, 'fpb:SystemLimit');
      expect(result).toBe(systemLimit);
    });

    it('handles array of types', () => {
      const process = createMockElement('fpb:Process');
      const product = createMockElement('fpb:Product');
      product.parent = process;

      const result = getParent(product, ['fpb:SystemLimit', 'fpb:Process']);
      expect(result).toBe(process);
    });

    it('returns null for element without parent', () => {
      const product = createMockElement('fpb:Product');
      product.parent = null;

      const result = getParent(product, 'fpb:SystemLimit');
      expect(result).toBeNull();
    });

  });

  // ============================================
  // getLabel / setLabel
  // ============================================

  describe('getLabel(element)', () => {

    it('returns name for Product', () => {
      const element = createMockElement('fpb:Product', 'My Product');
      expect(getLabel(element)).toBe('My Product');
    });

    it('returns name for Energy', () => {
      const element = createMockElement('fpb:Energy', 'Electricity');
      expect(getLabel(element)).toBe('Electricity');
    });

    it('returns name for Information', () => {
      const element = createMockElement('fpb:Information', 'Data');
      expect(getLabel(element)).toBe('Data');
    });

    it('returns name for ProcessOperator', () => {
      const element = createMockElement('fpb:ProcessOperator', 'Transform');
      expect(getLabel(element)).toBe('Transform');
    });

    it('returns name for TechnicalResource', () => {
      const element = createMockElement('fpb:TechnicalResource', 'Machine');
      expect(getLabel(element)).toBe('Machine');
    });

    it('returns name for SystemLimit', () => {
      const element = createMockElement('fpb:SystemLimit', 'Process A');
      expect(getLabel(element)).toBe('Process A');
    });

    it('returns empty string for empty name', () => {
      const element = createMockElement('fpb:Product', '');
      expect(getLabel(element)).toBe('');
    });

    it('returns undefined for unsupported types', () => {
      const element = createMockElement('fpb:Flow', 'Some Flow');
      expect(getLabel(element)).toBeUndefined();
    });

  });

  describe('setLabel(element, text)', () => {

    it('sets name on Product', () => {
      const element = createMockElement('fpb:Product', 'Old Name');

      setLabel(element, 'New Name');

      expect(element.businessObject.name).toBe('New Name');
    });

    it('sets name on ProcessOperator', () => {
      const element = createMockElement('fpb:ProcessOperator', 'Old');

      setLabel(element, 'New Operator');

      expect(element.businessObject.name).toBe('New Operator');
    });

    it('returns the element', () => {
      const element = createMockElement('fpb:Product', 'Test');

      const result = setLabel(element, 'New');

      expect(result).toBe(element);
    });

    it('does nothing for unsupported types', () => {
      const element = createMockElement('fpb:Flow', 'Test');

      setLabel(element, 'New Name');

      // Flow doesn't have name attribute in getLabelAttr
      expect(element.businessObject.name).toBe('Test');
    });

  });

  // ============================================
  // isLabel
  // ============================================

  describe('isLabel(element)', () => {

    it('returns truthy when element has labelTarget', () => {
      const labelTarget = createMockElement('fpb:Product');
      const element = { labelTarget };
      expect(isLabel(element)).toBeTruthy();
      expect(isLabel(element)).toBe(labelTarget);
    });

    it('returns falsy when element has no labelTarget', () => {
      const element = createMockElement('fpb:Product');
      expect(isLabel(element)).toBeFalsy();
    });

    it('returns falsy for null', () => {
      expect(isLabel(null)).toBeFalsy();
    });

    it('returns falsy for undefined', () => {
      expect(isLabel(undefined)).toBeFalsy();
    });

  });

  // ============================================
  // Constants
  // ============================================

  describe('constants', () => {

    it('DEFAULT_LABEL_SIZE has correct values', () => {
      expect(DEFAULT_LABEL_SIZE.width).toBe(50);
      expect(DEFAULT_LABEL_SIZE.height).toBe(20);
    });

    it('FLOW_LABEL_INDENT is 15', () => {
      expect(FLOW_LABEL_INDENT).toBe(15);
    });

  });

  // ============================================
  // getExternalLabelMid
  // ============================================

  describe('getExternalLabelMid(element)', () => {

    it('calculates label position above element', () => {
      const element = {
        x: 100,
        y: 100,
        width: 40,
        height: 40
      };

      const result = getExternalLabelMid(element);

      // x: 100 - 40/2 = 80
      expect(result.x).toBe(80);
      // y: 100 - 20 (DEFAULT_LABEL_SIZE.height)
      expect(result.y).toBe(80);
    });

  });

});
