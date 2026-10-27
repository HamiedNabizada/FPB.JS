import { describe, it, expect } from 'vitest';

import { buildTree, pathTo, layerName, isRootProcess } from '../../../app/fpb/layers/tree.js';

/**
 * The layers of a model as a tree and the path to a layer (016d T1): read
 * from the processes each time, in the shape the modeler keeps them in.
 */

const bo = (type, props) => Object.assign({ $type: type, $instanceOf: (t) => t === type }, props);

function model() {
  const project = bo('fpb:Project', { name: 'FPBJS_Project' });
  const root = { id: 'R', businessObject: bo('fpb:Process', { parent: project }) };
  const child = { id: 'C', businessObject: bo('fpb:Process', { parent: root, isDecomposedProcessOperator: bo('fpb:ProcessOperator', { name: 'Erhitzen' }) }) };
  const grandchild = { id: 'G', businessObject: bo('fpb:Process', { parent: child, isDecomposedProcessOperator: bo('fpb:ProcessOperator', { name: 'Vorwärmen' }) }) };
  root.businessObject.consistsOfProcesses = [child];
  child.businessObject.consistsOfProcesses = [grandchild];
  return { project, root, child, grandchild };
}

const ids = (nodes) => nodes.map((node) => ({ id: node.id, children: ids(node.children) }));

describe('layers tree', () => {

  it('builds the tree from the roots down', () => {
    const { root, child, grandchild } = model();
    expect(ids(buildTree([root, child, grandchild]))).toEqual([
      { id: 'R', children: [{ id: 'C', children: [{ id: 'G', children: [] }] }] }
    ]);
    expect(buildTree([root])[0].process).toBe(root);
  });

  it('knows the root layer', () => {
    const { root, child } = model();
    expect(isRootProcess(root)).toBe(true);
    expect(isRootProcess(child)).toBe(false);
  });

  it('finds the path from the root to a layer', () => {
    const { root, child, grandchild } = model();
    expect(pathTo(grandchild)).toEqual([root, child, grandchild]);
    expect(pathTo(root)).toEqual([root]);
    expect(pathTo(null)).toEqual([]);
  });

  it('stops at a cycle instead of hanging', () => {
    const { root, child } = model();
    root.businessObject.parent = child;
    expect(pathTo(child).length).toBeLessThanOrEqual(2);
  });

  it('names a layer like the tree: project, decomposed operator, cut, unnamed', () => {
    const { root, child } = model();
    expect(layerName(root)).toBe('FPBJS_Project');
    expect(layerName(child)).toBe('Erhitzen');
    child.businessObject.isDecomposedProcessOperator.name = 'E'.repeat(30);
    expect(layerName(child, 25)).toBe('E'.repeat(25) + '...');
    expect(layerName(child)).toBe('E'.repeat(30));
    child.businessObject.isDecomposedProcessOperator.name = '';
    expect(layerName(child)).toBe('unnamed');
  });
});
