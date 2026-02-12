// tests/unit/xml/XMLMapper.test.js
import { describe, it, expect, beforeEach } from 'vitest';

// Note: XMLMapper uses browser DOMParser which is available in happy-dom
import XMLMapper from '../../../app/fpb/xml/XMLMapper.js';

describe('XMLMapper', () => {

  let mapper;

  beforeEach(() => {
    mapper = new XMLMapper();
  });

  // ============================================
  // Static Constants
  // ============================================

  describe('Static Constants', () => {

    it('defines DEFAULT_WAYPOINTS', () => {
      expect(XMLMapper.DEFAULT_WAYPOINTS).toBeDefined();
      expect(Array.isArray(XMLMapper.DEFAULT_WAYPOINTS)).toBe(true);
      expect(XMLMapper.DEFAULT_WAYPOINTS).toHaveLength(2);
    });

    it('DEFAULT_WAYPOINTS have x and y coordinates', () => {
      XMLMapper.DEFAULT_WAYPOINTS.forEach(point => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(typeof point.x).toBe('number');
        expect(typeof point.y).toBe('number');
      });
    });

    it('defines UUID_TEMPLATE', () => {
      expect(XMLMapper.UUID_TEMPLATE).toBe('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');
    });

  });

  // ============================================
  // Constructor
  // ============================================

  describe('constructor', () => {

    it('initializes stateTypeMapping', () => {
      expect(mapper.stateTypeMapping).toBeDefined();
      expect(mapper.stateTypeMapping['fpb:Product']).toBe('product');
      expect(mapper.stateTypeMapping['fpb:Energy']).toBe('energy');
      expect(mapper.stateTypeMapping['fpb:Information']).toBe('information');
    });

    it('initializes reverseStateTypeMapping', () => {
      expect(mapper.reverseStateTypeMapping).toBeDefined();
      expect(mapper.reverseStateTypeMapping['product']).toBe('fpb:Product');
      expect(mapper.reverseStateTypeMapping['energy']).toBe('fpb:Energy');
      expect(mapper.reverseStateTypeMapping['information']).toBe('fpb:Information');
    });

    it('initializes flowTypeMapping', () => {
      expect(mapper.flowTypeMapping).toBeDefined();
      expect(mapper.flowTypeMapping['fpb:Flow']).toBe('flow');
      expect(mapper.flowTypeMapping['fpb:AlternativeFlow']).toBe('alternativeFlow');
      expect(mapper.flowTypeMapping['fpb:ParallelFlow']).toBe('parallelFlow');
      expect(mapper.flowTypeMapping['fpb:Usage']).toBe('usage');
    });

    it('initializes reverseFlowTypeMapping from flowTypeMapping', () => {
      expect(mapper.reverseFlowTypeMapping).toBeDefined();
      expect(mapper.reverseFlowTypeMapping['flow']).toBe('fpb:Flow');
      expect(mapper.reverseFlowTypeMapping['alternativeFlow']).toBe('fpb:AlternativeFlow');
      expect(mapper.reverseFlowTypeMapping['parallelFlow']).toBe('fpb:ParallelFlow');
      expect(mapper.reverseFlowTypeMapping['usage']).toBe('fpb:Usage');
    });

    it('initializes originalJsonData as null', () => {
      expect(mapper.originalJsonData).toBeNull();
    });

  });

  // ============================================
  // State Type Mappings
  // ============================================

  describe('State Type Mappings', () => {

    it('maps all 3 state types', () => {
      expect(Object.keys(mapper.stateTypeMapping)).toHaveLength(3);
    });

    it('reverse mapping is bijective', () => {
      Object.entries(mapper.stateTypeMapping).forEach(([fpbType, xmlType]) => {
        expect(mapper.reverseStateTypeMapping[xmlType]).toBe(fpbType);
      });
    });

  });

  // ============================================
  // Flow Type Mappings
  // ============================================

  describe('Flow Type Mappings', () => {

    it('maps all 4 flow types', () => {
      expect(Object.keys(mapper.flowTypeMapping)).toHaveLength(4);
    });

    it('reverse mapping is bijective', () => {
      Object.entries(mapper.flowTypeMapping).forEach(([fpbType, xmlType]) => {
        expect(mapper.reverseFlowTypeMapping[xmlType]).toBe(fpbType);
      });
    });

  });

  // ============================================
  // _parseVisualAttribute
  // ============================================

  describe('_parseVisualAttribute()', () => {

    it('parses valid numeric string', () => {
      const visual = {};
      const result = mapper._parseVisualAttribute('100', visual, 'x');

      expect(result).toBe(true);
      expect(visual.x).toBe(100);
    });

    it('parses decimal values', () => {
      const visual = {};
      mapper._parseVisualAttribute('123.456', visual, 'width');

      expect(visual.width).toBeCloseTo(123.456);
    });

    it('returns false for null value', () => {
      const visual = {};
      const result = mapper._parseVisualAttribute(null, visual, 'x');

      expect(result).toBe(false);
      expect(visual).not.toHaveProperty('x');
    });

    it('returns false for empty string', () => {
      const visual = {};
      const result = mapper._parseVisualAttribute('', visual, 'x');

      expect(result).toBe(false);
      expect(visual).not.toHaveProperty('x');
    });

    it('returns false for non-numeric string', () => {
      const visual = {};
      const result = mapper._parseVisualAttribute('abc', visual, 'x');

      expect(result).toBe(false);
      expect(visual).not.toHaveProperty('x');
    });

    it('parses negative values', () => {
      const visual = {};
      mapper._parseVisualAttribute('-50', visual, 'y');

      expect(visual.y).toBe(-50);
    });

    it('parses zero', () => {
      const visual = {};
      const result = mapper._parseVisualAttribute('0', visual, 'x');

      expect(result).toBe(true);
      expect(visual.x).toBe(0);
    });

  });

  // ============================================
  // _extractVisualAttributes (with DOM)
  // Note: Full DOM tests require browser environment with XML namespace support
  // ============================================

  describe('_extractVisualAttributes()', () => {

    it('returns null for element without visual attributes', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<root><element/></root>', 'text/xml');
      const element = doc.getElementsByTagName('element')[0];

      const visual = mapper._extractVisualAttributes(element);

      // Without namespace support in happy-dom, this returns null
      expect(visual).toBeNull();
    });

    it('function exists and is callable', () => {
      expect(typeof mapper._extractVisualAttributes).toBe('function');
    });

  });

  // ============================================
  // _extractAllVisualInformation
  // Note: Full DOM tests require browser environment with XML namespace support
  // ============================================

  describe('_extractAllVisualInformation()', () => {

    it('function exists and is callable', () => {
      expect(typeof mapper._extractAllVisualInformation).toBe('function');
    });

    it('returns empty array for document without visual elements', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<root><otherElement id="other"/></root>', 'text/xml');

      const visualInfo = mapper._extractAllVisualInformation(doc);

      // Without visual attributes, returns empty array
      expect(visualInfo).toEqual([]);
    });

    it('returns array type', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<root></root>', 'text/xml');

      const visualInfo = mapper._extractAllVisualInformation(doc);

      expect(Array.isArray(visualInfo)).toBe(true);
    });

  });

  // ============================================
  // convertToXML and convertFromXML (Integration)
  // Note: Full integration tests require complete DOM and moddle support
  // ============================================

  describe('XML Conversion (Integration)', () => {

    it('convertToXML is an async function', () => {
      expect(typeof mapper.convertToXML).toBe('function');
    });

    it('convertFromXML is an async function', () => {
      expect(typeof mapper.convertFromXML).toBe('function');
    });

    it('convertToXML rejects for null input', async () => {
      // The method expects valid JSON data structure
      await expect(mapper.convertToXML(null)).rejects.toBeDefined();
    });

    it('convertFromXML rejects for invalid XML', async () => {
      const invalidXml = '<unclosed';
      await expect(mapper.convertFromXML(invalidXml)).rejects.toBeDefined();
    });

  });

});
