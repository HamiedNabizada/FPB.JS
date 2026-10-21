// tests/e2e/layer-decomposition-models.spec.js
import { test, expect } from './support/test';
import { ModelBuilder } from './helpers/modelBuilder';
import { open, issues, rootId, switchTo, answer, modalTitle } from './helpers/layerCheck';

/**
 * Decompose, compose and the boundary dialogs on models built for the case
 * (helpers/modelBuilder.js), where the temperieren fixture has no example:
 * many inputs, unequal numbers of inputs and outputs, unnamed elements,
 * resources on a child layer, a child layer that lacks an input of its
 * operator, and a state that already exists on the parent layer.
 *
 * Docs: FPB.JS_Docs/Layer-Konsistenz.md (Szenario 3, 6), Modeling-Regeln.md.
 * `issues(page)` (helpers/layerCheck.js) lists every consistency break over
 * all layers.
 */

const decompose = (page, id) => page.evaluate((i) => {
  window.fpbjs.get('modeling').decomposeProcessOperator(window.__lr.byId(i));
}, id);

const compose = (page) => page.evaluate(() => {
  window.fpbjs.get('modeling').composeProcess(window.__lr.sl(window.fpbjs.get('canvas').getRootElement()));
});

/** Boxes of the states of the displayed layer, and its system limit */
const layout = (page) => page.evaluate(() => {
  const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
  const box = (e) => ({ id: e.id, x: e.x, y: e.y, width: e.width, height: e.height, type: e.type, name: e.businessObject.name });
  return {
    sl: box(sl),
    shapes: sl.businessObject.elementsContainer.filter((e) => !e.waypoints).map(box),
  };
});

/**
 * Parent with operator "Op" (inputs A, B; output C), decomposed; the child
 * layer has A and C on its boundary and an inner operator K.
 */
function withChild({ childHasB = true } = {}) {
  const m = new ModelBuilder('Mit Kind');
  const p = m.process('m-root', 'Wurzel', { x: 100, y: 100, width: 700, height: 500 });
  const a = p.product('A', { x: 200, y: 75 });
  const b = p.state('fpb:Energy', 'B', { x: 400, y: 75 });
  const op = p.operator('Op', { x: 300, y: 250 });
  const c = p.product('C', { x: 300, y: 575 });
  p.flow(a, op);
  p.flow(b, op);
  p.flow(op, c);
  const child = m.decompose(p, op, 'SL_Op', { x: 350, y: 50, width: 650, height: 700 });
  const ca = child.product('A', { x: 475, y: 25 }, a);
  const cc = child.product('C', { x: 475, y: 725 }, c);
  const k = child.operator('K', { x: 450, y: 300 });
  child.flow(ca, k);
  child.flow(k, cc);
  if (childHasB) {
    const cb = child.state('fpb:Energy', 'B', { x: 675, y: 25 }, b);
    child.flow(cb, k);
  }
  return { m, p, child, ids: { a, b, c, op, k } };
}

