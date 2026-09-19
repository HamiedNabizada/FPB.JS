// tests/unit/preview/PreviewGeometry.test.js
import { describe, it, expect } from 'vitest';

import { previewGeometry } from '../../../app/fpb/preview/PreviewGeometry.js';

const SUPER = {
  'fpb:Product': ['fpb:State'],
  'fpb:Energy': ['fpb:State'],
  'fpb:Information': ['fpb:State'],
  'fpb:ParallelFlow': ['fpb:Flow'],
  'fpb:Usage': ['fpb:Flow']
};

function bo(id, type, extra = {}) {
  return { id, $type: type, $instanceOf: (t) => t === type || (SUPER[type] || []).includes(t), ...extra };
}

function shape(id, type, bounds, extra = {}) {
  return { id, type, ...bounds, businessObject: bo(id, type, extra) };
}

function connection(id, type, waypoints) {
  return { id, type, waypoints, businessObject: bo(id, type) };
}

/** Layer 400x400 at 100,100 with two elements and one flow */
function layer() {
  const state = shape('s', 'fpb:Product', { x: 100, y: 100, width: 50, height: 50 }, { name: 'Input' });
  const operator = shape('o', 'fpb:ProcessOperator', { x: 300, y: 450, width: 150, height: 50 });
  const flow = connection('f', 'fpb:Flow', [{ x: 125, y: 150 }, { x: 375, y: 450 }]);
  const usage = connection('u', 'fpb:Usage', [{ x: 375, y: 500 }, { x: 500, y: 500 }]);
  const systemLimit = shape('sl', 'fpb:SystemLimit', { x: 100, y: 100, width: 400, height: 400 }, {
    elementsContainer: [state, operator, flow]
  });
  return {
    state,
    operator,
    process: { id: 'p', type: 'fpb:Process', businessObject: bo('p', 'fpb:Process', { elementsContainer: [systemLimit, usage] }) }
  };
}

describe('previewGeometry', () => {

  const box = { width: 200, height: 100 };

  it('scales the layer into the box and keeps the proportions', () => {
    const geometry = previewGeometry(layer().process, box);

    expect(geometry.width).toBe(200);
    expect(geometry.height).toBe(100);
    // 400x400 into 200x100: factor 0.25, centred horizontally
    const systemLimit = geometry.shapes.find((s) => s.kind === 'systemLimit');
    expect(systemLimit).toMatchObject({ width: 100, height: 100, y: 0, x: 50 });
    const state = geometry.shapes.find((s) => s.type === 'fpb:Product');
    expect(state).toMatchObject({ kind: 'product', name: 'Input', width: 12.5, height: 12.5, x: 50, y: 0 });
  });

  it('names the kind of every element and takes connections along', () => {
    const geometry = previewGeometry(layer().process, box);

    expect(geometry.shapes.map((s) => s.kind).sort()).toEqual(['operator', 'product', 'systemLimit']);
    expect(geometry.connections.map((c) => c.kind).sort()).toEqual(['flow', 'usage']);
    expect(geometry.connections.find((c) => c.kind === 'flow').points).toEqual([
      { x: 56.3, y: 12.5 }, { x: 118.8, y: 87.5 }
    ]);
  });

  it('does not enlarge a small layer', () => {
    const model = layer();
    model.process.businessObject.elementsContainer[0].width = 40;
    model.process.businessObject.elementsContainer[0].height = 40;
    model.state.width = 10;
    model.state.height = 10;
    model.operator.x = 110;
    model.operator.y = 110;
    model.operator.width = 20;
    model.operator.height = 10;

    const geometry = previewGeometry(model.process, box);
    const systemLimit = geometry.shapes.find((s) => s.kind === 'systemLimit');
    expect(systemLimit.width).toBe(40);
  });

  it('returns null without elements or process', () => {
    const leer = { id: 'p', type: 'fpb:Process', businessObject: bo('p', 'fpb:Process', { elementsContainer: [] }) };
    expect(previewGeometry(leer, box)).toBeNull();
    expect(previewGeometry(null, box)).toBeNull();
  });
});
