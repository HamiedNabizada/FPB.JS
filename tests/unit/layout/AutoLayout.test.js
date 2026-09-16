// tests/unit/layout/AutoLayout.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  layoutImportData,
  needsLayout,
  LAYOUT_CONSTANTS
} from '../../../app/fpb/layout/AutoLayout.js';

const STATES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];
const FLOWS = ['fpb:Flow', 'fpb:ParallelFlow', 'fpb:AlternativeFlow'];

const temperieren = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'temperieren.json'), 'utf8'));

function withoutLayout(data) {
  const copy = JSON.parse(JSON.stringify(data));
  copy.forEach((entry) => {
    if (entry.process) {
      delete entry.elementVisualInformation;
    }
  });
  return copy;
}

const rootOf = (data) => data.find((entry) => entry.process && !entry.process.isDecomposedProcessOperator);
const childOf = (data) => data.find((entry) => entry.process && entry.process.isDecomposedProcessOperator);
const dataByName = (entry, name) => entry.elementDataInformation.find((item) => item.name === name);
const systemLimitOf = (entry) => entry.elementDataInformation.find((item) => item.$type === 'fpb:SystemLimit');

function visualOf(entry, id) {
  return entry.elementVisualInformation.find((item) => item.id === id);
}

/** 'top', 'bottom' or 'inside', using the tolerance of checkIfOnSystemBorder. */
function edgeOf(entry, id) {
  const systemLimit = visualOf(entry, systemLimitOf(entry).id);
  const box = visualOf(entry, id);
  const centerY = box.y + box.height / 2;
  if (Math.abs(centerY - systemLimit.y) <= LAYOUT_CONSTANTS.BORDER_TOLERANCE) {
    return 'top';
  }
  if (Math.abs(centerY - systemLimit.y - systemLimit.height) <= LAYOUT_CONSTANTS.BORDER_TOLERANCE) {
    return 'bottom';
  }
  return 'inside';
}

function statesByEdge(entry) {
  const result = {};
  systemLimitOf(entry).elementsContainer
    .map((id) => entry.elementDataInformation.find((item) => item.id === id))
    .filter((item) => item && STATES.includes(item.$type))
    .forEach((item) => {
      result[item.name] = edgeOf(entry, item.id);
    });
  return result;
}

const inside = (point, box) => point.x > box.x + 1 && point.x < box.x + box.width - 1
  && point.y > box.y + 1 && point.y < box.y + box.height - 1;
const onOutline = (point, box) => point.x >= box.x - 0.5 && point.x <= box.x + box.width + 0.5
  && point.y >= box.y - 0.5 && point.y <= box.y + box.height + 0.5 && !inside(point, box);
const boxesOverlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Geometric problems of one process: overlaps, detached or diagonal lines, lines through elements. */
function geometryProblems(entry) {
  const problems = [];
  const items = entry.elementDataInformation;
  const byId = new Map(items.map((item) => [item.id, item]));
  const systemLimit = systemLimitOf(entry);
  const inner = systemLimit ? systemLimit.elementsContainer.map((id) => byId.get(id)).filter(Boolean) : [];
  const shapes = [
    ...inner.filter((item) => STATES.includes(item.$type) || item.$type === 'fpb:ProcessOperator'),
    ...items.filter((item) => item.$type === 'fpb:TechnicalResource')
  ];
  const connections = items.filter((item) => FLOWS.includes(item.$type) || item.$type === 'fpb:Usage');

  shapes.forEach((shape, i) => {
    const box = visualOf(entry, shape.id);
    if (!box) {
      problems.push(`no position: ${shape.name}`);
      return;
    }
    shapes.slice(i + 1).forEach((other) => {
      const otherBox = visualOf(entry, other.id);
      if (otherBox && boxesOverlap(box, otherBox)) {
        problems.push(`overlap: ${shape.name} / ${other.name}`);
      }
    });
  });

  connections.forEach((connection) => {
    const visual = visualOf(entry, connection.id);
    const label = `${byId.get(connection.sourceRef).name}->${byId.get(connection.targetRef).name}`;
    if (!visual || visual.waypoints.length < 2) {
      problems.push(`no route: ${label}`);
      return;
    }
    const points = visual.waypoints;
    if (!onOutline(points[0], visualOf(entry, connection.sourceRef))) {
      problems.push(`start detached: ${label}`);
    }
    if (!onOutline(points[points.length - 1], visualOf(entry, connection.targetRef))) {
      problems.push(`end detached: ${label}`);
    }
    for (let i = 0; i < points.length - 1; i++) {
      const [a, b] = [points[i], points[i + 1]];
      if (connection.$type !== 'fpb:AlternativeFlow' && Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) {
        problems.push(`diagonal: ${label}`);
      }
      shapes.filter((shape) => shape.id !== connection.sourceRef && shape.id !== connection.targetRef)
        .forEach((shape) => {
          const box = visualOf(entry, shape.id);
          for (let t = 1; t < 20; t++) {
            if (inside({ x: a.x + (b.x - a.x) * t / 20, y: a.y + (b.y - a.y) * t / 20 }, box)) {
              problems.push(`through ${shape.name}: ${label}`);
              break;
            }
          }
        });
    }
  });
  return problems;
}

