// tests/e2e/auto-layout.spec.js
import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';
import { ImportPage } from './pages/ImportPage';
import { ModelBuilder } from './helpers/modelBuilder';
import { exportiere } from './helpers/modelExport';

/**
 * Automatic layout on import (AutoLayout.js, Phase 2b in Import-Export.md):
 * files without (complete) visual information for several shapes of models.
 *
 * The geometry is checked on what the app holds after the import (the same
 * data the download writes), for every layer:
 * - every shape and connection has a position / route,
 * - no two shapes overlap,
 * - states and operators lie in their SystemLimit, inputs on the upper edge,
 *   outputs on the lower edge (tolerance of checkIfOnSystemBorder, 30px),
 * - TechnicalResources lie outside of it,
 * - connections start at their source and end at their target.
 */

const STATES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];
const FLOWS = ['fpb:Flow', 'fpb:ParallelFlow', 'fpb:AlternativeFlow'];
const BORDER = 30;

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'import', name), 'utf8'));

const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const near = (p, box, tolerance = 2) => p.x >= box.x - tolerance && p.x <= box.x + box.width + tolerance
  && p.y >= box.y - tolerance && p.y <= box.y + box.height + tolerance;
const strictlyInside = (p, box) => p.x > box.x + 1 && p.x < box.x + box.width - 1 && p.y > box.y + 1 && p.y < box.y + box.height - 1;

/** Geometric problems of one exported process entry, as readable strings. */
function problemsOf(entry) {
  const problems = [];
  const data = new Map(entry.elementDataInformation.map((e) => [e.id, e]));
  const visual = new Map((entry.elementVisualInformation || []).map((v) => [v.id, v]));
  const name = (id) => (data.get(id) && data.get(id).name) || id;
  const systemLimit = entry.elementDataInformation.find((e) => e.$type === 'fpb:SystemLimit');
  const inner = systemLimit ? systemLimit.elementsContainer.map((id) => data.get(id)).filter(Boolean) : [];
  const nodes = inner.filter((e) => STATES.includes(e.$type) || e.$type === 'fpb:ProcessOperator');
  const resources = entry.elementDataInformation.filter((e) => e.$type === 'fpb:TechnicalResource');
  const shapes = [...nodes, ...resources];
  const flows = inner.filter((e) => FLOWS.includes(e.$type));
  const connections = [...flows, ...entry.elementDataInformation.filter((e) => e.$type === 'fpb:Usage')];

  const box = (id) => {
    const v = visual.get(id);
    return v && [v.x, v.y, v.width, v.height].every(Number.isFinite) ? v : null;
  };
  const sl = systemLimit ? box(systemLimit.id) : null;
  if (systemLimit && !sl) {
    problems.push('SystemLimit without position');
  }

  shapes.forEach((shape, i) => {
    const b = box(shape.id);
    if (!b) {
      problems.push(`no position: ${name(shape.id)}`);
      return;
    }
    shapes.slice(i + 1).forEach((other) => {
      const o = box(other.id);
      if (o && overlap(b, o)) {
        problems.push(`overlap: ${name(shape.id)} / ${name(other.id)}`);
      }
    });
  });

  if (sl) {
    nodes.forEach((node) => {
      const b = box(node.id);
      if (!b) return;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const outOfRange = cx < sl.x || cx > sl.x + sl.width || cy < sl.y - BORDER || cy > sl.y + sl.height + BORDER;
      if (outOfRange) {
        problems.push(`outside SystemLimit: ${name(node.id)}`);
      }
      if (!STATES.includes(node.$type)) {
        if (b.y < sl.y || b.y + b.height > sl.y + sl.height) problems.push(`operator on the edge: ${name(node.id)}`);
        return;
      }
      const into = flows.filter((f) => f.targetRef === node.id).length;
      const out = flows.filter((f) => f.sourceRef === node.id).length;
      const onTop = Math.abs(cy - sl.y) <= BORDER;
      const onBottom = Math.abs(cy - (sl.y + sl.height)) <= BORDER;
      if (!into && out && !onTop) problems.push(`input not on the upper edge: ${name(node.id)}`);
      if (into && !out && !onBottom) problems.push(`output not on the lower edge: ${name(node.id)}`);
      if (into && out && (onTop || onBottom)) problems.push(`inner state on an edge: ${name(node.id)}`);
    });
    resources.forEach((resource) => {
      const b = box(resource.id);
      if (b && overlap(b, sl)) problems.push(`resource inside SystemLimit: ${name(resource.id)}`);
    });
  }

  connections.forEach((connection) => {
    const label = `${connection.$type.replace('fpb:', '')} ${name(connection.sourceRef)}->${name(connection.targetRef)}`;
    const v = visual.get(connection.id);
    const points = v && Array.isArray(v.waypoints) ? v.waypoints : [];
    if (points.length < 2 || !points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
      problems.push(`no route: ${label}`);
      return;
    }
    const source = box(connection.sourceRef);
    const target = box(connection.targetRef);
    if (source && !near(points[0], source)) problems.push(`start detached: ${label}`);
    if (target && !near(points[points.length - 1], target)) problems.push(`end detached: ${label}`);
    // no route runs through an element that is not one of its ends
    for (let i = 0; i < points.length - 1; i++) {
      const [a, b] = [points[i], points[i + 1]];
      shapes.filter((s) => s.id !== connection.sourceRef && s.id !== connection.targetRef).forEach((shape) => {
        const s = box(shape.id);
        if (!s) return;
        for (let t = 1; t < 20; t++) {
          if (strictlyInside({ x: a.x + (b.x - a.x) * t / 20, y: a.y + (b.y - a.y) * t / 20 }, s)) {
            problems.push(`through ${name(shape.id)}: ${label}`);
            break;
          }
        }
      });
    }
  });
  return [...new Set(problems)];
}

