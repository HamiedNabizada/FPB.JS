// tests/unit/context-pad/ContextPadUtils.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ContextHelper,
  ConnectionUtils,
  ElementValidationUtils,
  ElementTypeUtils
} from '../../../app/fpb/context-pad/ContextPadUtils.js';

import { LAYOUT_CONSTANTS, FLOW_TYPES } from '../../../app/fpb/context-pad/ContextPadConstants.js';

describe('ContextPadUtils', () => {

  // ============================================
  // ContextHelper
  // ============================================

  describe('ContextHelper', () => {

    describe('constructor', () => {

      it('stores canvas reference', () => {
        const mockCanvas = { id: 'canvas' };
        const helper = new ContextHelper(mockCanvas);
        expect(helper.canvas).toBe(mockCanvas);
      });

    });

    describe('getProcessContext()', () => {

      it('returns fallback when SystemLimit not found', () => {
        const mockCanvas = {
          getRootElement: () => ({
            businessObject: {
              elementsContainer: []
            }
          })
        };
        const helper = new ContextHelper(mockCanvas);
        const result = helper.getProcessContext();

        expect(result).toHaveProperty('process');
        expect(result.systemLimit).toBeNull();
        expect(result.processOperators).toEqual([]);
        expect(result.states).toEqual([]);
        expect(result.technicalResources).toEqual([]);
      });

      it('returns structured context object', () => {
        const mockCanvas = {
          getRootElement: () => ({
            businessObject: {
              elementsContainer: []
            }
          })
        };
        const helper = new ContextHelper(mockCanvas);
        const result = helper.getProcessContext();

        expect(result).toHaveProperty('process');
        expect(result).toHaveProperty('systemLimit');
        expect(result).toHaveProperty('processOperators');
        expect(result).toHaveProperty('states');
        expect(result).toHaveProperty('technicalResources');
      });

    });

  });

  // ============================================
  // ConnectionUtils
  // ============================================

  describe('ConnectionUtils', () => {

    describe('getFlowHintFromEvent()', () => {

      it('returns Parallel for parallel class', () => {
        const event = {
          type: 'click',
          srcElement: { className: 'context-pad-icon-fpbparallelconnection' }
        };
        expect(ConnectionUtils.getFlowHintFromEvent(event)).toBe('Parallel');
      });

      it('returns Alternative for alternative class', () => {
        const event = {
          type: 'click',
          srcElement: { className: 'context-pad-icon-fpbalternativeconnection' }
        };
        expect(ConnectionUtils.getFlowHintFromEvent(event)).toBe('Alternative');
      });

      it('returns Usage for usage class', () => {
        const event = {
          type: 'click',
          srcElement: { className: 'context-pad-icon-fpbusage' }
        };
        expect(ConnectionUtils.getFlowHintFromEvent(event)).toBe('Usage');
      });

      it('returns Flow as default', () => {
        const event = {
          type: 'click',
          srcElement: { className: 'context-pad-icon-fpbconnection' }
        };
        expect(ConnectionUtils.getFlowHintFromEvent(event)).toBe('Flow');
      });

      it('handles dragstart event type', () => {
        const event = {
          type: 'dragstart',
          srcElement: { className: 'context-pad-icon-fpbparallelconnection' }
        };
        expect(ConnectionUtils.getFlowHintFromEvent(event)).toBe('Parallel');
      });

      it('handles non-click events via srcEvent', () => {
        const event = {
          type: 'touchstart',
          srcEvent: {
            srcElement: { className: 'some-parallel-class' }
          }
        };
        expect(ConnectionUtils.getFlowHintFromEvent(event)).toBe('Parallel');
      });

    });

    describe('getConnectionSourcePosition()', () => {

      it('returns position object with x and y', () => {
        const element = { x: 100, y: 100, width: 50, height: 50, type: 'fpb:ProcessOperator' };
        const result = ConnectionUtils.getConnectionSourcePosition(element);

        expect(result).toHaveProperty('x');
        expect(result).toHaveProperty('y');
      });

      it('returns modified position based on element type', () => {
        // The exact behavior depends on is() function matching
        // For elements that don't match State or fpb:Object, x -= width/2
        const element = {
          x: 100, y: 100, width: 50, height: 50,
          type: 'fpb:ProcessOperator'
        };
        const result = ConnectionUtils.getConnectionSourcePosition(element);

        // Result should have x and y values
        expect(typeof result.x).toBe('number');
        expect(typeof result.y).toBe('number');
      });

    });

  });

  // ============================================
  // ElementValidationUtils
  // ============================================

  describe('ElementValidationUtils', () => {

    describe('anyOutgoingFlowOfType()', () => {

      it('returns true if no outgoing connections', () => {
        const element = { outgoing: undefined };
        expect(ElementValidationUtils.anyOutgoingFlowOfType(element, 'fpb:Flow')).toBe(true);
      });

      it('returns true if no matching flow type', () => {
        const element = {
          outgoing: [
            { type: 'fpb:Flow' },
            { type: 'fpb:Usage' }
          ]
        };
        expect(ElementValidationUtils.anyOutgoingFlowOfType(element, 'fpb:AlternativeFlow')).toBe(true);
      });

      it('returns false if flow type exists', () => {
        const element = {
          outgoing: [
            { type: 'fpb:Flow' },
            { type: 'fpb:AlternativeFlow' }
          ]
        };
        expect(ElementValidationUtils.anyOutgoingFlowOfType(element, 'fpb:AlternativeFlow')).toBe(false);
      });

      it('handles empty outgoing array', () => {
        const element = { outgoing: [] };
        expect(ElementValidationUtils.anyOutgoingFlowOfType(element, 'fpb:Flow')).toBe(true);
      });

    });

    describe('countElementsUnderSource()', () => {

      it('returns 0 for null container', () => {
        const source = { y: 100 };
        expect(ElementValidationUtils.countElementsUnderSource(source, null)).toBe(0);
      });

      it('returns 0 for empty container', () => {
        const source = { y: 100 };
        expect(ElementValidationUtils.countElementsUnderSource(source, [])).toBe(0);
      });

      it('counts elements below source at minimum distance', () => {
        const source = { id: 'source', y: 100 };
        const container = [
          { id: 'elem1', y: 200, incoming: [] },  // Below at 100+ distance
          { id: 'elem2', y: 130, incoming: [] },  // Below but only 30 distance
          { id: 'elem3', y: 50, incoming: [] }    // Above source
        ];

        const result = ElementValidationUtils.countElementsUnderSource(source, container);
        expect(result).toBe(1);  // Only elem1 is 50+ below
      });

      it('excludes already connected elements', () => {
        const source = { id: 'source', y: 100 };
        const container = [
          {
            id: 'elem1',
            y: 200,
            incoming: [{ businessObject: { sourceRef: { id: 'source' } } }]
          },
          { id: 'elem2', y: 200, incoming: [] }
        ];

        const result = ElementValidationUtils.countElementsUnderSource(source, container);
        expect(result).toBe(1);  // elem1 excluded because already connected
      });

      it('uses custom minDistance', () => {
        const source = { id: 'source', y: 100 };
        const container = [
          { id: 'elem1', y: 130, incoming: [] }  // 30 below
        ];

        // With default minDistance (50), should be 0
        expect(ElementValidationUtils.countElementsUnderSource(source, container)).toBe(0);

        // With custom minDistance (20), should be 1
        expect(ElementValidationUtils.countElementsUnderSource(source, container, 20)).toBe(1);
      });

    });

    describe('technicalResourcesAvailable()', () => {

      it('returns false for null technicalResources', () => {
        const source = { businessObject: { isAssignedTo: [] } };
        expect(ElementValidationUtils.technicalResourcesAvailable(source, null)).toBe(false);
      });

      it('returns false for empty technicalResources', () => {
        const source = { businessObject: { isAssignedTo: [] } };
        expect(ElementValidationUtils.technicalResourcesAvailable(source, [])).toBe(false);
      });

      it('returns true if source has no assignments', () => {
        const source = { businessObject: { isAssignedTo: undefined } };
        const technicalResources = [{ id: 'tr1' }];
        expect(ElementValidationUtils.technicalResourcesAvailable(source, technicalResources)).toBe(true);
      });

      it('returns true if source has empty assignments', () => {
        const source = { businessObject: { isAssignedTo: [] } };
        const technicalResources = [{ id: 'tr1' }];
        expect(ElementValidationUtils.technicalResourcesAvailable(source, technicalResources)).toBe(true);
      });

      it('returns true if there are free technical resources', () => {
        const source = { id: 'source1', businessObject: { isAssignedTo: [{ id: 'tr1' }] } };
        const technicalResources = [
          { id: 'tr1', isAssignedTo: { id: 'source1' } },
          { id: 'tr2', isAssignedTo: null }  // Free
        ];
        expect(ElementValidationUtils.technicalResourcesAvailable(source, technicalResources)).toBe(true);
      });

      it('returns false if all technical resources are assigned to source', () => {
        const source = { id: 'source1', businessObject: { isAssignedTo: [{ id: 'tr1' }] } };
        const technicalResources = [
          { id: 'tr1', isAssignedTo: { id: 'source1' } }
        ];
        expect(ElementValidationUtils.technicalResourcesAvailable(source, technicalResources)).toBe(false);
      });

    });

  });

  // ============================================
  // ElementTypeUtils
  // ============================================

  describe('ElementTypeUtils', () => {

    describe('getCleanElementType()', () => {

      it('removes fpb: prefix', () => {
        const element = { type: 'fpb:Product' };
        expect(ElementTypeUtils.getCleanElementType(element)).toBe('Product');
      });

      it('removes fpb: prefix from ProcessOperator', () => {
        const element = { type: 'fpb:ProcessOperator' };
        expect(ElementTypeUtils.getCleanElementType(element)).toBe('ProcessOperator');
      });

      it('returns empty string if no type', () => {
        const element = {};
        expect(ElementTypeUtils.getCleanElementType(element)).toBe('');
      });

      it('returns type unchanged if no fpb: prefix', () => {
        const element = { type: 'label' };
        expect(ElementTypeUtils.getCleanElementType(element)).toBe('label');
      });

    });

    describe('isElementType()', () => {

      it('wraps is() utility function', () => {
        // isElementType is a thin wrapper around is() from utils
        // Full testing requires Moddle businessObject with $instanceOf
        const element = { type: 'fpb:Product' };

        // Without proper moddle mock, is() returns undefined
        // This test verifies the function exists and accepts parameters
        expect(typeof ElementTypeUtils.isElementType).toBe('function');
        expect(() => ElementTypeUtils.isElementType(element, 'fpb:Product')).not.toThrow();
      });

    });

    describe('canDecompose()', () => {

      it('returns true when has both input and output (no usage)', () => {
        const element = {
          incoming: [{ type: 'fpb:Flow' }],
          outgoing: [{ type: 'fpb:Flow' }]
        };
        const noOfUsageConnections = (arr) => 0;

        expect(ElementTypeUtils.canDecompose(element, noOfUsageConnections)).toBe(true);
      });

      it('returns false when no inputs', () => {
        const element = {
          incoming: [],
          outgoing: [{ type: 'fpb:Flow' }]
        };
        const noOfUsageConnections = (arr) => 0;

        expect(ElementTypeUtils.canDecompose(element, noOfUsageConnections)).toBe(false);
      });

      it('returns false when no outputs', () => {
        const element = {
          incoming: [{ type: 'fpb:Flow' }],
          outgoing: []
        };
        const noOfUsageConnections = (arr) => 0;

        expect(ElementTypeUtils.canDecompose(element, noOfUsageConnections)).toBe(false);
      });

      it('excludes usage connections from count', () => {
        const element = {
          incoming: [{ type: 'fpb:Usage' }, { type: 'fpb:Flow' }],
          outgoing: [{ type: 'fpb:Usage' }]  // Only usage, no real output
        };
        const noOfUsageConnections = (arr) => arr.filter(c => c.type === 'fpb:Usage').length;

        expect(ElementTypeUtils.canDecompose(element, noOfUsageConnections)).toBe(false);
      });

      it('returns true when has non-usage input and output', () => {
        const element = {
          incoming: [{ type: 'fpb:Usage' }, { type: 'fpb:Flow' }],
          outgoing: [{ type: 'fpb:Usage' }, { type: 'fpb:Flow' }]
        };
        const noOfUsageConnections = (arr) => arr.filter(c => c.type === 'fpb:Usage').length;

        expect(ElementTypeUtils.canDecompose(element, noOfUsageConnections)).toBe(true);
      });

    });

  });

});
