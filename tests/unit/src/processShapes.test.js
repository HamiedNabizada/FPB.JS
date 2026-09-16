// tests/unit/src/processShapes.test.js
import { describe, it, expect } from 'vitest';

import { collectProcessShapes, findProcessShape } from '../../../src/processShapes.js';

// Process root shapes as the importer builds them: shape.businessObject.consistsOfProcesses holds shapes.
function shape(id, children = []) {
  return { id, businessObject: { id, $type: 'fpb:Process', consistsOfProcesses: children } };
}

describe('processShapes', () => {

  const grandchild = shape('grandchild');
  const childA = shape('childA', [grandchild]);
  const childB = shape('childB');
  const root = shape('root', [childA, childB]);
  const project = { $type: 'fpb:Project', entryPoint: root };

  describe('collectProcessShapes()', () => {

    it('returns all process shapes breadth first, entry point first', () => {
      expect(collectProcessShapes(project).map((s) => s.id)).toEqual(['root', 'childA', 'childB', 'grandchild']);
    });

    it('skips entries without a shape and survives a cyclic hierarchy', () => {
      const a = shape('a');
      const b = shape('b', [a, 'unresolved-id', null]);
      a.businessObject.consistsOfProcesses.push(b);
      expect(collectProcessShapes({ entryPoint: a }).map((s) => s.id)).toEqual(['a', 'b']);
    });

    it('returns an empty list without project or entry point', () => {
      expect(collectProcessShapes(undefined)).toEqual([]);
      expect(collectProcessShapes({})).toEqual([]);
    });
  });

  describe('findProcessShape()', () => {

    it('finds the shape, not the business object', () => {
      const found = findProcessShape(project, 'grandchild');
      expect(found).toBe(grandchild);
      expect(found.businessObject).toBeDefined();
    });

    it('returns null for an unknown id', () => {
      expect(findProcessShape(project, 'missing')).toBeNull();
    });
  });
});