describe('AutoLayout', () => {

  describe('needsLayout()', () => {

    it('is false for a complete model', () => {
      expect(needsLayout(temperieren())).toBe(false);
    });

    it('is true without visual information', () => {
      expect(needsLayout(withoutLayout(temperieren()))).toBe(true);
    });

    it('is true if a single connection has no waypoints', () => {
      const data = temperieren();
      const root = rootOf(data);
      const flow = root.elementDataInformation.find((item) => item.$type === 'fpb:Flow');
      root.elementVisualInformation = root.elementVisualInformation.filter((item) => item.id !== flow.id);
      expect(needsLayout(data)).toBe(true);
    });

    it('does not touch its input', () => {
      const data = withoutLayout(temperieren());
      const before = JSON.stringify(data);
      needsLayout(data);
      expect(JSON.stringify(data)).toBe(before);
    });
  });

  describe('layoutImportData() without any visual information', () => {

    const original = temperieren();
    const result = layoutImportData(withoutLayout(original));

    it('arranges every process from scratch', () => {
      expect(result.changed).toBe(true);
      expect(result.report.map((item) => item.mode)).toEqual(['full', 'full']);
    });

    it('does not modify the input and is deterministic', () => {
      const input = withoutLayout(original);
      const before = JSON.stringify(input);
      const first = layoutImportData(input);
      const second = layoutImportData(input);
      expect(JSON.stringify(input)).toBe(before);
      expect(JSON.stringify(first.data)).toBe(JSON.stringify(second.data));
    });

    it('keeps the data information unchanged', () => {
      result.data.forEach((entry, index) => {
        if (entry.process) {
          expect(entry.elementDataInformation).toEqual(original[index].elementDataInformation);
          expect(entry.process).toEqual(original[index].process);
        }
      });
    });

    it('puts inputs on the upper edge, outputs on the lower edge, the rest inside', () => {
      expect(statesByEdge(rootOf(result.data))).toEqual({
        Rohstoff: 'top',
        Strom: 'top',
        Temperatur: 'top',
        Abwärme: 'bottom',
        Warmprodukt: 'inside',
        Ausschuss: 'bottom',
        Gutprodukt: 'bottom'
      });
    });

    it('gives the same edges as the hand drawn original', () => {
      [rootOf, childOf].forEach((select) => {
        expect(statesByEdge(select(result.data))).toEqual(statesByEdge(select(original)));
      });
    });

    it('treats the states of the decomposed operator as boundary states in the child', () => {
      const child = childOf(result.data);
      expect(statesByEdge(child)).toMatchObject({
        Rohstoff: 'top',
        Strom: 'top',
        Temperatur: 'top',
        Abwärme: 'bottom',
        Warmprodukt: 'bottom'
      });
    });

    it('orders the boundary states of the child like at the parent operator', () => {
      const parentX = (name) => {
        const root = rootOf(result.data);
        return visualOf(root, dataByName(root, name).id).x;
      };
      const childX = (name) => {
        const child = childOf(result.data);
        return visualOf(child, dataByName(child, name).id).x;
      };
      const inputs = ['Rohstoff', 'Strom', 'Temperatur'];
      const byParent = inputs.slice().sort((a, b) => parentX(a) - parentX(b));
      const byChild = inputs.slice().sort((a, b) => childX(a) - childX(b));
      expect(byChild).toEqual(byParent);
    });

    it('draws without overlaps, detached ends, diagonal flows or lines through elements', () => {
      expect(geometryProblems(rootOf(result.data))).toEqual([]);
      expect(geometryProblems(childOf(result.data))).toEqual([]);
    });

    it('places TechnicalResources outside the SystemLimit', () => {
      const root = rootOf(result.data);
      const systemLimit = visualOf(root, systemLimitOf(root).id);
      const resource = visualOf(root, dataByName(root, 'Heizplatte').id);
      expect(boxesOverlap(resource, systemLimit)).toBe(false);
    });

    it('keeps the SystemLimit name clear of the input states', () => {
      const root = rootOf(result.data);
      const systemLimit = visualOf(root, systemLimitOf(root).id);
      const rightmostInput = Math.max(...['Rohstoff', 'Strom', 'Temperatur']
        .map((name) => visualOf(root, dataByName(root, name).id))
        .map((box) => box.x + box.width));
      const nameWidth = systemLimitOf(root).name.length * LAYOUT_CONSTANTS.NAME_CHAR_WIDTH;
      expect(systemLimit.x + systemLimit.width - rightmostInput).toBeGreaterThanOrEqual(nameWidth);
    });

    it('uses no negative coordinates', () => {
      result.data.filter((entry) => entry.process).forEach((entry) => {
        entry.elementVisualInformation.forEach((visual) => {
          if (typeof visual.x === 'number') {
            expect(visual.x).toBeGreaterThanOrEqual(0);
            expect(visual.y).toBeGreaterThanOrEqual(0);
          }
        });
      });
    });
  });

  describe('layoutImportData() with complete visual information', () => {

    it('returns an unchanged copy in the default mode', () => {
      const data = temperieren();
      const result = layoutImportData(data);
      expect(result.changed).toBe(false);
      expect(result.data).toEqual(data);
      expect(result.data).not.toBe(data);
    });

    it('arranges everything anew in mode all', () => {
      const result = layoutImportData(temperieren(), { mode: 'all' });
      expect(result.report.map((item) => item.mode)).toEqual(['full', 'full']);
      expect(geometryProblems(rootOf(result.data))).toEqual([]);
    });
  });

  describe('layoutImportData() with partial visual information', () => {

    it('keeps existing positions and adds the missing ones', () => {
      const data = temperieren();
      const root = rootOf(data);
      const missing = ['Warmprodukt', 'Ausschuss', 'Heizplatte'].map((name) => dataByName(root, name).id);
      root.elementVisualInformation = root.elementVisualInformation.filter((item) => !missing.includes(item.id));
      const kept = root.elementVisualInformation
        .filter((item) => typeof item.x === 'number')
        .map((item) => ({ id: item.id, x: item.x, y: item.y, width: item.width, height: item.height }));

      const result = layoutImportData(data);
      const laidOut = rootOf(result.data);

      expect(result.report[0].mode).toBe('incremental');
      kept.forEach((item) => {
        expect(visualOf(laidOut, item.id)).toMatchObject(item);
      });
      expect(edgeOf(laidOut, missing[0])).toBe('inside');
      expect(edgeOf(laidOut, missing[1])).toBe('bottom');
      expect(geometryProblems(laidOut)).toEqual([]);
    });

    it('reroutes connections of newly placed elements', () => {
      const data = temperieren();
      const root = rootOf(data);
      const warm = dataByName(root, 'Warmprodukt');
      root.elementVisualInformation = root.elementVisualInformation.filter((item) => item.id !== warm.id);

      const laidOut = rootOf(layoutImportData(data).data);
      expect(geometryProblems(laidOut)).toEqual([]);
    });

    it('pushes TechnicalResources aside when the SystemLimit has to grow', () => {
      const data = temperieren();
      const root = rootOf(data);
      const systemLimit = systemLimitOf(root);
      const pruefen = dataByName(root, 'Prüfen');
      for (let i = 0; i < 8; i++) {
        const state = { $type: 'fpb:Information', id: `new-state-${i}`, name: `New${i}`, incoming: [], outgoing: [`new-flow-${i}`] };
        const flow = { $type: 'fpb:ParallelFlow', id: `new-flow-${i}`, sourceRef: state.id, targetRef: pruefen.id, inTandemWith: [] };
        root.elementDataInformation.push(state, flow);
        systemLimit.elementsContainer.push(state.id, flow.id);
        pruefen.incoming.push(flow.id);
      }

      const laidOut = rootOf(layoutImportData(data).data);
      for (let i = 0; i < 8; i++) {
        expect(edgeOf(laidOut, `new-state-${i}`)).toBe('top');
      }
      const resource = visualOf(laidOut, dataByName(laidOut, 'Heizplatte').id);
      expect(boxesOverlap(resource, visualOf(laidOut, systemLimit.id))).toBe(false);
      expect(geometryProblems(laidOut)).toEqual([]);
    });
  });

  describe('special structures', () => {

    it('draws a rework loop as a back edge without problems', () => {
      const data = withoutLayout(temperieren());
      const root = rootOf(data);
      const systemLimit = systemLimitOf(root);
      const pruefen = dataByName(root, 'Prüfen');
      const erhitzen = dataByName(root, 'Erhitzen');
      const rework = { $type: 'fpb:Product', id: 'rework', name: 'Nacharbeit', incoming: ['to-rework'], outgoing: ['from-rework'] };
      root.elementDataInformation.push(
        rework,
        { $type: 'fpb:AlternativeFlow', id: 'to-rework', sourceRef: pruefen.id, targetRef: rework.id, inTandemWith: [] },
        { $type: 'fpb:ParallelFlow', id: 'from-rework', sourceRef: rework.id, targetRef: erhitzen.id, inTandemWith: [] }
      );
      systemLimit.elementsContainer.push('rework', 'to-rework', 'from-rework');

      const laidOut = rootOf(layoutImportData(data).data);
      expect(edgeOf(laidOut, 'rework')).toBe('inside');
      expect(geometryProblems(laidOut)).toEqual([]);
    });

    it('handles a process without SystemLimit and an isolated state', () => {
      const data = [
        { $type: 'fpb:Project', name: 'P', targetNamespace: 'x', entryPoint: 'p1' },
        {
          process: { $type: 'fpb:Process', id: 'p1', elementsContainer: ['sl', 'tr'], isDecomposedProcessOperator: null },
          elementDataInformation: [
            { $type: 'fpb:SystemLimit', id: 'sl', elementsContainer: ['s1'] },
            { $type: 'fpb:Product', id: 's1', name: 'alone', incoming: [], outgoing: [] },
            { $type: 'fpb:TechnicalResource', id: 'tr', name: 'unused', incoming: [], outgoing: [] }
          ]
        },
        {
          process: { $type: 'fpb:Process', id: 'p2', elementsContainer: ['tr2'], isDecomposedProcessOperator: null },
          elementDataInformation: [{ $type: 'fpb:TechnicalResource', id: 'tr2', name: 'only', incoming: [], outgoing: [] }]
        }
      ];
      const result = layoutImportData(data);
      expect(needsLayout(result.data)).toBe(false);
      expect(geometryProblems(result.data[1])).toEqual([]);
    });

    it('keeps many TechnicalResources on the left side at non negative coordinates', () => {
      // Per level a left operator with a resource and a right operator blocking it.
      const elements = [];
      const container = [];
      const outer = ['sl'];
      const add = (item, list) => {
        elements.push(item);
        list.push(item.id);
      };
      add({ $type: 'fpb:Product', id: 's0', name: 'S0', incoming: [], outgoing: [] }, container);
      for (let i = 0; i < 14; i++) {
        add({ $type: 'fpb:ProcessOperator', id: `left${i}`, name: `Left${i}`, incoming: [], outgoing: [] }, container);
        add({ $type: 'fpb:ProcessOperator', id: `right${i}`, name: `Right${i}`, incoming: [], outgoing: [] }, container);
        add({ $type: 'fpb:Product', id: `s${i + 1}`, name: `S${i + 1}`, incoming: [], outgoing: [] }, container);
        add({ $type: 'fpb:Flow', id: `fl${i}`, sourceRef: `s${i}`, targetRef: `left${i}` }, container);
        add({ $type: 'fpb:Flow', id: `fr${i}`, sourceRef: `s${i}`, targetRef: `right${i}` }, container);
        add({ $type: 'fpb:Flow', id: `fo${i}`, sourceRef: `left${i}`, targetRef: `s${i + 1}` }, container);
        add({ $type: 'fpb:TechnicalResource', id: `tr${i}`, name: `Res${i}`, incoming: [], outgoing: [] }, outer);
        add({ $type: 'fpb:Usage', id: `u${i}`, sourceRef: `left${i}`, targetRef: `tr${i}` }, outer);
      }
      const data = [
        { $type: 'fpb:Project', name: 'P', targetNamespace: 'x', entryPoint: 'p1' },
        {
          process: { $type: 'fpb:Process', id: 'p1', elementsContainer: outer, isDecomposedProcessOperator: null },
          elementDataInformation: [{ $type: 'fpb:SystemLimit', id: 'sl', elementsContainer: container }, ...elements]
        }
      ];
      const entry = layoutImportData(data).data[1];
      const systemLimit = visualOf(entry, 'sl');
      const leftResources = entry.elementVisualInformation
        .filter((visual) => visual.type === 'fpb:TechnicalResource' && visual.x + visual.width <= systemLimit.x);
      expect(leftResources.length).toBe(14);
      entry.elementVisualInformation.forEach((visual) => {
        (visual.waypoints || [visual]).forEach((point) => {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeGreaterThanOrEqual(0);
        });
      });
      expect(geometryProblems(entry)).toEqual([]);
    });

    it('ignores non array input', () => {
      expect(layoutImportData(null)).toEqual({ data: null, changed: false, report: [] });
      expect(needsLayout(undefined)).toBe(false);
    });
  });
});
