// tests/e2e/layer-rules.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import { load, install, issues, switchTo, IDS } from './helpers/layerCheck';
import { DIALOG } from './helpers/ui';

/**
 * Every rule of FpbRuleProvider (docs: FPB.JS_Docs/Modeling-Regeln.md, and
 * Szenario 5/14 of Layer-Konsistenz.md), asked through the `rules` service the
 * way diagram-js asks it, plus the feedback the user gets when the editor
 * refuses something (ModelingFeedback: error tooltips).
 *
 * Model: tests/e2e/fixtures/temperieren.json (see helpers/layerCheck.js).
 */

const TYPES = ['fpb:Product', 'fpb:Energy', 'fpb:Information', 'fpb:ProcessOperator', 'fpb:TechnicalResource', 'fpb:SystemLimit'];
const STATES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];

/** Screen centre of an element (plus an offset in canvas pixels, zoom is 1) */
const screenPos = (page, id, dx = 0, dy = 0) => page.evaluate(({ id, dx, dy }) => {
  const r = window.fpbjs.get('elementRegistry').getGraphics(id).getBoundingClientRect();
  return { x: r.x + r.width / 2 + dx, y: r.y + r.height / 2 + dy };
}, { id, dx, dy });

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / 3, from.y + (to.y - from.y) / 3, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

const bounds = (page, id) => page.evaluate((i) => {
  const e = window.fpbjs.get('elementRegistry').get(i);
  return { x: e.x, y: e.y };
}, id);

/** Select an element and open its context pad */
const openPad = (page, id) => page.evaluate((i) => {
  const el = window.fpbjs.get('elementRegistry').get(i);
  window.fpbjs.get('selection').select(el);
  window.fpbjs.get('eventBus').fire('element.click', { element: el });
}, id);

const errorTip = (page, text) => page.locator('.djs-tooltip.djs-tooltip-error', { hasText: text });

/** Result of the connection.create rule for fresh, unconnected shapes */
const connectMatrix = (page, hint) => page.evaluate(({ TYPES, hint }) => {
  const factory = window.fpbjs.get('elementFactory');
  const rules = window.fpbjs.get('rules');
  const out = {};
  TYPES.forEach((s) => {
    TYPES.forEach((t) => {
      const source = factory.createShape({ type: s });
      const target = factory.createShape({ type: t });
      if (hint) source.TemporaryFlowHint = hint;
      const r = rules.allowed('connection.create', { source, target });
      out[`${s}->${t}`] = r && r.type ? r.type : false;
    });
  });
  return out;
}, { TYPES, hint });

/**
 * Modeling-Regeln.md, "Erlaubte Verbindungen": State <-> ProcessOperator with
 * Flow, ParallelFlow or AlternativeFlow (chosen by the hint), ProcessOperator
 * <-> TechnicalResource with Usage; everything else is refused.
 *
 * With the Usage hint the pairs of a state and an operator are left out here:
 * a state never gets that hint (its context pad has no Usage entry), and an
 * operator with it is covered by the test "a Usage never ends at a state".
 */
function expectedConnection(s, t, hint) {
  const flowType = { Parallel: 'fpb:ParallelFlow', Alternative: 'fpb:AlternativeFlow' }[hint] || 'fpb:Flow';
  const stateAndOperator = (STATES.includes(s) && t === 'fpb:ProcessOperator') || (s === 'fpb:ProcessOperator' && STATES.includes(t));
  if (stateAndOperator) return hint === 'Usage' ? undefined : flowType;
  if (s === 'fpb:ProcessOperator' && t === 'fpb:TechnicalResource') return hint === 'Usage' ? 'fpb:Usage' : false;
  if (s === 'fpb:TechnicalResource' && t === 'fpb:ProcessOperator') return 'fpb:Usage';
  return false;
}