function problemsByProcess(model) {
  const result = {};
  model.filter((e) => e.process).forEach((e) => {
    result[e.process.id] = problemsOf(e);
  });
  return result;
}

const noProblems = (model) => Object.fromEntries(model.filter((e) => e.process).map((e) => [e.process.id, []]));

async function importAndCollect(page, data) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  const outcome = await page.evaluate((d) => new Promise((resolve) => {
    const bus = window.fpbjs.get('eventBus');
    const out = { warnings: [], errors: [] };
    bus.on('import.report', (e) => e.warnings.forEach((w) => out.warnings.push(w.message)));
    bus.once('import.error', (e) => out.errors.push(e.message));
    bus.once('import.done', () => setTimeout(() => resolve(out), 200));
    bus.fire('FPBJS.import', { data: d });
    setTimeout(() => resolve(out), 10000);
  }), data);
  expect(outcome.errors).toEqual([]);
  const model = await exportiere(page);
  return { importer, warnings: outcome.warnings, model };
}

/** Positions on the canvas of the current layer, to compare with the data. */
const canvasBoxes = (page) => page.evaluate(() => Object.fromEntries(window.fpbjs.get('elementRegistry')
  .filter((e) => e.businessObject && !e.waypoints && e.type !== 'label' && e.type !== 'fpb:Process')
  .map((e) => [e.id, { x: e.x, y: e.y, width: e.width, height: e.height }])));

