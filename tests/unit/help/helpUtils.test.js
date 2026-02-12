// tests/unit/help/helpUtils.test.js
import { describe, it, expect } from 'vitest';

// Importiere die zu testenden Funktionen
import {
  checkIfOnSystemBorder,
  getElementsFromElementsContainer,
  noOfUsageConnections,
  getElementById
} from '../../../app/fpb/help/helpUtils.js';

describe('helpUtils', () => {

  // ============================================
  // checkIfOnSystemBorder - Pure Function Tests
  // ============================================

  describe('checkIfOnSystemBorder(systemLimit, state)', () => {

    it('returns "onUpperBorder" when state center is on upper edge', () => {
      // SystemLimit: y=100, height=300 → upper edge at y=100
      const systemLimit = createMockSystemLimit({ x: 50, y: 100, width: 400, height: 300 });

      // State mit Mitte auf y=100 (upper edge)
      // State height=50, so y=75 means center at 75+25=100
      const state = createMockState('fpb:Product', { x: 200, y: 75, height: 50 });

      const result = checkIfOnSystemBorder(systemLimit, state);
      expect(result).toBe('onUpperBorder');
    });

    it('returns "onBottomBorder" when state center is on bottom edge', () => {
      // SystemLimit: y=100, height=300 → bottom edge at y=400
      const systemLimit = createMockSystemLimit({ x: 50, y: 100, width: 400, height: 300 });

      // State mit Mitte auf y=400 (bottom edge)
      // State height=50, so y=375 means center at 375+25=400
      const state = createMockState('fpb:Product', { x: 200, y: 375, height: 50 });

      const result = checkIfOnSystemBorder(systemLimit, state);
      expect(result).toBe('onBottomBorder');
    });

    it('returns empty string when state is inside (not on border)', () => {
      const systemLimit = createMockSystemLimit({ x: 50, y: 100, width: 400, height: 300 });

      // State completely inside (center at y=250)
      const state = createMockState('fpb:Product', { x: 200, y: 225, height: 50 });

      const result = checkIfOnSystemBorder(systemLimit, state);
      expect(result).toBe('');
    });

    it('handles tolerance correctly - state slightly inside upper border', () => {
      const systemLimit = createMockSystemLimit({ x: 50, y: 100, width: 400, height: 300 });

      // State center at y=115 (15 pixels below upper edge, within 30px tolerance)
      const state = createMockState('fpb:Product', { x: 200, y: 90, height: 50 });

      const result = checkIfOnSystemBorder(systemLimit, state);
      expect(result).toBe('onUpperBorder');
    });

    it('handles tolerance correctly - state just outside tolerance', () => {
      const systemLimit = createMockSystemLimit({ x: 50, y: 100, width: 400, height: 300 });

      // State center at y=135 (35 pixels from upper edge, outside 30px tolerance)
      const state = createMockState('fpb:Product', { x: 200, y: 110, height: 50 });

      const result = checkIfOnSystemBorder(systemLimit, state);
      expect(result).toBe('');
    });

    it('uses default height of 50 when state.height is undefined', () => {
      const systemLimit = createMockSystemLimit({ x: 50, y: 100, width: 400, height: 300 });

      // State without explicit height (should default to 50)
      const state = { x: 200, y: 75 }; // center would be at 75 + 25 = 100

      const result = checkIfOnSystemBorder(systemLimit, state);
      expect(result).toBe('onUpperBorder');
    });

  });

  // ============================================
  // getElementsFromElementsContainer
  // ============================================

  describe('getElementsFromElementsContainer(container, type)', () => {

    it('returns empty array for empty container', () => {
      const result = getElementsFromElementsContainer([], 'fpb:Product');
      expect(result).toEqual([]);
    });

    it('returns elements matching the type', () => {
      const product1 = createMockElement('fpb:Product', 'Product 1');
      const product2 = createMockElement('fpb:Product', 'Product 2');
      const energy = createMockElement('fpb:Energy', 'Energy 1');

      const container = [product1, product2, energy];

      const result = getElementsFromElementsContainer(container, 'fpb:Product');

      expect(result).toHaveLength(2);
      expect(result).toContain(product1);
      expect(result).toContain(product2);
      expect(result).not.toContain(energy);
    });

    it('returns empty array when no elements match', () => {
      const energy = createMockElement('fpb:Energy', 'Energy 1');
      const info = createMockElement('fpb:Information', 'Info 1');

      const container = [energy, info];

      const result = getElementsFromElementsContainer(container, 'fpb:Product');
      expect(result).toEqual([]);
    });

  });

  // ============================================
  // noOfUsageConnections
  // ============================================

  describe('noOfUsageConnections(connectionContainer)', () => {

    it('returns 0 for empty container', () => {
      const result = noOfUsageConnections([]);
      expect(result).toBe(0);
    });

    it('counts only Usage connections', () => {
      const usage1 = createMockConnection(
        createMockElement('fpb:TechnicalResource'),
        createMockElement('fpb:ProcessOperator'),
        'fpb:Usage'
      );
      const usage2 = createMockConnection(
        createMockElement('fpb:TechnicalResource'),
        createMockElement('fpb:ProcessOperator'),
        'fpb:Usage'
      );
      const flow = createMockConnection(
        createMockElement('fpb:Product'),
        createMockElement('fpb:ProcessOperator'),
        'fpb:Flow'
      );

      const container = [usage1, usage2, flow];

      const result = noOfUsageConnections(container);
      expect(result).toBe(2);
    });

    it('returns 0 when no Usage connections exist', () => {
      const flow1 = createMockConnection(
        createMockElement('fpb:Product'),
        createMockElement('fpb:ProcessOperator'),
        'fpb:Flow'
      );
      const flow2 = createMockConnection(
        createMockElement('fpb:ProcessOperator'),
        createMockElement('fpb:Product'),
        'fpb:Flow'
      );

      const container = [flow1, flow2];

      const result = noOfUsageConnections(container);
      expect(result).toBe(0);
    });

  });

  // ============================================
  // getElementById
  // ============================================

  describe('getElementById(container, id)', () => {

    it('returns null for empty container', () => {
      const result = getElementById([], 'some-id');
      expect(result).toBeNull();
    });

    it('finds element by businessObject.id', () => {
      const element1 = createMockElement('fpb:Product', 'Product 1');
      element1.businessObject.id = 'target-id';

      const element2 = createMockElement('fpb:Energy', 'Energy 1');
      element2.businessObject.id = 'other-id';

      const container = [element1, element2];

      const result = getElementById(container, 'target-id');
      expect(result).toBe(element1);
    });

    it('returns null when element not found', () => {
      const element = createMockElement('fpb:Product', 'Product 1');
      element.businessObject.id = 'existing-id';

      const container = [element];

      const result = getElementById(container, 'non-existing-id');
      expect(result).toBeNull();
    });

  });

});