test.describe('Rules: connection.create between every pair of element types', () => {

  for (const hint of [null, 'Parallel', 'Alternative', 'Usage']) {
    test(`matrix with flow hint ${hint || 'none'}`, async ({ page }) => {
      await load(page);
      const matrix = await connectMatrix(page, hint);
      const expected = {};
      TYPES.forEach((s) => TYPES.forEach((t) => {
        const e = expectedConnection(s, t, hint);
        if (e === undefined) delete matrix[`${s}->${t}`];
        else expected[`${s}->${t}`] = e;
      }));
      expect(matrix).toEqual(expected);
    });
  }

  test('a Usage never ends at a state (operator with the Usage hint over a state)', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const factory = window.fpbjs.get('elementFactory');
      const rules = window.fpbjs.get('rules');
      const out = {};
      ['fpb:Product', 'fpb:Energy', 'fpb:Information'].forEach((t) => {
        const source = factory.createShape({ type: 'fpb:ProcessOperator' });
        source.TemporaryFlowHint = 'Usage';
        const res = rules.allowed('connection.create', { source, target: factory.createShape({ type: t }) });
        out[t] = res && res.type ? res.type : false;
      });
      return out;
    });
    // Modeling-Regeln.md: a Usage only between ProcessOperator and TechnicalResource
    for (const t of Object.keys(r)) {
      expect(r[t], t).not.toBe('fpb:Usage');
    }
  });

  test('UI: the Usage entry of an operator dropped on a state creates no Usage', async ({ page }) => {
    await load(page);
    await openPad(page, IDS.pruefen);
    await page.locator('.djs-context-pad .entry[data-action="connect_usage"]').click();
    const from = await screenPos(page, IDS.pruefen);
    const to = await screenPos(page, IDS.strom);
    await page.mouse.move(from.x, from.y - 50, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.click(to.x, to.y);
    await page.waitForTimeout(300);
    const usages = await page.evaluate((id) => {
      const s = window.fpbjs.get('elementRegistry').get(id);
      return s.incoming.concat(s.outgoing).filter((c) => c.type === 'fpb:Usage').length;
    }, IDS.strom);
    expect(usages).toBe(0);
    expect(await issues(page)).toEqual([]);
  });

  test('the Usage entry of an operator dropped on a technical resource creates a Usage (UI control)', async ({ page }) => {
    await load(page);
    await openPad(page, IDS.pruefen);
    await page.locator('.djs-context-pad .entry[data-action="connect_usage"]').click();
    const from = await screenPos(page, IDS.pruefen);
    const to = await screenPos(page, IDS.heizplatte);
    await page.mouse.move(from.x + 50, from.y, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.click(to.x, to.y);
    await page.waitForTimeout(300);
    const r = await page.evaluate((IDS) => {
      const po = window.fpbjs.get('elementRegistry').get(IDS.pruefen);
      const u = po.outgoing.find((c) => c.type === 'fpb:Usage');
      return u && {
        target: u.target.id,
        inRoot: window.fpbjs.get('canvas').getRootElement().businessObject.elementsContainer.includes(u),
        assigned: (po.businessObject.isAssignedTo || []).map((x) => x.id).includes(IDS.heizplatte),
      };
    }, IDS);
    expect(r).toEqual({ target: IDS.heizplatte, inRoot: true, assigned: true });
    expect(await issues(page)).toEqual([]);
  });

  test('no connection to a label, none between shapes already connected', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(({ IDS }) => {
      const rules = window.fpbjs.get('rules');
      const reg = window.fpbjs.get('elementRegistry');
      const rohstoff = reg.get(IDS.rohstoff);
      const erhitzen = reg.get(IDS.child);
      const pruefen = reg.get(IDS.pruefen);
      const heizplatte = reg.get(IDS.heizplatte);
      const allowed = (source, target) => {
        const r = rules.allowed('connection.create', { source, target });
        return r && r.type ? r.type : false;
      };
      return {
        toLabel: allowed(rohstoff, rohstoff.labels[0]),
        duplicateFlow: allowed(rohstoff, erhitzen),
        duplicateUsage: (() => {
          erhitzen.TemporaryFlowHint = 'Usage';
          const r = allowed(erhitzen, heizplatte);
          erhitzen.TemporaryFlowHint = null;
          return r;
        })(),
        otherOperator: allowed(rohstoff, pruefen),
      };
    }, { IDS });
    expect(result).toEqual({
      toLabel: false,
      duplicateFlow: false,
      duplicateUsage: false,
      otherOperator: 'fpb:Flow',
    });
  });

  test('refused connection in the UI: state to state creates nothing', async ({ page }) => {
    await load(page);
    const flows = () => page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.waypoints).length);
    const before = await flows();
    const box = async (id) => page.evaluate((i) => {
      const r = window.fpbjs.get('elementRegistry').getGraphics(i).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, id);
    // a fresh product high up in the system limit (operators below it, so the
    // pad offers "connect"), dragged onto Warmprodukt (a state): refused
    await page.evaluate(() => {
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Product', id: 'probe_state' });
      window.fpbjs.get('modeling').createShape(shape, { x: sl.x + 60, y: sl.y + 90 }, sl);
    });
    const flowsBefore = await flows();
    const a = await box('probe_state');
    const b = await box(IDS.warmprodukt);
    await page.evaluate((id) => {
      const el = window.fpbjs.get('elementRegistry').get(id);
      window.fpbjs.get('selection').select(el);
      window.fpbjs.get('eventBus').fire('element.click', { element: el });
    }, 'probe_state');
    await page.locator('.djs-context-pad .entry[data-action="connect"]').click();
    await page.mouse.move(a.x, a.y - 30, { steps: 3 });
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(300);
    expect(await flows()).toBe(flowsBefore);
    expect(flowsBefore).toBe(before);
    // the same gesture onto an operator is accepted (control)
    const c = await box(IDS.pruefen);
    await page.evaluate((id) => {
      const el = window.fpbjs.get('elementRegistry').get(id);
      window.fpbjs.get('selection').select(el);
      window.fpbjs.get('eventBus').fire('element.click', { element: el });
    }, 'probe_state');
    await page.locator('.djs-context-pad .entry[data-action="connect"]').click();
    await page.mouse.move(a.x, a.y - 30, { steps: 3 });
    await page.mouse.move(c.x, c.y, { steps: 6 });
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(300);
    expect(await flows()).toBe(before + 1);
    expect(await page.evaluate(() => window.fpbjs.get('elementRegistry').get('probe_state').outgoing[0].target.id)).toBe(IDS.pruefen);
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Rules: reconnecting a flow end', () => {

  test('reconnect, reconnectStart and reconnectEnd follow canConnect', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(({ IDS }) => {
      const rules = window.fpbjs.get('rules');
      const reg = window.fpbjs.get('elementRegistry');
      const flow = reg.get(IDS.rohstoff).outgoing[0]; // Rohstoff -> Erhitzen
      const pruefen = reg.get(IDS.pruefen);
      const gut = reg.get(IDS.gutprodukt);
      const strom = reg.get(IDS.strom);
      const heiz = reg.get(IDS.heizplatte);
      const t = (x) => (x && x.type ? x.type : !!x);
      return {
        endToOperator: t(rules.allowed('connection.reconnectEnd', { connection: flow, hover: pruefen })),
        endToState: t(rules.allowed('connection.reconnectEnd', { connection: flow, hover: gut })),
        endToResource: t(rules.allowed('connection.reconnectEnd', { connection: flow, hover: heiz })),
        endNothing: t(rules.allowed('connection.reconnectEnd', { connection: flow })),
        startFromState: t(rules.allowed('connection.reconnectStart', { connection: flow, hover: gut })),
        startFromOperator: t(rules.allowed('connection.reconnectStart', { connection: flow, hover: pruefen })),
        startNothing: t(rules.allowed('connection.reconnectStart', { connection: flow })),
        reconnectToOperator: t(rules.allowed('connection.reconnect', { connection: flow, source: flow.source, target: pruefen })),
        reconnectToState: t(rules.allowed('connection.reconnect', { connection: flow, source: strom, target: gut })),
        // only the moved end is given, the other one is taken from the connection
        reconnectOnlyTarget: t(rules.allowed('connection.reconnect', { connection: flow, target: pruefen })),
        reconnectNoEnds: t(rules.allowed('connection.reconnect', { connection: { source: null, target: null } })),
      };
    }, { IDS });
    expect(r).toEqual({
      endToOperator: 'fpb:Flow',
      endToState: false,
      endToResource: false,
      endNothing: false,
      // Gutprodukt is not yet connected to Erhitzen
      startFromState: 'fpb:Flow',
      startFromOperator: false,
      startNothing: false,
      reconnectToOperator: 'fpb:Flow',
      reconnectToState: false,
      reconnectOnlyTarget: 'fpb:Flow',
      reconnectNoEnds: false,
    });
  });
});