test.describe('Decompose: models built for the case', () => {

  test('entering a child layer that lacks an input and an output of its operator adds them on the boundary', async ({ page }) => {
    const { m, p, ids } = withChild({ childHasB: false });
    const d = p.state('fpb:Information', 'D', { x: 500, y: 575 });
    p.flow(ids.op, d);
    await open(page, m.build());
    // the imported model is inconsistent on purpose (Szenario 18: import is not validated)
    expect(await issues(page)).toEqual([expect.stringContaining('upper boundary'), expect.stringContaining('bottom boundary')]);
    await decompose(page, ids.op);
    const r = await page.evaluate((op) => window.__lr.boundary(op), ids.op);
    expect(r).toEqual({ upper: [ids.a, ids.b].sort(), bottom: [ids.c, d].sort() });
    const shapes = (await layout(page)).shapes;
    const named = (id) => { const s = shapes.find((x) => x.id === id); return { type: s.type, name: s.name }; };
    expect(named(ids.b)).toEqual({ type: 'fpb:Energy', name: 'B' });
    expect(named(d)).toEqual({ type: 'fpb:Information', name: 'D' });
    expect(await issues(page)).toEqual([]);
  });

  test('twelve and more inputs widen the new system limit once; all states sit apart on the boundary', async ({ page }) => {
    const m = new ModelBuilder('Viele');
    const p = m.process('v-root', 'Wurzel', { x: 100, y: 100, width: 1200, height: 500 });
    const op = p.operator('Op', { x: 500, y: 300 });
    const inputs = [];
    for (let i = 0; i < 13; i++) {
      inputs.push(p.product('E' + i, { x: 110 + i * 85, y: 75 }));
      p.flow(inputs[i], op);
    }
    p.flow(op, p.product('Aus', { x: 550, y: 575 }));
    p.resource('Anlage', { x: 1400, y: 300 });
    await open(page, m.build());
    // a Usage from the resource does not count as an input
    await page.evaluate((op) => {
      const tr = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:TechnicalResource')[0];
      window.fpbjs.get('modeling').connect(tr, window.__lr.byId(op), { type: 'fpb:Usage' });
    }, op);

    await decompose(page, op);
    const { sl, shapes } = await layout(page);
    // Modeling-Regeln.md: default width 650; DecomposeProcessOperator adds 50 per state beyond 10
    expect(sl.width).toBe(650 + 3 * 50);
    const upper = shapes.filter((s) => Math.abs(s.y + s.height / 2 - sl.y) <= 30).sort((a, b) => a.x - b.x);
    expect(upper.map((s) => s.id).sort()).toEqual(inputs.slice().sort());
    upper.forEach((s, i) => {
      expect(s.x, s.name).toBeGreaterThanOrEqual(sl.x - s.width / 2);
      expect(s.x + s.width / 2, s.name).toBeLessThanOrEqual(sl.x + sl.width);
      if (i > 0) expect(s.x - upper[i - 1].x, s.name).toBeGreaterThanOrEqual(s.width);
    });
    expect(await issues(page)).toEqual([]);

    // entering again does not widen it a second time
    await switchTo(page, 'v-root');
    await decompose(page, op);
    expect((await layout(page)).sl.width).toBe(800);
    expect(await issues(page)).toEqual([]);
  });

  test('a technical resource and its Usage on a child layer are there again after re-entering', async ({ page }) => {
    const { m, child, ids } = withChild();
    const tr = child.resource('Fraese', { x: 1100, y: 300 });
    const usage = child.usage(ids.k, tr);
    await open(page, m.build());
    await decompose(page, ids.op);
    const shown = () => page.evaluate(({ tr, usage }) => {
      const reg = window.fpbjs.get('elementRegistry');
      return { tr: !!reg.get(tr), usage: !!reg.get(usage), source: reg.get(usage) && reg.get(usage).source.id };
    }, { tr, usage });
    expect(await shown()).toEqual({ tr: true, usage: true, source: ids.k });
    await compose(page);
    await decompose(page, ids.op);
    expect(await shown()).toEqual({ tr: true, usage: true, source: ids.k });
    expect(await page.evaluate((op) => window.__lr.boundary(op), ids.op)).toEqual({ upper: [ids.a, ids.b].sort(), bottom: [ids.c] });
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Compose on the top layer: models built for the case', () => {

  test('more inputs than outputs: every boundary state reaches the new parent, inside its system limit', async ({ page }) => {
    const m = new ModelBuilder('Ungleich');
    // a system limit without name: the new operator gets none either
    const p = m.process('u-root', '', { x: 100, y: 100, width: 900, height: 500 });
    const op = p.operator('Op', { x: 400, y: 300 });
    const inputs = [];
    for (let i = 0; i < 8; i++) {
      inputs.push(p.product(i === 3 ? '' : 'E' + i, { x: 110 + i * 100, y: 75 })); // one without name
      p.flow(inputs[i], op);
    }
    const outputs = [p.product('O1', { x: 300, y: 575 }), p.product('O2', { x: 500, y: 575 })];
    outputs.forEach((o) => p.flow(op, o));
    const inner = p.product('Innen', { x: 700, y: 300 });
    p.flow(op, inner);
    p.usage(op, p.resource('Anlage', { x: 1200, y: 300 }));
    await open(page, m.build());

    await compose(page);
    const top = await rootId(page);
    expect(top).not.toBe('u-root');
    const { sl, shapes } = await layout(page);
    const po = shapes.find((s) => s.type === 'fpb:ProcessOperator');
    expect({ id: po.id, name: po.name || '' }).toEqual({ id: 'u-root', name: '' });
    const states = shapes.filter((s) => s !== po);
    expect(states.map((s) => s.id).sort()).toEqual(inputs.concat(outputs).sort());
    // the unnamed state stays unnamed, the others keep their names
    expect(states.find((s) => s.id === inputs[3]).name || '').toBe('');
    expect(states.find((s) => s.id === inputs[0]).name).toBe('E0');
    // nothing outside the new system limit, nothing on top of each other
    shapes.forEach((s) => {
      expect(s.x, s.id).toBeGreaterThanOrEqual(sl.x);
      expect(s.x + s.width, s.id).toBeLessThanOrEqual(sl.x + sl.width);
      expect(s.y, s.id).toBeGreaterThanOrEqual(sl.y);
      expect(s.y + s.height, s.id).toBeLessThanOrEqual(sl.y + sl.height);
    });
    const spots = states.map((s) => `${s.x},${s.y}`);
    expect(new Set(spots).size).toBe(spots.length);
    // the resource stays on the layer below; the new layer has only its system limit outside
    const outer = await page.evaluate(() => window.fpbjs.get('canvas').getRootElement().businessObject.elementsContainer.map((e) => e.type));
    expect(outer).toEqual(['fpb:SystemLimit']);
    expect(await page.evaluate(() => window.__lr.io('u-root', window.fpbjs.get('canvas').getRootElement().id))).toEqual({
      ins: inputs.slice().sort(),
      outs: outputs.slice().sort(),
    });
    expect(await issues(page)).toEqual([]);
  });

  test('more outputs than inputs', async ({ page }) => {
    const m = new ModelBuilder('Mehr Ausgaenge');
    const p = m.process('o-root', 'Oben', { x: 100, y: 100, width: 900, height: 500 });
    const op = p.operator('Op', { x: 300, y: 300 });
    const a = p.product('A', { x: 300, y: 75 });
    p.flow(a, op);
    const outputs = [];
    for (let i = 0; i < 8; i++) {
      outputs.push(p.product('O' + i, { x: 110 + i * 100, y: 575 }));
      p.flow(op, outputs[i]);
    }
    await open(page, m.build());
    await compose(page);
    const top = await rootId(page);
    expect(await page.evaluate((top) => window.__lr.io('o-root', top), top)).toEqual({ ins: [a], outs: outputs.slice().sort() });
    const { sl, shapes } = await layout(page);
    shapes.forEach((s) => {
      expect(s.x, s.id).toBeGreaterThanOrEqual(sl.x);
      expect(s.x + s.width, s.id).toBeLessThanOrEqual(sl.x + sl.width);
    });
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Szenario 6 with a state the parent layer already has', () => {

  /**
   * The child layer has an inner state X with the id of a parent state. On the
   * parent X feeds another operator (P2), and maybe already is an input or an
   * output of the decomposed one (then the imported model is inconsistent).
   */
  function withInnerTwin({ already }) {
    const { m, p, child, ids } = withChild();
    const x = p.state('fpb:Information', 'X', { x: 600, y: 200 });
    const p2 = p.operator('P2', { x: 550, y: 400 });
    p.flow(x, p2);
    p.flow(p2, p.product('Y', { x: 600, y: 575 }));
    if (already === 'input') p.flow(x, ids.op);
    if (already === 'output') p.flow(ids.op, x);
    const cx = child.state('fpb:Information', 'X', { x: 800, y: 350 }, x);
    child.flow(cx, ids.k);
    return { m, ids: { ...ids, x, p2 } };
  }

  const moveXToEdge = (page, x, edge) => page.evaluate(({ x, edge }) => {
    const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
    const s = window.__lr.byId(x);
    const y = edge === 'upper' ? sl.y : sl.y + sl.height;
    window.fpbjs.get('modeling').moveElements([s], { x: 0, y: y - (s.y + s.height / 2) });
  }, { x, edge });

  const parentSide = (page, ids) => page.evaluate((ids) => {
    const root = window.__lr.top();
    const items = window.__lr.sl(root).businessObject.elementsContainer;
    const flows = (from, to) => items.filter((e) => e.businessObject.sourceRef && e.businessObject.sourceRef.id === from && e.businessObject.targetRef.id === to).length;
    return {
      copies: items.filter((e) => e.id === ids.x).length,
      xToOp: flows(ids.x, ids.op),
      opToX: flows(ids.op, ids.x),
      xToP2: flows(ids.x, ids.p2),
      assigned: window.__lr.byId(ids.x, root.id).businessObject.isAssignedTo.map((o) => o.id).sort(),
    };
  }, ids);

  test('Yes connects the existing parent state to the operator instead of creating a second one', async ({ page }) => {
    const { m, ids } = withInnerTwin({ already: null });
    await open(page, m.build());
    expect(await issues(page)).toEqual([]);
    await decompose(page, ids.op);
    await moveXToEdge(page, ids.x, 'upper');
    await expect(modalTitle(page)).toHaveText('Confirm boundary placement');
    await answer(page, 'confirm');
    expect(await parentSide(page, ids)).toEqual({ copies: 1, xToOp: 1, opToX: 0, xToP2: 1, assigned: [ids.op, ids.p2].sort() });
    expect(await issues(page)).toEqual([]);
  });

  test('Yes on the upper edge when the parent state already is an input: no second flow', async ({ page }) => {
    const { m, ids } = withInnerTwin({ already: 'input' });
    await open(page, m.build());
    await decompose(page, ids.op);
    await moveXToEdge(page, ids.x, 'upper');
    await answer(page, 'confirm');
    expect(await parentSide(page, ids)).toEqual({ copies: 1, xToOp: 1, opToX: 0, xToP2: 1, assigned: [ids.op, ids.p2].sort() });
    expect(await issues(page)).toEqual([]);
  });

  test('Yes on the lower edge when the parent state already is an output: no second flow', async ({ page }) => {
    const { m, ids } = withInnerTwin({ already: 'output' });
    await open(page, m.build());
    await decompose(page, ids.op);
    await moveXToEdge(page, ids.x, 'bottom');
    await answer(page, 'confirm');
    expect(await parentSide(page, ids)).toEqual({ copies: 1, xToOp: 0, opToX: 1, xToP2: 1, assigned: [ids.op, ids.p2].sort() });
    expect(await issues(page)).toEqual([]);
  });

  test('the dialog on a layer whose operator has no name still names it', async ({ page }) => {
    const { m, p, ids } = withChild();
    p.item(ids.op).name = '';
    await open(page, m.build());
    await decompose(page, ids.op);
    await page.evaluate(() => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      window.fpbjs.get('rules').allowed('elements.delete', { elements: [sl] });
    });
    await expect(page.locator('.modal.show')).toContainText('ProcessOperator "ProcessOperator"');
    await answer(page, 'confirm');
    expect(await rootId(page)).toBe('m-root');
    await expect(page.locator('.djs-tooltip', { hasText: 'The decomposition of "ProcessOperator" has been removed.' })).toBeVisible();
    expect(await issues(page)).toEqual([]);
  });
});
