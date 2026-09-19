// tests/unit/search/SearchIndex.test.js
import { describe, it, expect } from 'vitest';

import { collectEntries, findEntries } from '../../../app/fpb/search/SearchIndex.js';

const STATES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];

// Shapes as the importer builds them; $instanceOf as moddle answers it
function shape(id, type, name, extra = {}) {
  const businessObject = { id, $type: type, name, ...extra };
  businessObject.$instanceOf = (t) => t === type || (t === 'fpb:State' && STATES.includes(type));
  return { id, type, businessObject };
}

function process(id, name, children, parentOperator) {
  const systemLimit = shape(id + '-sl', 'fpb:SystemLimit', 'SL ' + name, { elementsContainer: children });
  const bo = { id, $type: 'fpb:Process', elementsContainer: [systemLimit] };
  if (parentOperator) {
    bo.isDecomposedProcessOperator = { name: parentOperator };
  } else {
    bo.parent = { $type: 'fpb:Project', name: 'Projekt', $instanceOf: (t) => t === 'fpb:Project' };
  }
  return { id, type: 'fpb:Process', businessObject: bo };
}

describe('SearchIndex', () => {

  const flow = shape('f1', 'fpb:Flow', 'ignored');
  const top = process('p1', 'oben', [
    shape('s1', 'fpb:Product', 'Abwärme'),
    shape('o1', 'fpb:ProcessOperator', 'Erhitzen', { identification: { longName: 'Erhitzen des Rohstoffs' } }),
    flow
  ]);
  const child = process('p2', 'unten', [
    shape('s1', 'fpb:Product', 'Abwärme'),
    shape('o2', 'fpb:ProcessOperator', 'Vorwärmen')
  ], 'Erhitzen');

  const entries = collectEntries([top, child]);

  it('collects named elements of all layers, without flows', () => {
    expect(entries.map((e) => e.id).sort()).toEqual(['o1', 'o2', 'p1-sl', 'p2-sl', 's1', 's1']);
  });

  it('labels the layer: project name on top, operator name below', () => {
    expect(entries.find((e) => e.id === 'o2').layer).toBe('Erhitzen');
    expect(entries.find((e) => e.id === 'o1').layer).toBe('Projekt');
  });

  it('ranks exact before prefix before contained, current layer first', () => {
    const hits = findEntries(entries, 'abwärme', child);
    expect(hits.map((e) => e.process.id)).toEqual(['p2', 'p1']);
    expect(findEntries(entries, 'erhitzen', top).map((e) => e.id)).toEqual(['o1']);
    expect(findEntries(entries, 'wärme', top).map((e) => e.id)).toEqual(['s1', 's1', 'o2']);
  });

  it('finds by long name and id, ignores empty patterns', () => {
    expect(findEntries(entries, 'rohstoffs', top).map((e) => e.id)).toEqual(['o1']);
    expect(findEntries(entries, 'o2', top).map((e) => e.id)).toEqual(['o2']);
    expect(findEntries(entries, '   ', top)).toEqual([]);
  });
});