test.describe('Rules: shape.create', () => {

  test('states and operators only inside the system limit, resources only outside', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(({ IDS }) => {
      const rules = window.fpbjs.get('rules');
      const factory = window.fpbjs.get('elementFactory');
      const reg = window.fpbjs.get('elementRegistry');
      const root = window.fpbjs.get('canvas').getRootElement();
      const sl = reg.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const po = reg.get(IDS.child);
      const heiz = reg.get(IDS.heizplatte);
      const inside = { x: sl.x + 100, y: sl.y + 100 };
      const outside = { x: sl.x + sl.width + 400, y: sl.y + 100 };
      const create = (type, target, position) => {
        const shape = factory.createShape({ type });
        return rules.allowed('shape.create', { shape, target, position });
      };
      const out = {};
      ['fpb:Product', 'fpb:Energy', 'fpb:Information', 'fpb:ProcessOperator'].forEach((t) => {
        out[t] = {
          onSystemLimit: create(t, sl, inside),
          onProcess: create(t, root, outside),
          onOperator: create(t, po, inside),
          onResource: create(t, heiz, outside),
        };
      });
      out['fpb:TechnicalResource'] = {
        onSystemLimit: create('fpb:TechnicalResource', sl, inside),
        onProcess: create('fpb:TechnicalResource', root, outside),
      };
      out.label = create('fpb:Product', reg.get(IDS.rohstoff).labels[0], inside);
      out.noTarget = create('fpb:Product', null, inside);
      return out;
    }, { IDS });

    for (const t of ['fpb:Product', 'fpb:Energy', 'fpb:Information', 'fpb:ProcessOperator']) {
      expect(r[t], t).toEqual({ onSystemLimit: true, onProcess: false, onOperator: false, onResource: false });
    }
    expect(r['fpb:TechnicalResource']).toEqual({ onSystemLimit: false, onProcess: true });
    // a label is no target at all: the rule abstains (null) so diagram-js decides
    expect(r.label).toBeNull();
    expect(r.noTarget).toBe(false);
  });

  test('an element that is no FPB shape (a flow) cannot be created as a shape', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      const flow = window.fpbjs.get('elementFactory').createConnection({ type: 'fpb:Flow' });
      return window.fpbjs.get('rules').allowed('shape.create', { shape: flow, target: sl, position: { x: sl.x + 100, y: sl.y + 100 } });
    });
    expect(r).toBe(false);
  });

  test('empty modeler: the first system limit may be placed, a state not; placing it creates process and project', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await new ImportPage(page).goto();
    await install(page);
    const r = await page.evaluate(() => {
      const rules = window.fpbjs.get('rules');
      const factory = window.fpbjs.get('elementFactory');
      const canvas = window.fpbjs.get('canvas');
      const before = canvas.getRootElement();
      const sl = factory.createShape({ type: 'fpb:SystemLimit' });
      const out = {
        rootBefore: before.businessObject ? before.businessObject.$type : null,
        systemLimit: rules.allowed('shape.create', { shape: sl, target: before, position: { x: 400, y: 400 } }),
        state: rules.allowed('shape.create', { shape: factory.createShape({ type: 'fpb:Product' }), target: before, position: { x: 400, y: 400 } }),
      };
      window.fpbjs.get('modeling').createShape(sl, { x: 500, y: 450 }, before);
      const root = canvas.getRootElement();
      const project = window.fpbjs.getProjectDefinition();
      out.root = root.businessObject.$type;
      out.consistsOfSystemLimit = root.businessObject.consistsOfSystemLimit === sl.businessObject;
      out.container = root.businessObject.elementsContainer.map((e) => e.id === sl.id);
      out.entryPoint = !!project && project.entryPoint === root;
      out.parentIsProject = root.businessObject.parent === project;
      out.inStore = window.__lr.storeIds().includes(root.id);
      return out;
    });
    expect(r).toEqual({
      rootBefore: null, systemLimit: true, state: false,
      root: 'fpb:Process', consistsOfSystemLimit: true, container: [true],
      entryPoint: true, parentIsProject: true, inStore: true,
    });
    // the new layer takes states and operators like any other
    await page.evaluate(() => {
      const modeling = window.fpbjs.get('modeling');
      const factory = window.fpbjs.get('elementFactory');
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      const s = factory.createShape({ type: 'fpb:Product', id: 'first_state' });
      const po = factory.createShape({ type: 'fpb:ProcessOperator', id: 'first_po' });
      modeling.createShape(s, { x: sl.x + 100, y: sl.y + 100 }, sl);
      modeling.createShape(po, { x: sl.x + 300, y: sl.y + 300 }, sl);
      modeling.connect(s, po, { type: 'fpb:Flow' });
    });
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Rules: system limit versus technical resource', () => {

  test('creating a system limit over a technical resource is refused and explained', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(({ IDS }) => {
      const rules = window.fpbjs.get('rules');
      const factory = window.fpbjs.get('elementFactory');
      const reg = window.fpbjs.get('elementRegistry');
      const root = window.fpbjs.get('canvas').getRootElement();
      const heiz = reg.get(IDS.heizplatte);
      const fired = [];
      window.fpbjs.get('eventBus').on('illegalCreate', (e) => fired.push(e.targetElement.id));
      const shape = factory.createShape({ type: 'fpb:SystemLimit' });
      return {
        overResource: rules.allowed('shape.create', { shape, target: root, position: { x: heiz.x + heiz.width / 2, y: heiz.y + heiz.height / 2 } }),
        firedFor: fired.slice(),
        onResourceTarget: rules.allowed('shape.create', { shape, target: heiz, position: { x: 3000, y: 3000 } }),
        farAway: rules.allowed('shape.create', { shape, target: root, position: { x: heiz.x + 3000, y: heiz.y + 3000 } }),
      };
    }, { IDS });
    expect(r).toEqual({ overResource: false, firedFor: [IDS.heizplatte], onResourceTarget: false, farAway: true });
    const tip = page.locator('.djs-tooltip.djs-tooltip-error', { hasText: 'You are not allowed to place a SystemLimit on a TechnicalResource' });
    await expect(tip).toBeVisible();
  });

  test('a system limit may be created anywhere on a layer without technical resources', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const r = await page.evaluate(() => {
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:SystemLimit' });
      return window.fpbjs.get('rules').allowed('shape.create', {
        shape, target: window.fpbjs.get('canvas').getRootElement(), position: { x: 100, y: 100 }
      });
    });
    expect(r).toBe(true);
  });

  test('moving the system limit onto a technical resource is refused and explained', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(({ IDS }) => {
      const rules = window.fpbjs.get('rules');
      const reg = window.fpbjs.get('elementRegistry');
      const root = window.fpbjs.get('canvas').getRootElement();
      const sl = reg.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const heiz = reg.get(IDS.heizplatte);
      const move = (target, position) => rules.allowed('elements.move', { shapes: [sl], target, position });
      return {
        overResource: move(root, { x: heiz.x + heiz.width + 100, y: heiz.y + heiz.height / 2 }),
        onResourceTarget: move(heiz, { x: 0, y: 0 }),
        free: move(root, { x: sl.x + sl.width / 2, y: sl.y + sl.height / 2 + 2000 }),
      };
    }, { IDS });
    expect(r).toEqual({ overResource: false, onResourceTarget: false, free: true });
    await expect(page.locator('.djs-tooltip.djs-tooltip-error', { hasText: 'You are not allowed to move SystemLimit on TechnicalResource' })).toBeVisible();
  });

  test('the system limit is refused wherever it would cover the resource, from either side', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(({ IDS }) => {
      const rules = window.fpbjs.get('rules');
      const reg = window.fpbjs.get('elementRegistry');
      const root = window.fpbjs.get('canvas').getRootElement();
      const sl = reg.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const tr = reg.get(IDS.heizplatte);
      const trMidY = tr.y + tr.height / 2;
      // position = centre of the moved system limit
      const at = (x, y) => rules.allowed('elements.move', { shapes: [sl], target: root, position: { x, y } });
      return {
        // right edge of the system limit reaches over the left edge of the resource
        fromLeftCovering: at(tr.x - sl.width / 2 + 50, trMidY),
        fromLeftShort: at(tr.x - sl.width / 2 - 50, trMidY),
        // left edge of the system limit reaches over the right edge of the resource
        fromRightCovering: at(tr.x + tr.width + sl.width / 2 - 50, trMidY),
        fromRightShort: at(tr.x + tr.width + sl.width / 2 + 50, trMidY),
        // horizontally over the resource, but entirely below or above it
        below: at(tr.x - sl.width / 2 + 50, trMidY + sl.height / 2 + 50),
        above: at(tr.x - sl.width / 2 + 50, trMidY - sl.height / 2 - 50),
      };
    }, { IDS });
    expect(r).toEqual({
      fromLeftCovering: false, fromLeftShort: true,
      fromRightCovering: false, fromRightShort: true,
      below: true, above: true,
    });
  });

  test('on a layer without technical resources the system limit moves freely', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const r = await page.evaluate(() => {
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      return window.fpbjs.get('rules').allowed('elements.move', {
        shapes: [sl], target: window.fpbjs.get('canvas').getRootElement(), position: { x: 2000, y: 2000 }
      });
    });
    expect(r).toBe(true);
  });
});

