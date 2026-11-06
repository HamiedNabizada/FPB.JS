// tests/unit/validation/ModelChecker.test.js
import { describe, it, expect } from 'vitest';

import { checkModel as runCheck, RULES } from '../../../app/fpb/validation/ModelChecker.js';
import { fill, translateMessage } from '../../../app/fpb/i18n/language.js';

// every finding of this file, for the last test (016h T15)
const seen = [];
const checkModel = (...args) => {
  const issues = runCheck(...args);
  seen.push(...issues);
  return issues;
};

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

// every element has a version and a revision (D8), unless a test says otherwise
function shape(id, type, bounds, extra = {}) {
  const identification = { versionNumber: '1', revisionNumber: '0', ...(extra.identification || {}) };
  return { id, type, ...bounds, incoming: [], outgoing: [], businessObject: bo(id, type, { ...extra, identification }) };
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
    // 031: flows the guideline does not know are errors (N2), identification is mild (N3)
    expect(['C1', 'C2', 'C3', 'C4', 'D1'].map((r) => RULES[r].severity)).toEqual(['error', 'error', 'error', 'error', 'error']);
    expect(['A3', 'A4', 'D7'].map((r) => RULES[r].severity)).toEqual(['warning', 'warning', 'warning']);
    expect(RULES.D8.severity).toBe('info');
  });

  // 031 V1: what is checked on the model, in the web app and in the plugin;
  // D6 stays with the plugin (a process in FPB.js takes the name of its project or operator)
  it('RULES lists exactly the rules of FPB.js after 031', () => {
    expect(Object.keys(RULES).sort()).toEqual(['A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B6', 'C1', 'C2', 'C3', 'C4', 'C5', 'C9',
      'D1', 'D7', 'D8', 'E5', 'F5', 'F8', 'F9', 'G1', 'G3', 'G4']);
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
    // a loop at an operator is also a flow between two operators (C3, 031), as in OCL
    expect(rules(checkModel([m.process]))).toEqual(['C3', 'C5', 'G3']);
  });

  it('D7 warns about elements without long name, short name and name', () => {
    const m = validModel();
    m.op.businessObject.name = '';
    m.input.businessObject.name = ' ';
    m.resource.businessObject.name = undefined;
    const issues = checkModel([m.process]);
    expect(rules(issues)).toEqual(['D7', 'D7', 'D7']);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
    expect(issues.map((i) => i.message).sort()).toEqual(['A process operator has no name.', 'A state has no name.', 'A technical resource has no name.']);
  });

  it('D7: a long name alone is enough', () => {
    const m = validModel();
    m.input.businessObject.name = '';
    m.input.businessObject.identification.longName = 'Eingang';
    expect(checkModel([m.process])).toEqual([]);
  });

  it('A3 and A4: a process with one state and no operator', () => {
    const lonely = shape('s', 'fpb:Product', at(275, 75), { name: 'S' });
    const issues = checkModel([process('p', [lonely])]);
    const a = issues.filter((i) => i.rule === 'A3' || i.rule === 'A4');
    expect(a.map((i) => [i.rule, i.severity, i.elementId])).toEqual([['A3', 'warning', null], ['A4', 'warning', null]]);
  });

  it('A3 and A4: an empty process says nothing', () => {
    expect(checkModel([process('p', [])])).toEqual([]);
  });

  it('C2 and C3: a flow between two states and one between two operators', () => {
    const m = validModel();
    const inner = m.process.businessObject.elementsContainer[0].businessObject.elementsContainer;
    const op2 = shape('op2', 'fpb:ProcessOperator', at(225, 380, OPERATOR), { name: 'Polishing' });
    inner.push(op2, connect('ss', 'fpb:Flow', m.input, m.output), connect('oo', 'fpb:Flow', m.op, op2));
    const c = checkModel([m.process]).filter((i) => /^C[1-4]$/.test(i.rule));
    expect(c.map((i) => [i.rule, i.severity, i.elementId])).toEqual([['C2', 'error', 'ss'], ['C3', 'error', 'oo']]);
    expect(c[1].message).toBe('The flow from "Machining" to "Polishing" connects two process operators.');
  });

  it('C1: a flow from an operator to a technical resource', () => {
    const m = validModel();
    m.process.businessObject.elementsContainer.push(connect('ft', 'fpb:Flow', m.op, m.resource));
    const c = checkModel([m.process]).filter((i) => /^C[1-4]$/.test(i.rule));
    expect(c.map((i) => [i.rule, i.elementId])).toEqual([['C1', 'ft']]);
  });

  it('C4: a usage from a state; from the resource to the operator is fine', () => {
    const m = validModel();
    m.process.businessObject.elementsContainer.push(connect('us', 'fpb:Usage', m.input, m.op), connect('ur', 'fpb:Usage', m.resource, m.op));
    const c = checkModel([m.process]).filter((i) => /^C[1-4]$/.test(i.rule));
    expect(c.map((i) => [i.rule, i.elementId])).toEqual([['C4', 'us']]);
  });

  it('C3 and G3: a flow from an operator to itself', () => {
    const m = validModel();
    m.process.businessObject.elementsContainer[0].businessObject.elementsContainer.push(connect('self', 'fpb:Flow', m.op, m.op));
    expect(rules(checkModel([m.process]))).toEqual(['C3', 'G3']);
  });

  it('a connection without source or target is passed over', () => {
    const m = validModel();
    const dangling = { id: 'dangling', type: 'fpb:Flow', source: null, target: m.op, waypoints: [{}, {}], businessObject: bo('dangling', 'fpb:Flow') };
    m.process.businessObject.elementsContainer[0].businessObject.elementsContainer.push(dangling);
    expect(checkModel([m.process])).toEqual([]);
  });

  it('D1: two elements with one unique ID', () => {
    const m = validModel();
    m.input.businessObject.identification.uniqueIdent = 'X-1';
    m.output.businessObject.identification.uniqueIdent = 'X-1';
    const d1 = checkModel([m.process]).filter((i) => i.rule === 'D1');
    expect(d1.map((i) => [i.severity, i.elementId])).toEqual([['error', 'in']]);
    expect(d1[0].involved.map((x) => x.id)).toEqual(['in', 'out']);
    expect(d1[0].args.ident).toBe('"X-1"');
  });

  it('D8: one note per process with the count', () => {
    const m = validModel();
    m.input.businessObject.identification.versionNumber = '';
    m.op.businessObject.identification.revisionNumber = ' ';
    const d8 = checkModel([m.process]).filter((i) => i.rule === 'D8');
    expect(d8.map((i) => [i.severity, i.elementId, i.args.count])).toEqual([['info', null, '2']]);
    expect(d8[0].involved.map((x) => x.id)).toEqual(['in', 'op']);
    expect(d8[0].message).toBe('2 elements have no version or revision number.');
  });

  it('D8: an element without identification counts and nothing throws', () => {
    const m = validModel();
    delete m.input.businessObject.identification;
    const issues = checkModel([m.process]);
    expect(rules(issues)).toEqual(['D8']);
    expect(issues[0].message).toBe('One element has no version or revision number.');
  });

  // 024 point 6, 016b V8: every element a finding is about
  it('a duplicate connection names both connections as involved (C5)', () => {
    const m = validModel();
    const twin = connect('f1b', 'fpb:Flow', m.input, m.op);
    m.process.businessObject.elementsContainer[0].businessObject.elementsContainer.push(twin);
    const c5 = checkModel([m.process]).find((i) => i.rule === 'C5');
    expect(c5.involved.map((x) => x.id).sort()).toEqual(['f1', 'f1b']);
    expect(c5.involved.every((x) => x.process === m.process)).toBe(true);
  });

  it('a finding without others involved names its own element', () => {
    const m = validModel();
    m.input.businessObject.name = '';
    const d7 = checkModel([m.process]).find((i) => i.rule === 'D7');
    expect(d7.involved).toEqual([{ id: 'in', process: m.process }]);
  });

  describe('decomposition', () => {

    function decomposed(childStates) {
      const m = validModel();
      const child = process('c', childStates, [], { isDecomposedProcessOperator: m.op.businessObject, parent: m.process });
      m.op.businessObject.decomposedView = child;
      return { m, child };
    }

    it('D1: a boundary state on two layers is one element', () => {
      const copy = shape('in', 'fpb:Product', at(275, 75), { name: 'Input', identification: { uniqueIdent: 'in' } });
      const { m, child } = decomposed([copy, shape('out', 'fpb:Product', at(275, 475), { name: 'Output' })]);
      m.input.businessObject.identification.uniqueIdent = 'in';
      expect(checkModel([m.process, child]).filter((i) => i.rule === 'D1')).toEqual([]);
    });

    it('F5: the decomposition lacks an output of the operator', () => {
      const { m, child } = decomposed([shape('in', 'fpb:Product', at(275, 75), { name: 'Input' })]);
      const issues = checkModel([m.process, child]);
      // the child layer has one state and no operator yet: A3, A4 (031)
      expect(rules(issues)).toEqual(['A3', 'A4', 'F5', 'G4']);
      expect(issues.find((i) => i.rule === 'F5').message).toContain('"Output"');
    });

    /**
     * Operator with two outputs, decomposed: in the child layer two operators
     * produce the two boundary states.
     */
    function mitZweiAusgaengen(elternTyp, kindTyp) {
      const m = validModel();
      const zweiter = shape('out2', 'fpb:Energy', at(375, 475), { name: 'Heat' });
      m.process.businessObject.elementsContainer[0].businessObject.elementsContainer.push(zweiter);
      m.op.outgoing = m.op.outgoing.filter((c) => c.type === 'fpb:Usage');
      m.output.incoming = [];
      connect('p1', elternTyp, m.op, m.output);
      connect('p2', elternTyp, m.op, zweiter);

      const kindAusgang = shape('out', 'fpb:Product', at(275, 475), { name: 'Output' });
      const kindAusgang2 = shape('out2', 'fpb:Energy', at(375, 475), { name: 'Heat' });
      const op1 = shape('k1', 'fpb:ProcessOperator', at(200, 260, OPERATOR), { name: 'Step 1' });
      const op2 = shape('k2', 'fpb:ProcessOperator', at(380, 260, OPERATOR), { name: 'Step 2' });
      const eingang = shape('in', 'fpb:Product', at(275, 75), { name: 'Input' });
      connect('kf0', 'fpb:Flow', eingang, op1);
      connect('kf1', kindTyp, op1, kindAusgang);
      connect('kf2', kindTyp, op2, kindAusgang2);
      const child = process('c', [eingang, op1, op2, kindAusgang, kindAusgang2], [], {
        isDecomposedProcessOperator: m.op.businessObject, parent: m.process
      });
      m.op.businessObject.decomposedView = child;
      return { m, child };
    }

    it('F8: Eltern-Ebene alternativ, Kind-Ebene erzeugt beide parallel', () => {
      const { m, child } = mitZweiAusgaengen('fpb:AlternativeFlow', 'fpb:ParallelFlow');
      const f8 = checkModel([m.process, child]).filter((i) => i.rule === 'F8');
      expect(f8).toHaveLength(1);
      expect(f8[0].message).toContain('alternative');
      expect(f8[0].message).toContain('parallel');
      expect(f8[0].elementId).toBe('op');
    });

    it('F8 names the flows on both layers as involved, the child flows with their layer', () => {
      const { m, child } = mitZweiAusgaengen('fpb:AlternativeFlow', 'fpb:ParallelFlow');
      const f8 = checkModel([m.process, child]).find((i) => i.rule === 'F8');
      expect(f8.involved[0]).toEqual({ id: 'op', process: m.process });
      expect(f8.involved.filter((x) => x.process === m.process).map((x) => x.id).sort()).toEqual(['op', 'p1', 'p2']);
      expect(f8.involved.filter((x) => x.process === child).map((x) => x.id).sort()).toEqual(['kf1', 'kf2']);
    });

    it('F8 meldet nichts, wenn beide Ebenen zusammenpassen', () => {
      const gleich = mitZweiAusgaengen('fpb:ParallelFlow', 'fpb:ParallelFlow');
      expect(checkModel([gleich.m.process, gleich.child]).filter((i) => i.rule === 'F8')).toEqual([]);

      const alternativ = mitZweiAusgaengen('fpb:AlternativeFlow', 'fpb:AlternativeFlow');
      expect(checkModel([alternativ.m.process, alternativ.child]).filter((i) => i.rule === 'F8')).toEqual([]);
    });

    // F9: the copies of a boundary state are one object of the model
    it('F9: copies that differ are reported once, at the copy on the upper layer, with what differs', () => {
      const characteristic = { $type: 'fpbch:Characteristics', category: { shortName: 'C_1', longName: 'Temperatur' } };
      const m = validModel();
      Object.assign(m.input.businessObject.identification, { shortName: 'Input', longName: 'Raw material' });
      m.input.businessObject.characteristics = [characteristic];
      const below = shape('in', 'fpb:Product', at(275, 75), { name: 'Input', identification: { shortName: 'Input' } });
      const child = process('c', [below, shape('out', 'fpb:Product', at(275, 475), { name: 'Output' })], [], {
        isDecomposedProcessOperator: m.op.businessObject, parent: m.process
      });
      m.op.businessObject.decomposedView = child;

      const f9 = checkModel([m.process, child]).filter((i) => i.rule === 'F9');
      expect(f9).toHaveLength(1);
      expect(f9[0].elementId).toBe('in');
      expect(f9[0].process).toBe(m.process);
      expect(f9[0].message).toContain('"Input"');
      expect(f9[0].message).toContain('long name');
      expect(f9[0].message).toContain('characteristics');
      expect(f9[0].message).not.toContain('version');
      expect(RULES.F9.severity).toBe('info');
    });

    it('F9 names every copy as involved, the upper one first', () => {
      const m = validModel();
      Object.assign(m.input.businessObject.identification, { shortName: 'Input', longName: 'Raw material' });
      const below = shape('in', 'fpb:Product', at(275, 75), { name: 'Input', identification: { shortName: 'Input' } });
      const child = process('c', [below, shape('out', 'fpb:Product', at(275, 475), { name: 'Output' })], [], {
        isDecomposedProcessOperator: m.op.businessObject, parent: m.process
      });
      m.op.businessObject.decomposedView = child;

      const f9 = checkModel([m.process, child]).filter((i) => i.rule === 'F9');
      expect(f9[0].involved.map((i) => [i.id, i.process.id])).toEqual([['in', 'p'], ['in', 'c']]);
    });

    it('F9 compares the content: copies with equal objects of their own agree', () => {
      const m = validModel();
      Object.assign(m.input.businessObject.identification, { shortName: 'Input', longName: 'Raw material', versionNumber: '' });
      const below = shape('in', 'fpb:Product', at(275, 75), { name: 'Input', identification: { shortName: 'Input', longName: 'Raw material', versionNumber: '' } });
      const child = process('c', [below, shape('out', 'fpb:Product', at(275, 475), { name: 'Output' })], [], {
        isDecomposedProcessOperator: m.op.businessObject, parent: m.process
      });
      m.op.businessObject.decomposedView = child;

      expect(checkModel([m.process, child]).filter((i) => i.rule === 'F9')).toEqual([]);
    });

    it('B6: boundary state inside instead of on the border', () => {
      const inside = shape('out', 'fpb:Product', at(275, 300), { name: 'Output' });
      const { m, child } = decomposed([shape('in', 'fpb:Product', at(275, 75), { name: 'Input' }), inside]);
      const b6 = checkModel([m.process, child]).filter((i) => i.rule === 'B6');
      expect(b6.map((i) => [i.elementId, i.process.id])).toEqual([['out', 'c']]);
    });
  });

  // 016g B2: E5 of the rule catalog, Blatt 2 Abschn. 5.2 (validity limits)
  describe('E5 validity limits', () => {
    const withLimits = (limits) => [{
      $type: 'fpbch:Characteristics',
      category: { shortName: 'C_1' },
      descriptiveElement: { validityLimits: limits }
    }];

    it('E5: a lower limit above the upper limit is an error, reported once for all copies of a state', () => {
      const m = validModel();
      m.input.businessObject.characteristics = withLimits([{ limitType: 'acceptance region', from: 80, to: 20 }]);
      const below = shape('in', 'fpb:Product', at(275, 75), { name: 'Input', characteristics: m.input.businessObject.characteristics });
      const child = process('c', [below, shape('out', 'fpb:Product', at(275, 475), { name: 'Output' })], [], {
        isDecomposedProcessOperator: m.op.businessObject, parent: m.process
      });
      m.op.businessObject.decomposedView = child;

      const e5 = checkModel([m.process, child]).filter((i) => i.rule === 'E5');
      expect(e5).toHaveLength(1);
      expect(e5[0].severity).toBe('error');
      expect(e5[0].elementId).toBe('in');
      expect(e5[0].process).toBe(m.process);
      expect(e5[0].message).toContain('acceptance region');
      expect(e5[0].message).toContain('80');
      expect(e5[0].message).toContain('20');
      expect(RULES.E5).toEqual({ severity: 'error', title: 'Lower limit not above upper limit' });
    });

    // final review, Important 2: the region is a word of the interface, not data
    it('E5: a known region reads in the language of translate, other types stay as stored', () => {
      const m = validModel();
      m.input.businessObject.characteristics = withLimits([
        { limitType: 'acceptance region', from: 80, to: 20 },
        { limitType: 'Gutbereich', from: 9, to: 1 },
        { limitType: 'tolerance', from: 7, to: 3 }
      ]);
      const de = {
        'Characteristic {name} of {element}, {limit}: lower limit {from} is above upper limit {to}.': 'Merkmal {name} von {element}, {limit}: Untergrenze {from} liegt über Obergrenze {to}.',
        'acceptance region': 'Gutbereich'
      };
      const t = (s, r) => fill(de[s] || s, r);
      const e5 = checkModel([m.process]).filter((i) => i.rule === 'E5');
      expect(e5.map((i) => translateMessage(t, i))).toEqual([
        'Merkmal C_1 von "Input", Gutbereich: Untergrenze 80 liegt über Obergrenze 20.',
        'Merkmal C_1 von "Input", Gutbereich: Untergrenze 9 liegt über Obergrenze 1.',
        'Merkmal C_1 von "Input", tolerance: Untergrenze 7 liegt über Obergrenze 3.'
      ]);
      expect(e5[0].message).toBe('Characteristic C_1 of "Input", acceptance region: lower limit 80 is above upper limit 20.');
    });

    // review focus 3
    it('E5: limits stored as text compare as numbers', () => {
      const m = validModel();
      m.op.businessObject.characteristics = withLimits([{ limitType: 'permitted rejection region', from: '80', to: '20' }]);
      expect(checkModel([m.process]).filter((i) => i.rule === 'E5').map((i) => i.elementId)).toEqual(['op']);
    });

    it('E5: words and a single limit are not compared', () => {
      const m = validModel();
      m.input.businessObject.characteristics = withLimits([
        { limitType: 'acceptance region', from: 'low', to: 'high' },
        { limitType: 'permitted rejection region', from: 5 },
        { limitType: 'acceptance region', from: 10, to: 10 }
      ]);
      expect(checkModel([m.process]).filter((i) => i.rule === 'E5')).toEqual([]);
    });
  });
});

describe('ModelChecker messages (016h T15)', () => {

  it('every finding carries a template whose English fill is its message', () => {
    expect(seen.length).toBeGreaterThan(10);
    const broken = seen.filter((issue) => typeof issue.template !== 'string'
      || translateMessage(fill, issue) !== issue.message);
    expect(broken.map((issue) => issue.rule + ': ' + issue.message)).toEqual([]);
  });
});
