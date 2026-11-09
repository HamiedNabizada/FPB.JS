// tests/unit/fixtures/largeModel.test.js
import { describe, it, expect } from 'vitest';

import { generateLargeModel } from '../../fixtures/generate/largeModel.js';

/**
 * The generator of large models for the performance budget (032a V9): valid
 * models of any size, decomposed through operators, boundary states with the
 * ids of the operator's states.
 */

const SHAPES = /Product|Energy|Information|ProcessOperator/;

describe('generateLargeModel', () => {

  it('the generated model has the asked number of layers and elements per layer', () => {
    const data = generateLargeModel({ layers: 4, perLayer: 21 });
    const processes = data.filter((entry) => entry.process);

    expect(data[0].$type).toBe('fpb:Project');
    expect(data[0].entryPoint).toBe(processes[0].process.id);
    expect(processes).toHaveLength(4);
    processes.forEach((entry) => {
      const shapes = entry.elementDataInformation.filter((item) => SHAPES.test(item.$type));
      expect(shapes).toHaveLength(21);
      // every shape and connection has its place
      const placed = new Set(entry.elementVisualInformation.map((v) => v.id));
      entry.elementDataInformation.forEach((item) => expect(placed.has(item.id)).toBe(true));
    });
  });

  it('every decomposed operator has a layer whose boundary states carry the ids of its flows', () => {
    const data = generateLargeModel({ layers: 3, perLayer: 11 });
    const processes = data.filter((entry) => entry.process);

    processes.slice(1).forEach((child) => {
      const operatorId = child.process.isDecomposedProcessOperator;
      const parent = processes.find((p) => p.process.id === child.process.parent);
      const items = new Map(parent.elementDataInformation.map((item) => [item.id, item]));
      const operator = items.get(operatorId);
      expect(operator.decomposedView).toBe(child.process.id);

      const ends = (ids, end) => ids.map((id) => items.get(id)[end]);
      const inputs = ends(operator.incoming, 'sourceRef');
      const outputs = ends(operator.outgoing, 'targetRef');
      const childStates = new Set(child.elementDataInformation.filter((item) => SHAPES.test(item.$type)).map((item) => item.id));
      [...inputs, ...outputs].forEach((id) => expect(childStates.has(id)).toBe(true));
    });
  });

  it('gives the same model for the same size', () => {
    expect(JSON.stringify(generateLargeModel({ layers: 2, perLayer: 7 })))
      .toBe(JSON.stringify(generateLargeModel({ layers: 2, perLayer: 7 })));
  });
});