test.describe('Rules: elements.move', () => {

  test('states and operators stay in their system limit, resources stay outside', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(({ IDS }) => {
      const rules = window.fpbjs.get('rules');
      const reg = window.fpbjs.get('elementRegistry');
      const root = window.fpbjs.get('canvas').getRootElement();
      const sl = reg.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const warm = reg.get(IDS.warmprodukt);
      const po = reg.get(IDS.pruefen);
      const heiz = reg.get(IDS.heizplatte);
      const move = (shape, target) => rules.allowed('elements.move', { shapes: [shape], target, position: { x: sl.x + 200, y: sl.y + 200 } });
      return {
        stateInSl: move(warm, sl),
        stateToProcess: move(warm, root),
        stateOnOperator: move(warm, po),
        operatorInSl: move(po, sl),
        operatorToProcess: move(po, root),
        resourceOnProcess: move(heiz, root),
        resourceIntoSl: move(heiz, sl),
        resourceOnState: move(heiz, warm),
        resourceOnOperator: move(heiz, po),
        noTarget: rules.allowed('elements.move', { shapes: [warm], position: { x: 0, y: 0 } }),
        // the start of a move is asked without target and position
        noTargetAtStart: rules.allowed('elements.move', { shapes: [warm] }),
      };
    }, { IDS });
    expect(r).toEqual({
      stateInSl: true,
      stateToProcess: false,
      stateOnOperator: false,
      operatorInSl: true,
      operatorToProcess: false,
      resourceOnProcess: true,
      resourceIntoSl: false,
      resourceOnState: false,
      resourceOnOperator: false,
      // while dragging, no target means the pointer is over nothing (outside
      // the canvas): refused, dropping there moved elements anywhere
      noTarget: false,
      noTargetAtStart: true,
    });
  });

  test('Szenario 5: a boundary state on a child layer may not leave the boundary', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const r = await page.evaluate(({ IDS }) => {
      const rules = window.fpbjs.get('rules');
      const reg = window.fpbjs.get('elementRegistry');
      const sl = reg.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const move = (id, dx, dy) => {
        const s = reg.get(id);
        const c = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
        return rules.allowed('elements.move', { shapes: [s], target: sl, position: { x: c.x + dx, y: c.y + dy } });
      };
      return {
        upperInwards: move(IDS.rohstoff, 0, 150),
        upperOutwards: move(IDS.rohstoff, 0, -60),
        upperAlong: move(IDS.rohstoff, 120, 0),
        upperTiny: move(IDS.rohstoff, 0, 5),
        bottomInwards: move(IDS.warmprodukt, 0, -150),
        bottomAlong: move(IDS.warmprodukt, -80, 3),
        internalAnywhere: move(IDS.vorgewaermt, 30, 200),
      };
    }, { IDS });
    expect(r).toEqual({
      upperInwards: false,
      upperOutwards: false,
      upperAlong: true,
      upperTiny: true,
      bottomInwards: false,
      bottomAlong: true,
      internalAnywhere: true,
    });
  });

  test('on the top layer states on the system limit edge move freely', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(({ IDS }) => {
      const reg = window.fpbjs.get('elementRegistry');
      const sl = reg.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const s = reg.get(IDS.rohstoff); // sits on the upper edge of the top system limit
      return window.fpbjs.get('rules').allowed('elements.move', { shapes: [s], target: sl, position: { x: s.x + 25, y: s.y + 200 } });
    }, { IDS });
    expect(r).toBe(true);
  });
});