test.describe('Auto layout - models without any visual information', () => {

  test('a single layer chain', async ({ page }) => {
    const m = new ModelBuilder('Kette');
    const p = m.process('chain');
    const a = p.product('Rohteil');
    const op1 = p.operator('Drehen');
    const z = p.product('Gedreht');
    const op2 = p.operator('Bohren');
    const b = p.product('Fertig');
    p.flow(a, op1);
    p.flow(op1, z);
    p.flow(z, op2);
    p.flow(op2, b);

    const { warnings, model } = await importAndCollect(page, m.build({ layout: false }));

    expect(warnings).toEqual(['Process "Systemgrenze" carried no layout - all 10 elements were arranged automatically']);
    expect(problemsByProcess(model)).toEqual(noProblems(model));
    // top to bottom
    const y = (id) => model[1].elementVisualInformation.find((v) => v.id === id).y;
    expect(y(a)).toBeLessThan(y(op1));
    expect(y(op1)).toBeLessThan(y(z));
    expect(y(z)).toBeLessThan(y(op2));
    expect(y(op2)).toBeLessThan(y(b));
    // what the canvas shows is what is stored
    const boxes = await canvasBoxes(page);
    model[1].elementVisualInformation.filter((v) => !v.waypoints).forEach((v) => {
      expect(boxes[v.id], v.id).toEqual({ x: v.x, y: v.y, width: v.width, height: v.height });
    });
  });

  test('an operator with many input and output states', async ({ page }) => {
    const m = new ModelBuilder('Viele');
    const p = m.process('many');
    const op = p.operator('Mischen');
    const types = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];
    for (let i = 0; i < 10; i++) {
      p.flow(p.state(types[i % 3], `Ein ${i}`), op);
    }
    for (let i = 0; i < 7; i++) {
      p.flow(op, p.state(types[i % 3], `Aus ${i}`));
    }

    const { model } = await importAndCollect(page, m.build({ layout: false }));

    expect(problemsByProcess(model)).toEqual(noProblems(model));
  });

  test('parallel and alternative branchings with a merge', async ({ page }) => {
    const m = new ModelBuilder('Verzweigt');
    const p = m.process('branching');
    const a = p.product('Eingang');
    const split = p.operator('Aufteilen');
    const x1 = p.product('Teil 1');
    const x2 = p.product('Teil 2');
    const x3 = p.state('fpb:Information', 'Auftrag');
    const check = p.operator('Pruefen');
    const merge = p.operator('Zusammenbauen');
    const ok = p.product('Gut');
    const nok = p.product('Schlecht');
    const out = p.product('Baugruppe');
    p.flow(a, split);
    const parallel = p.branch(split, [x1, x2, x3], 'fpb:ParallelFlow');
    p.flow(x1, check);
    const alternative = p.branch(check, [ok, nok], 'fpb:AlternativeFlow');
    p.flow(ok, merge);
    p.flow(x2, merge);
    p.flow(x3, merge);
    p.flow(merge, out);

    const { model, importer } = await importAndCollect(page, m.build({ layout: false }));

    expect(problemsByProcess(model)).toEqual(noProblems(model));
    // tandem groups survive the layout
    const tandems = (await importer.elements()).filter((e) => [...parallel, ...alternative].includes(e.id));
    tandems.forEach((flow) => {
      const group = parallel.includes(flow.id) ? parallel : alternative;
      expect(flow.inTandemWith.sort()).toEqual(group.filter((id) => id !== flow.id).sort());
    });
  });

  test('technical resources and usages, one resource shared by two operators', async ({ page }) => {
    const m = new ModelBuilder('Ressourcen');
    const p = m.process('resources');
    const a = p.product('A');
    const op1 = p.operator('Schritt 1');
    const b = p.product('B');
    const op2 = p.operator('Schritt 2');
    const c = p.product('C');
    const op3 = p.operator('Schritt 3');
    const d = p.product('D');
    p.flow(a, op1);
    p.flow(op1, b);
    p.flow(b, op2);
    p.flow(op2, c);
    p.flow(c, op3);
    p.flow(op3, d);
    const robot = p.resource('Roboter');
    p.usage(op1, robot);
    p.usage(op2, robot);
    p.usage(op2, p.resource('Kamera'));
    p.usage(op3, p.resource('Presse'));
    p.usage(op3, p.resource('Werkzeug'));

    const { model } = await importAndCollect(page, m.build({ layout: false }));

    expect(problemsByProcess(model)).toEqual(noProblems(model));
  });

  test('a rework loop (cycle)', async ({ page }) => {
    const m = new ModelBuilder('Schleife');
    const p = m.process('cycle');
    const a = p.product('Roh');
    const work = p.operator('Bearbeiten');
    const z = p.product('Bearbeitet');
    const check = p.operator('Pruefen');
    const back = p.product('Nacharbeit');
    const ok = p.product('Gut');
    p.flow(a, work);
    p.flow(work, z);
    p.flow(z, check);
    p.branch(check, [ok, back], 'fpb:AlternativeFlow');
    p.flow(back, work);

    const { model, warnings } = await importAndCollect(page, m.build({ layout: false }));

    expect(warnings).toHaveLength(1);
    expect(problemsByProcess(model)).toEqual(noProblems(model));
  });

  test('three layers: the child keeps the order of the states at the parent operator', async ({ page }) => {
    const m = new ModelBuilder('Ebenen');
    const root = m.process('layers-root', 'Wurzel');
    const s1 = root.product('Links');
    const s2 = root.state('fpb:Energy', 'Mitte');
    const s3 = root.state('fpb:Information', 'Rechts');
    const po = root.operator('Gesamt');
    const out1 = root.product('Ergebnis');
    const out2 = root.state('fpb:Energy', 'Verlust');
    [s1, s2, s3].forEach((s) => root.flow(s, po));
    root.flow(po, out1);
    root.flow(po, out2);
    root.usage(po, root.resource('Anlage'));

    const child = m.decompose(root, po, 'Kind');
    const c1 = child.product('Links', null, s1);
    const c2 = child.state('fpb:Energy', 'Mitte', null, s2);
    const c3 = child.state('fpb:Information', 'Rechts', null, s3);
    const co1 = child.product('Ergebnis', null, out1);
    const co2 = child.state('fpb:Energy', 'Verlust', null, out2);
    const k1 = child.operator('Teil A');
    const k2 = child.operator('Teil B');
    const mid = child.product('Zwischen');
    child.flow(c1, k1);
    child.flow(c2, k1);
    child.flow(c3, k2);
    child.flow(k1, mid);
    child.flow(mid, k2);
    child.flow(k2, co1);
    child.flow(k1, co2);

    const grandchild = m.decompose(child, k1, 'Enkel');
    const g1 = grandchild.product('Links', null, s1);
    const g2 = grandchild.state('fpb:Energy', 'Mitte', null, s2);
    const gm = grandchild.product('Zwischen', null, mid);
    const gv = grandchild.state('fpb:Energy', 'Verlust', null, out2);
    const e1 = grandchild.operator('Detail');
    grandchild.flow(g1, e1);
    grandchild.flow(g2, e1);
    grandchild.flow(e1, gm);
    grandchild.flow(e1, gv);

    const data = m.build({ layout: false });
    // parents are laid out first, the children take over their order
    const { model, warnings } = await importAndCollect(page, data);

    expect(warnings).toHaveLength(3);
    expect(problemsByProcess(model)).toEqual(noProblems(model));

    const order = (processId, ids) => {
      const entry = model.find((e) => e.process && e.process.id === processId);
      return ids.map((id) => ({ id, x: entry.elementVisualInformation.find((v) => v.id === id).x }))
        .sort((a, b) => a.x - b.x).map((item) => item.id);
    };
    const parentOrder = order('layers-root', [s1, s2, s3]);
    expect(order(po, [s1, s2, s3])).toEqual(parentOrder);
    expect(order(k1, [s1, s2])).toEqual(order(po, [s1, s2]));

    // every layer opens
    const importer = new ImportPage(page);
    for (const layer of [po, k1]) {
      const opened = await page.evaluate(async (id) => {
        const entry = window.fpbjs.getProcesses().find((e) => e.process && e.process.id === id);
        window.fpbjs.get('modeling').switchProcess(entry.process.isDecomposedProcessOperator.decomposedView);
        await new Promise((r) => setTimeout(r, 300));
        return window.fpbjs.get('canvas').getRootElement().id;
      }, layer);
      expect(opened).toBe(layer);
    }
    expect(await importer.unresolvedReferences()).toEqual([]);
  });

  test('a process without SystemLimit keeps its resources on the canvas', async ({ page }) => {
    const m = new ModelBuilder('Ohne Systemgrenze');
    const p = m.process('no-sl');
    p.resource('Lager');
    p.resource('Kran');
    const data = m.build({ layout: false });
    const entry = data[1];
    const slId = entry.process.consistsOfSystemLimit;
    entry.process.elementsContainer = entry.process.elementsContainer.filter((id) => id !== slId);
    entry.process.consistsOfSystemLimit = null;
    entry.elementDataInformation = entry.elementDataInformation.filter((e) => e.id !== slId);

    const { model, warnings } = await importAndCollect(page, data);

    expect(warnings).toHaveLength(1);
    const boxes = model[1].elementVisualInformation.filter((v) => v.type === 'fpb:TechnicalResource');
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
    });
    expect(overlap(boxes[0], boxes[1])).toBe(false);
  });

  test('resources on both sides, a blocked operator, a usage drawn from the resource, an unused resource', async ({ page }) => {
    const m = new ModelBuilder('Seiten');
    const p = m.process('sides');
    // three operators side by side in one level
    const ops = ['Links', 'Mitte', 'Rechts'].map((name) => {
      const input = p.product(`Ein ${name}`);
      const op = p.operator(name);
      p.flow(input, op);
      p.flow(op, p.product(`Aus ${name}`));
      return op;
    });
    const [left, middle, right] = ops;
    // the left operator is blocked on the right and free on the left
    const leftResources = ['Greifer', 'Kamera', 'Sauger'].map((name) => {
      const resource = p.resource(name);
      p.usage(left, resource);
      return resource;
    });
    // the middle one is blocked on both sides
    const middleResource = p.resource('Presse');
    p.usage(middle, middleResource);
    // a usage stored from the resource to the operator
    const rightResource = p.resource('Roboter');
    const reversed = p.usage(right, rightResource);
    const lager = p.resource('Lager');
    const data = m.build({ layout: false });
    const entry = data[1];
    const usage = entry.elementDataInformation.find((e) => e.id === reversed);
    [usage.sourceRef, usage.targetRef] = [usage.targetRef, usage.sourceRef];

    const { model } = await importAndCollect(page, data);

    expect(problemsByProcess(model)).toEqual(noProblems(model));
    const visual = new Map(model[1].elementVisualInformation.map((v) => [v.id, v]));
    const sl = visual.get(model[1].process.consistsOfSystemLimit);
    leftResources.forEach((id) => expect(visual.get(id).x + visual.get(id).width, id).toBeLessThan(sl.x));
    [middleResource, rightResource, lager].forEach((id) => expect(visual.get(id).x, id).toBeGreaterThan(sl.x + sl.width));
    // the usage keeps its direction: it starts at the resource
    const route = visual.get(reversed).waypoints;
    expect(route[0].x).toBeGreaterThan(sl.x + sl.width);
    // nothing lies off the canvas
    model[1].elementVisualInformation.forEach((v) => {
      (v.waypoints || [v]).forEach((point) => {
        expect(point.x, v.id).toBeGreaterThanOrEqual(0);
        expect(point.y, v.id).toBeGreaterThanOrEqual(0);
      });
    });
    // the canvas shows the usage the way it is stored
    const onCanvas = await page.evaluate((id) => {
      const connection = window.fpbjs.get('elementRegistry').get(id);
      return { source: connection.source.id, target: connection.target.id };
    }, reversed);
    expect(onCanvas).toEqual({ source: rightResource, target: right });
  });

  test('many resources on the left are shifted onto the canvas', async ({ page }) => {
    const m = new ModelBuilder('Viele links');
    const p = m.process('many-left');
    const a = p.operator('A');
    const b = p.operator('B');
    p.flow(p.product('Ein A'), a);
    p.flow(p.product('Ein B'), b);
    p.flow(a, p.product('Aus A'));
    p.flow(b, p.product('Aus B'));
    const resources = [];
    for (let i = 0; i < 14; i++) {
      const resource = p.resource(`Werkzeug ${i}`);
      p.usage(a, resource);
      resources.push(resource);
    }

    const { model } = await importAndCollect(page, m.build({ layout: false }));

    expect(problemsByProcess(model)).toEqual(noProblems(model));
    const visual = model[1].elementVisualInformation;
    const sl = visual.find((v) => v.type === 'fpb:SystemLimit');
    resources.forEach((id) => {
      const box = visual.find((v) => v.id === id);
      expect(box.x + box.width, id).toBeLessThan(sl.x);
    });
    const minX = Math.min(...visual.flatMap((v) => (v.waypoints || [v]).map((point) => point.x)));
    const minY = Math.min(...visual.flatMap((v) => (v.waypoints || [v]).map((point) => point.y)));
    expect(minX).toBeGreaterThanOrEqual(0);
    expect(minY).toBeGreaterThanOrEqual(0);
  });

  test('an empty SystemLimit and states without any flow', async ({ page }) => {
    const m = new ModelBuilder('Leer');
    const empty = m.process('empty', 'Leer');
    empty.resource('Lager');
    const loose = m.process('loose', 'Lose');
    loose.product('Eins');
    loose.state('fpb:Energy', 'Zwei');
    loose.state('fpb:Information', 'Drei');
    loose.operator('Allein');

    const { model, warnings } = await importAndCollect(page, m.build({ layout: false }));

    expect(warnings).toHaveLength(2);
    expect(problemsByProcess(model)).toEqual(noProblems(model));
    model.filter((e) => e.process).forEach((entry) => {
      const sl = entry.elementVisualInformation.find((v) => v.type === 'fpb:SystemLimit');
      expect(sl.width, entry.process.id).toBeGreaterThanOrEqual(250);
      expect(sl.height, entry.process.id).toBeGreaterThan(0);
    });
    // states without flows are no boundary states: they lie inside, off the edges
    const entry = model.find((e) => e.process && e.process.id === 'loose');
    const sl = entry.elementVisualInformation.find((v) => v.type === 'fpb:SystemLimit');
    entry.elementVisualInformation.filter((v) => STATES.includes(v.type)).forEach((v) => {
      const cy = v.y + v.height / 2;
      expect(cy - sl.y, v.id).toBeGreaterThan(BORDER);
      expect(sl.y + sl.height - cy, v.id).toBeGreaterThan(BORDER);
    });
  });

  for (const file of ['Paper-at2026-ohne-grafik.json', 'MPS500-ohne-grafik.json']) {
    test(`real model ${file}`, async ({ page }) => {
      const data = fixture(file);

      const { model, warnings } = await importAndCollect(page, data);

      expect(warnings.every((w) => w.includes('carried no layout'))).toBe(true);
      expect(warnings).toHaveLength(data.filter((e) => e.process).length);
      expect(problemsByProcess(model)).toEqual(noProblems(model));
    });
  }

});

