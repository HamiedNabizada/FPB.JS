// tests/unit/validation/ModelChecker.test.js
import { describe, it, expect } from 'vitest';

import { checkModel, RULES } from '../../../app/fpb/validation/ModelChecker.js';

// Type hierarchy as in fpb-moddle (Usage extends Flow there)
const SUPER = {
  'fpb:Product': ['fpb:State'],
  'fpb:Energy': ['fpb:State'],
  'fpb:Information': ['fpb:State'],
  'fpb:ParallelFlow': ['fpb:Flow'],
  'fpb:AlternativeFlow': ['fpb:Flow'],
  'fpb:Usage': ['fpb:Flow']
};

function bo(id, type, extra = {}) {
  return { id, $type: type, $instanceOf: (t) => t === type || (SUPER[type] || []).includes(t), ...extra };
}

function shape(id, type, bounds, extra = {}) {
  return { id, type, ...bounds, incoming: [], outgoing: [], businessObject: bo(id, type, extra) };
}

function connect(id, type, source, target) {
  const c = { id, type, source, target, waypoints: [{}, {}], businessObject: bo(id, type) };
  source.outgoing.push(c);
  target.incoming.push(c);
  return c;
}

/** Process with a system limit at 100,100 400x400 */
function process(id, inner, outer = [], extra = {}) {
  const sl = shape(id + '-sl', 'fpb:SystemLimit', { x: 100, y: 100, width: 400, height: 400 }, { elementsContainer: inner });
  return { id, type: 'fpb:Process', businessObject: bo(id, 'fpb:Process', { elementsContainer: [sl, ...outer], ...extra }) };
}

const STATE = { width: 50, height: 50 };
const at = (x, y, size = STATE) => ({ x, y, ...size });
const OPERATOR = { width: 150, height: 80 };

function validModel() {
  const input = shape('in', 'fpb:Product', at(275, 75), { name: 'Input' });
  const op = shape('op', 'fpb:ProcessOperator', at(225, 260, OPERATOR), { name: 'Machining' });
  const output = shape('out', 'fpb:Product', at(275, 475), { name: 'Output' });
  const resource = shape('tr', 'fpb:TechnicalResource', at(600, 260, OPERATOR), { name: 'Machine' });
  const f1 = connect('f1', 'fpb:Flow', input, op);
  const f2 = connect('f2', 'fpb:Flow', op, output);
  const u = connect('u1', 'fpb:Usage', op, resource);
  return { input, op, output, resource, process: process('p', [input, op, output, f1, f2], [resource, u]) };
}

const rules = (issues) => issues.map((i) => i.rule).sort();

describe('ModelChecker', () => {

  it('finds nothing in a valid model, usages are not flows', () => {
    expect(checkModel([validModel().process])).toEqual([]);
  });

  it('uses the severities of the rule catalog', () => {
    expect(RULES.B1.severity).toBe('error');
    expect(RULES.G1.severity).toBe('warning');
    expect(RULES.D3.severity).toBe('info');
  });

  it('B1, B2, B3: placement relative to the system limit', () => {
    const m = validModel();
    m.input.x = 700;
    m.op.x = 450;
    m.resource.x = 400;
    expect(rules(checkModel([m.process]))).toEqual(['B1', 'B2', 'B3']);
  });

  it('G1 and G4: operator without output, unconnected state', () => {
    const m = validModel();
    m.op.outgoing = m.op.outgoing.filter((c) => c.type === 'fpb:Usage');
    m.output.incoming = [];
    expect(rules(checkModel([m.process]))).toEqual(['G1', 'G4']);
  });

  it('C9: normal flow mixed with a parallel flow at one source', () => {
    const m = validModel();
    const second = shape('out2', 'fpb:Energy', at(375, 475), { name: 'Heat' });
    m.process.businessObject.elementsContainer[0].businessObject.elementsContainer.push(second);
    connect('f3', 'fpb:ParallelFlow', m.op, second);
    expect(rules(checkModel([m.process]))).toEqual(['C9']);
  });

  it('C5 and G3: duplicate connection and flow to itself', () => {
    const m = validModel();
    const inner = m.process.businessObject.elementsContainer[0].businessObject.elementsContainer;
    inner.push(connect('f1b', 'fpb:Flow', m.input, m.op));
    inner.push(connect('self', 'fpb:Flow', m.op, m.op));
    expect(rules(checkModel([m.process]))).toEqual(['C5', 'G3']);
  });

  it('D3 to D5 as notes for unnamed elements', () => {
    const m = validModel();
    m.op.businessObject.name = '';
    m.input.businessObject.name = ' ';
    m.resource.businessObject.name = undefined;
    const issues = checkModel([m.process]);
    expect(rules(issues)).toEqual(['D3', 'D4', 'D5']);
    expect(issues.every((i) => i.severity === 'info')).toBe(true);
  });

  describe('decomposition', () => {

    function decomposed(childStates) {
      const m = validModel();
      const child = process('c', childStates, [], { isDecomposedProcessOperator: m.op.businessObject, parent: m.process });
      m.op.businessObject.decomposedView = child;
      return { m, child };
    }

    it('F5: the decomposition lacks an output of the operator', () => {
      const { m, child } = decomposed([shape('in', 'fpb:Product', at(275, 75), { name: 'Input' })]);
      const issues = checkModel([m.process, child]);
      expect(rules(issues)).toEqual(['F5', 'G4']);
      expect(issues.find((i) => i.rule === 'F5').message).toContain('"Output"');
    });

    it('B6: boundary state inside instead of on the border', () => {
      const inside = shape('out', 'fpb:Product', at(275, 300), { name: 'Output' });
      const { m, child } = decomposed([shape('in', 'fpb:Product', at(275, 75), { name: 'Input' }), inside]);
      const b6 = checkModel([m.process, child]).filter((i) => i.rule === 'B6');
      expect(b6.map((i) => [i.elementId, i.process.id])).toEqual([['out', 'c']]);
    });
  });
});