test.describe('Rules: shape.resize and elements.delete', () => {

  test('only the system limit can be resized', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(({ IDS }) => {
      const rules = window.fpbjs.get('rules');
      const reg = window.fpbjs.get('elementRegistry');
      const sl = reg.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const resize = (shape) => rules.allowed('shape.resize', { shape, newBounds: { x: shape.x, y: shape.y, width: shape.width + 40, height: shape.height + 40 } });
      return {
        systemLimit: resize(sl),
        product: resize(reg.get(IDS.rohstoff)),
        energy: resize(reg.get(IDS.strom)),
        information: resize(reg.get(IDS.temperatur)),
        operator: resize(reg.get(IDS.pruefen)),
        resource: resize(reg.get(IDS.heizplatte)),
      };
    }, { IDS });
    expect(r).toEqual({ systemLimit: true, product: false, energy: false, information: false, operator: false, resource: false });
  });

  test('deleting the top layer system limit is allowed without a dialog', async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const fired = [];
      window.fpbjs.get('eventBus').on('confirmation.required', (e) => fired.push(e.title));
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      return { allowed: window.fpbjs.get('rules').allowed('elements.delete', { elements: [sl] }), fired };
    });
    expect(r).toEqual({ allowed: true, fired: [] });
  });

  test('Szenario 14: deleting the system limit of a child layer is blocked and asks first', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const r = await page.evaluate(({ IDS }) => {
      const fired = [];
      window.fpbjs.get('eventBus').on('confirmation.required', (e) => fired.push({ title: e.title, type: e.action.type, message: e.message }));
      const reg = window.fpbjs.get('elementRegistry');
      const sl = reg.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const rules = window.fpbjs.get('rules');
      return {
        systemLimit: rules.allowed('elements.delete', { elements: [sl] }),
        firedAfterSl: fired.slice(),
        otherElements: rules.allowed('elements.delete', { elements: [reg.get(IDS.vorgewaermt), reg.get(IDS.vorwaermen)] }),
        firedTotal: fired.length,
      };
    }, { IDS });
    expect(r.systemLimit).toBe(false);
    expect(r.firedAfterSl).toEqual([{
      title: 'Remove the decomposition of "Erhitzen"?',
      type: 'remove_decomposition',
      message: 'Deleting the system limit will remove the entire decomposition of ProcessOperator "Erhitzen".',
    }]);
    expect(r.otherElements).toBe(true);
    expect(r.firedTotal).toBe(1);
    await expect(page.locator(DIALOG).locator('.fpb-dialog-title')).toHaveText('Remove the decomposition of "Erhitzen"?');
  });
});