test.describe('Auto layout - completing a partial layout', () => {

  /** A laid out model to take parts away from. */
  function laidOut() {
    const m = new ModelBuilder('Teilweise');
    const p = m.process('partial', 'Teilweise', { x: 100, y: 100, width: 500, height: 400 });
    const a = p.product('A', { x: 175, y: 75 });
    const b = p.product('B', { x: 375, y: 75 });
    const op = p.operator('Op', { x: 250, y: 220 });
    const out = p.product('Aus', { x: 300, y: 475 });
    const tr = p.resource('TR', { x: 700, y: 220 });
    const f1 = p.flow(a, op, 'fpb:Flow', [{ x: 200, y: 125 }, { x: 200, y: 260 }, { x: 250, y: 260 }]);
    const f2 = p.flow(b, op, 'fpb:Flow', [{ x: 400, y: 125 }, { x: 400, y: 260 }, { x: 400, y: 260 }]);
    const f3 = p.flow(op, out, 'fpb:Flow', [{ x: 325, y: 300 }, { x: 325, y: 475 }]);
    const u = p.usage(op, tr, [{ x: 400, y: 260 }, { x: 700, y: 260 }]);
    return { m, p, ids: { a, b, op, out, tr, f1, f2, f3, u } };
  }

  const boxOf = (model, id) => {
    const v = model[1].elementVisualInformation.find((item) => item.id === id);
    return v && { x: v.x, y: v.y, width: v.width, height: v.height };
  };

  test('only waypoints missing: shapes stay, connections are routed', async ({ page }) => {
    const { m, ids } = laidOut();
    const data = m.build({ layout: 'shapes' });

    const { model, warnings } = await importAndCollect(page, data);

    expect(warnings).toEqual(['Process "Teilweise" carried an incomplete layout - 4 elements were placed automatically']);
    ['a', 'b', 'op', 'out', 'tr'].forEach((key) => {
      expect(boxOf(model, ids[key]), key).toEqual(boxOf(data, ids[key]));
    });
    expect(problemsOf(model[1]).filter((p) => /route|detached/.test(p))).toEqual([]);
  });

  test('one inner state missing: it is placed in a free spot, the rest stays', async ({ page }) => {
    const { m, p, ids } = laidOut();
    const extra = p.product('Neu');
    p.flow(ids.op, extra);
    p.flow(extra, ids.op);
    const data = m.build();

    const { model, warnings } = await importAndCollect(page, data);

    expect(warnings).toEqual([expect.stringContaining('carried an incomplete layout')]);
    ['a', 'b', 'op', 'tr'].forEach((key) => {
      expect(boxOf(model, ids[key]), key).toEqual(boxOf(data, ids[key]));
    });
    // if the SystemLimit had to grow downwards, the output state moves with its
    // lower edge (documented), but only vertically
    const slId = data[1].process.consistsOfSystemLimit;
    const growth = boxOf(model, slId).height - boxOf(data, slId).height;
    expect(boxOf(model, ids.out)).toEqual({ ...boxOf(data, ids.out), y: boxOf(data, ids.out).y + growth });
    expect(boxOf(model, extra)).toBeTruthy();
    expect(problemsByProcess(model)).toEqual(noProblems(model));
  });

  test('many new boundary states: the SystemLimit grows and pushes the resource aside', async ({ page }) => {
    const { m, p, ids } = laidOut();
    const added = [];
    for (let i = 0; i < 8; i++) {
      const input = p.state('fpb:Energy', `Neu Ein ${i}`);
      p.flow(input, ids.op);
      added.push(input);
    }
    for (let i = 0; i < 6; i++) {
      const output = p.state('fpb:Information', `Neu Aus ${i}`);
      p.flow(ids.op, output);
      added.push(output);
    }
    const data = m.build();

    const { model } = await importAndCollect(page, data);

    const slId = data[1].process.consistsOfSystemLimit;
    const before = boxOf(data, slId);
    const after = boxOf(model, slId);
    expect(after.width).toBeGreaterThan(before.width);
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
    // existing inputs and the operator keep their place
    ['a', 'b', 'op'].forEach((key) => expect(boxOf(model, ids[key]), key).toEqual(boxOf(data, ids[key])));
    added.forEach((id) => expect(boxOf(model, id), id).toBeTruthy());
    expect(problemsByProcess(model)).toEqual(noProblems(model));
  });

  test('missing resources go beside the SystemLimit, at their operator or at the top, never on another', async ({ page }) => {
    const { m, p, ids } = laidOut();
    // a second resource of the operator, already placed where the first would go
    const placed = p.resource('Vorhanden', { x: 660, y: 220 });
    p.usage(ids.op, placed);
    const unused = p.resource('Unbenutzt');
    const data = m.build();
    data[1].elementVisualInformation = data[1].elementVisualInformation.filter((v) => v.id !== ids.tr);

    const { model, warnings } = await importAndCollect(page, data);

    expect(warnings).toEqual([expect.stringContaining('carried an incomplete layout')]);
    expect(problemsByProcess(model)).toEqual(noProblems(model));
    const slId = data[1].process.consistsOfSystemLimit;
    const sl = boxOf(model, slId);
    expect(sl).toEqual(boxOf(data, slId));
    expect(boxOf(model, placed)).toEqual(boxOf(data, placed));
    // the operator's resource: right of the SystemLimit, below the one in its way
    const tr = boxOf(model, ids.tr);
    expect(tr.x).toBeGreaterThan(sl.x + sl.width);
    expect(tr.y).toBeGreaterThan(boxOf(data, placed).y);
    // the unused one: right of the SystemLimit as well
    expect(boxOf(model, unused).x).toBeGreaterThan(sl.x + sl.width);
  });

  test('new interior elements without placed predecessors: an isolated state and an operator feeding an output', async ({ page }) => {
    const { m, p, ids } = laidOut();
    const loose = p.product('Lose');
    const rework = p.operator('Nacharbeit');
    p.flow(rework, ids.out);
    const data = m.build();

    const { model, warnings } = await importAndCollect(page, data);

    expect(warnings).toEqual([expect.stringContaining('carried an incomplete layout')]);
    expect(problemsByProcess(model)).toEqual(noProblems(model));
    ['a', 'b', 'op'].forEach((key) => expect(boxOf(model, ids[key]), key).toEqual(boxOf(data, ids[key])));
    // a resource beside a growing SystemLimit only moves sideways
    expect(boxOf(model, ids.tr).y).toBe(boxOf(data, ids.tr).y);
    // the operator sits above the output it feeds
    expect(boxOf(model, rework).y + boxOf(model, rework).height).toBeLessThan(boxOf(model, ids.out).y);
    const sl = boxOf(model, data[1].process.consistsOfSystemLimit);
    const state = boxOf(model, loose);
    expect(state.y).toBeGreaterThan(sl.y + BORDER);
    expect(state.y + state.height).toBeLessThan(sl.y + sl.height - BORDER);
  });

  test('a missing SystemLimit position makes the whole process new', async ({ page }) => {
    const { m, ids } = laidOut();
    const data = m.build();
    const slId = data[1].process.consistsOfSystemLimit;
    data[1].elementVisualInformation = data[1].elementVisualInformation.filter((v) => v.id !== slId);

    const { model, warnings } = await importAndCollect(page, data);

    expect(warnings).toEqual([expect.stringContaining('carried no layout')]);
    expect(boxOf(model, slId)).toBeTruthy();
    expect(Object.values(ids).length).toBe(9);
    expect(problemsByProcess(model)).toEqual(noProblems(model));
  });

  test('visual information with non numeric coordinates counts as missing', async ({ page }) => {
    const { m, ids } = laidOut();
    const data = m.build();
    const v = data[1].elementVisualInformation.find((item) => item.id === ids.out);
    v.x = '300';
    v.y = null;

    const { model, warnings } = await importAndCollect(page, data);

    expect(warnings).toEqual([expect.stringContaining('carried an incomplete layout')]);
    const box = boxOf(model, ids.out);
    expect(Number.isFinite(box.x) && Number.isFinite(box.y)).toBe(true);
    expect(problemsByProcess(model)).toEqual(noProblems(model));
  });

});