test.describe('Messages on the canvas', () => {

  // 016e V3: a refused delete says why in the message stack
  test('a refused delete says why in the message stack', async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.fpbjs.get('eventBus').fire('illegalDelete', { message: 'This state is locked.' }));
    const note = page.locator('.fpb-notification[data-id="feedback.illegalDelete"]');
    await expect(note).toHaveClass(/fpb-notification--info/);
    await expect(note).toContainText('This state is locked.');
  });

  // B12: names come from files made by others; the message must not run them as HTML
  test('Szenario 14: the message after removing a decomposition shows the operator name as text', async ({ page }) => {
    await load(page);
    const name = '<img src=x onerror="window.__injected=true">';
    await page.evaluate(({ id, name }) => {
      window.fpbjs.get('modeling').updateLabel(window.fpbjs.get('elementRegistry').get(id), name);
    }, { id: IDS.child, name });
    await switchTo(page, IDS.child);
    await page.evaluate(() => {
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      window.fpbjs.get('rules').allowed('elements.delete', { elements: [sl] });
    });
    await page.locator(DIALOG).locator('[data-answer="confirm"]').click();

    const tip = page.locator('.fpb-notification', { hasText: 'has been removed' });
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(name);
    expect(await tip.locator('img').count()).toBe(0);
    expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  });
});

test.describe('Feedback when the editor refuses a move or create (UI drags)', () => {

  test('Szenario 5: dragging a boundary state inwards is refused with a message', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const before = await bounds(page, IDS.rohstoff);
    const from = await screenPos(page, IDS.rohstoff);
    await drag(page, from, { x: from.x, y: from.y + 180 });
    expect(await bounds(page, IDS.rohstoff)).toEqual(before);
    await expect(page.locator('.djs-tooltip.djs-tooltip-error', {
      hasText: 'This state represents an input/output of the decomposed process operator and must remain on the system boundary.'
    })).toBeVisible();
    expect(await issues(page)).toEqual([]);
  });

  test('Szenario 5: sliding a boundary state along the boundary is allowed', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const before = await bounds(page, IDS.rohstoff);
    const from = await screenPos(page, IDS.rohstoff);
    await drag(page, from, { x: from.x - 80, y: from.y });
    const after = await bounds(page, IDS.rohstoff);
    expect(after.y).toBe(before.y);
    // moved sideways by about 80px (the grid may snap a few pixels)
    expect(Math.abs(after.x - (before.x - 80))).toBeLessThan(15);
    // it was on the boundary and stays there: no boundary placement dialog (Szenario 6)
    await page.waitForTimeout(200);
    await expect(page.locator(DIALOG)).toHaveCount(0);
    expect(await issues(page)).toEqual([]);
  });

  test('Szenario 5: sliding works when the state is grabbed at its outer half too', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const before = await bounds(page, IDS.rohstoff);
    const center = await screenPos(page, IDS.rohstoff);
    // an input sits on the upper border: its outer half lies above the border,
    // the pointer is over the layer there, not over the system limit
    const from = { x: center.x, y: center.y - 12 };
    await drag(page, from, { x: from.x - 80, y: from.y });
    const after = await bounds(page, IDS.rohstoff);
    expect(after.y).toBe(before.y);
    expect(Math.abs(after.x - (before.x - 80))).toBeLessThan(15);
    await expect(page.locator('.djs-tooltip.djs-tooltip-error')).toHaveCount(0);
    expect(await issues(page)).toEqual([]);
  });

  test('Szenario 5: grabbed at its outer half, a boundary state still cannot be pulled off the border', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const before = await bounds(page, IDS.rohstoff);
    const center = await screenPos(page, IDS.rohstoff);
    const from = { x: center.x, y: center.y - 12 };
    await drag(page, from, { x: from.x, y: from.y - 120 });
    expect(await bounds(page, IDS.rohstoff)).toEqual(before);
    expect(await issues(page)).toEqual([]);
  });

  test('dragging a label leaves it where it is', async ({ page }) => {
    await load(page);
    const label = () => page.evaluate((id) => {
      const l = window.fpbjs.get('elementRegistry').get(id).labels[0];
      return { id: l.id, x: l.x, y: l.y };
    }, IDS.warmprodukt);
    const before = await label();
    const from = await screenPos(page, before.id);
    await drag(page, from, { x: from.x + 60, y: from.y + 40 });
    const after = await label();
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
  });

  test('the move rule refuses labels (Modeling-Regeln: Labels duerfen nicht bewegt werden)', async ({ page }) => {
    await load(page);
    const allowed = await page.evaluate((id) => {
      const l = window.fpbjs.get('elementRegistry').get(id).labels[0];
      return window.fpbjs.get('rules').allowed('elements.move', { shapes: [l], target: l.parent, position: { x: l.x + 60, y: l.y + 40 } });
    }, IDS.warmprodukt);
    expect(allowed).toBe(false);
  });

  test('dragging an operator out of the system limit is refused with a message', async ({ page }) => {
    await load(page);
    const before = await bounds(page, IDS.pruefen);
    const from = await screenPos(page, IDS.pruefen);
    await drag(page, from, { x: from.x - 500, y: from.y });
    expect(await bounds(page, IDS.pruefen)).toEqual(before);
    await expect(page.locator('.djs-tooltip.djs-tooltip-error', { hasText: 'Process operators must be within the system limits.' })).toBeVisible();
  });

  test('dragging a state out of the system limit is refused with a message', async ({ page }) => {
    await load(page);
    const before = await bounds(page, IDS.warmprodukt);
    const from = await screenPos(page, IDS.warmprodukt);
    await drag(page, from, { x: from.x - 500, y: from.y });
    expect(await bounds(page, IDS.warmprodukt)).toEqual(before);
    await expect(page.locator('.djs-tooltip.djs-tooltip-error', { hasText: 'Product, energy and information must be on or within the system limit' })).toBeVisible();
  });

  test('dragging a technical resource into the system limit is refused with a message', async ({ page }) => {
    await load(page);
    const before = await bounds(page, IDS.heizplatte);
    const from = await screenPos(page, IDS.heizplatte);
    const target = await screenPos(page, IDS.warmprodukt, -150, 0);
    await drag(page, from, target);
    expect(await bounds(page, IDS.heizplatte)).toEqual(before);
    await expect(page.locator('.djs-tooltip.djs-tooltip-error', { hasText: 'Technical resources must be outside the system limits.' })).toBeVisible();
  });

  test('placing a new product outside the system limit is refused with a message', async ({ page }) => {
    await load(page);
    const count = () => page.evaluate(() => window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:Product').length);
    const before = await count();
    const heiz = await screenPos(page, IDS.heizplatte, 0, 250);
    await page.getByRole('button', { name: 'Add Product', exact: true }).click();
    await page.mouse.move(heiz.x - 20, heiz.y, { steps: 3 });
    await page.mouse.move(heiz.x, heiz.y, { steps: 3 });
    await page.mouse.click(heiz.x, heiz.y);
    await page.waitForTimeout(300);
    expect(await count()).toBe(before);
    await expect(page.locator('.djs-tooltip.djs-tooltip-error', { hasText: 'Product, energy and information must be on or within the system limit' })).toBeVisible();
  });

  /** Pick a palette entry and click at a screen point */
  async function place(page, entry, at) {
    await page.getByRole('button', { name: entry, exact: true }).click();
    await page.mouse.move(at.x - 20, at.y, { steps: 3 });
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(300);
  }

  const countOf = (page, type) => page.evaluate((t) => window.fpbjs.get('elementRegistry').filter((e) => e.type === t).length, type);

  test('placing a new operator outside the system limit is refused with a message', async ({ page }) => {
    await load(page);
    const before = await countOf(page, 'fpb:ProcessOperator');
    await place(page, 'Add Process Operator', await screenPos(page, IDS.heizplatte, 0, 250));
    expect(await countOf(page, 'fpb:ProcessOperator')).toBe(before);
    await expect(errorTip(page, 'Process operators must be within the system limits.')).toBeVisible();
  });

  test('placing a new technical resource inside the system limit is refused with a message; outside it is placed', async ({ page }) => {
    await load(page);
    const before = await countOf(page, 'fpb:TechnicalResource');
    await place(page, 'Add Technical Resource', await screenPos(page, IDS.warmprodukt, -150, 0));
    expect(await countOf(page, 'fpb:TechnicalResource')).toBe(before);
    await expect(errorTip(page, 'Technical resources must be outside the system limits.')).toBeVisible();

    await place(page, 'Add Technical Resource', await screenPos(page, IDS.heizplatte, 0, 250));
    await page.keyboard.press('Escape'); // leave the label editing
    expect(await countOf(page, 'fpb:TechnicalResource')).toBe(before + 1);
    const inRoot = await page.evaluate(() => {
      const root = window.fpbjs.get('canvas').getRootElement();
      return root.businessObject.elementsContainer.filter((e) => e.type === 'fpb:TechnicalResource').length;
    });
    expect(inRoot).toBe(before + 1);
    expect(await issues(page)).toEqual([]);
  });

  test('on a child layer an internal state dragged out gets the general message, not the boundary one', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const before = await bounds(page, IDS.vorgewaermt);
    const from = await screenPos(page, IDS.vorgewaermt);
    const out = await page.evaluate(() => {
      const sl = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit')[0];
      const r = window.fpbjs.get('elementRegistry').getGraphics(sl).getBoundingClientRect();
      return { x: r.x + r.width + 150, y: r.y + r.height / 2 };
    });
    await drag(page, from, out);
    expect(await bounds(page, IDS.vorgewaermt)).toEqual(before);
    await expect(errorTip(page, 'Product, energy and information must be on or within the system limit')).toBeVisible();
    await expect(errorTip(page, 'must remain on the system boundary')).toHaveCount(0);
  });

  // 016d V4: once per page, the switch of the import does not count
  test('the navigation hint shows at the first switch only, not at the import', async ({ page }) => {
    await load(page);
    const hint = page.locator('.fpb-notification', { hasText: 'Switching between processes is purely for navigation purposes.' });
    // counted at once, before the hint could go by itself
    expect(await hint.count()).toBe(0);
    await switchTo(page, IDS.child);
    await expect(hint.first()).toBeVisible();
    // closed by the user (016e: a message in the stack), then switch again
    await hint.getByRole('button', { name: 'Dismiss' }).click();
    await expect(hint).toHaveCount(0);
    await switchTo(page, IDS.root);
    await page.waitForTimeout(300);
    expect(await hint.count()).toBe(0);
  });
});
