// tests/e2e/layer-decomposition.spec.js
import { test, expect } from './support/test';
import { ImportPage } from './pages/ImportPage';
import { exportiere } from './helpers/modelExport';
import { load, install, issues, rootId, switchTo, answer, modalTitle, IDS } from './helpers/layerCheck';
import { DIALOG } from './helpers/ui';

/**
 * Decompose and compose (incl. nested layers), every confirmation dialog of
 * the layer system with both answers, and layer consistency (business objects
 * of parent and child layers) after each step, including undo/redo.
 *
 * Docs: FPB.JS_Docs/Layer-Konsistenz.md (Szenario 1-17).
 * Code: DecomposeProcessOperator, ComposeProcess, ConfirmationHandler,
 * ShapeUpdater, ConnectionUpdater, FpbDelete, LayerUndoBoundary.
 *
 * `issues(page)` (helpers/layerCheck.js) lists every consistency break over
 * all layers; the tests expect it empty after every operation.
 */

const decompose = (page, id) => page.evaluate((i) => {
  const po = window.__lr.byId(i);
  window.fpbjs.get('modeling').decomposeProcessOperator(po);
}, id);

const compose = (page) => page.evaluate(() => {
  const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
  window.fpbjs.get('modeling').composeProcess(sl);
});

/** Delete like the context pad / Delete key (FpbDelete) */
const fpbDelete = (page, ids) => page.evaluate((list) => {
  window.fpbjs.get('fpbDelete').remove(list.map((i) => window.__lr.byId(i)));
}, ids);

const containerIds = (page, processId) => page.evaluate((pid) => {
  const p = window.__lr.process(pid);
  const sl = window.__lr.sl(p);
  return (p.businessObject.elementsContainer || []).concat(sl ? sl.businessObject.elementsContainer : []).map((e) => e.id).sort();
}, processId);

const canUndo = (page) => page.evaluate(() => window.fpbjs.get('commandStack').canUndo());

/** Root -> child (Erhitzen) -> grandchild (Vorwärmen); canvas ends on the grandchild */
async function nest(page) {
  await decompose(page, IDS.child);
  await decompose(page, IDS.vorwaermen);
  return page.evaluate((vid) => window.__lr.byId(vid, window.__lr.processes()[1].id).businessObject.decomposedView.id, IDS.vorwaermen);
}

/** Click on an element of the displayed layer (selects it, focuses the canvas for keys) */
async function clickOn(page, id, edge = false) {
  const p = await page.evaluate(({ id, edge }) => {
    const r = document.querySelector(`[data-element-id="${id}"]`).getBoundingClientRect();
    // a system limit is hit on its outline
    return edge ? { x: r.x + 2, y: r.y + r.height / 2 } : { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { id, edge });
  await page.mouse.click(p.x, p.y);
}

/** Create a new product on the system limit of the displayed layer, at its upper or lower edge */
const createOnEdge = (page, id, edge, dx = 0) => page.evaluate(({ id, edge, dx }) => {
  const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
  const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Product', id });
  const y = edge === 'upper' ? sl.y : sl.y + sl.height;
  window.fpbjs.get('modeling').createShape(shape, { x: sl.x + sl.width - 60 + dx, y }, sl);
  window.fpbjs.get('modeling').updateLabel(shape, 'Neu_' + id);
}, { id, edge, dx });

/** Move a state of the displayed layer so its centre lands on the upper/lower edge */
const moveToEdge = (page, id, edge) => page.evaluate(({ id, edge }) => {
  const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
  const s = window.__lr.byId(id);
  const y = edge === 'upper' ? sl.y : sl.y + sl.height;
  window.fpbjs.get('modeling').moveElements([s], { x: 0, y: y - (s.y + s.height / 2) });
}, { id, edge });

test.describe('Decompose', () => {

  test('first decomposition builds a linked child layer with the boundary states', async ({ page }) => {
    await load(page);
    await decompose(page, IDS.pruefen);
    const r = await page.evaluate((IDS) => {
      const root = window.fpbjs.get('canvas').getRootElement();
      const po = window.__lr.byId(IDS.pruefen, IDS.root);
      const top = window.__lr.process(IDS.root);
      return {
        switched: root.id !== IDS.root,
        dv: po.businessObject.decomposedView === root,
        back: root.businessObject.isDecomposedProcessOperator === po.businessObject,
        parent: root.businessObject.parent === top,
        listed: top.businessObject.consistsOfProcesses.includes(root),
        slName: window.__lr.sl(root).businessObject.name,
        boundary: window.__lr.boundary(root.id),
        inStore: window.__lr.storeIds().includes(root.id),
      };
    }, IDS);
    expect(r).toEqual({
      switched: true, dv: true, back: true, parent: true, listed: true,
      slName: 'SL_Prüfen',
      boundary: { upper: [IDS.warmprodukt], bottom: [IDS.ausschuss, IDS.gutprodukt].sort() },
      inStore: true,
    });
    // decomposing is not undoable, the history ends there (LayerUndoBoundary)
    expect(await canUndo(page)).toBe(false);
    expect(await issues(page)).toEqual([]);
  });

  test('entering an existing decomposition again keeps its content', async ({ page }) => {
    await load(page);
    const before = await containerIds(page, IDS.child);
    await decompose(page, IDS.child);
    expect(await rootId(page)).toBe(IDS.child);
    expect(await containerIds(page, IDS.child)).toEqual(before);
    expect(await issues(page)).toEqual([]);
  });

  test('nested decomposition: root -> child -> grandchild stay consistent, compose walks back up', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page);
    expect(await rootId(page)).toBe(grandchild);
    const r = await page.evaluate(({ IDS, grandchild }) => ({
      boundary: window.__lr.boundary(grandchild),
      parent: window.__lr.process(grandchild).businessObject.parent.id,
      chain: window.__lr.processes().map((p) => p.id),
    }), { IDS, grandchild });
    expect(r.boundary).toEqual({
      upper: [IDS.rohstoff, IDS.strom, IDS.temperatur].sort(),
      bottom: [IDS.abwaerme, IDS.vorgewaermt].sort(),
    });
    expect(r.parent).toBe(IDS.child);
    expect(r.chain).toEqual([IDS.root, IDS.child, grandchild]);
    expect(await issues(page)).toEqual([]);

    await compose(page);
    expect(await rootId(page)).toBe(IDS.child);
    expect(await issues(page)).toEqual([]);
    await compose(page);
    expect(await rootId(page)).toBe(IDS.root);
    expect(await issues(page)).toEqual([]);
  });

  test('Szenario 3: a new input of a decomposed operator appears on the child boundary, with a hint', async ({ page }) => {
    await load(page);
    await page.evaluate((IDS) => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Energy', id: 'neu_energie' });
      window.fpbjs.get('modeling').createShape(shape, { x: sl.x + 60, y: sl.y + 60 }, sl);
      window.fpbjs.get('modeling').connect(shape, window.__lr.byId(IDS.child), { type: 'fpb:Flow' });
    }, IDS);
    const b = await page.evaluate((c) => window.__lr.boundary(c), IDS.child);
    expect(b.upper).toContain('neu_energie');
    await expect(page.locator('.fpb-notification', { hasText: 'The ProcessOperator has a decomposed view.' })).toBeVisible();
    expect(await issues(page)).toEqual([]);
  });

  test('Szenario 3 one level down: a new input of a decomposed child operator reaches the grandchild only', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page);
    await compose(page); // back on the child layer
    await page.evaluate((IDS) => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Information', id: 'neu_info' });
      window.fpbjs.get('modeling').createShape(shape, { x: sl.x + 60, y: sl.y + 100 }, sl);
      window.fpbjs.get('modeling').connect(shape, window.__lr.byId(IDS.vorwaermen), { type: 'fpb:Flow' });
    }, IDS);
    const r = await page.evaluate(({ IDS, grandchild }) => ({
      grandchild: window.__lr.boundary(grandchild).upper,
      onRoot: !!window.__lr.byId('neu_info', IDS.root),
    }), { IDS, grandchild });
    expect(r.grandchild).toContain('neu_info');
    expect(r.onRoot).toBe(false);
    expect(await issues(page)).toEqual([]);

    // Szenario 16 one level down: undo takes it off the grandchild again, redo brings it back
    const onGrandchild = () => page.evaluate((g) => !!window.__lr.byId('neu_info', g), grandchild);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await onGrandchild()).toBe(false);
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => window.fpbjs.get('commandStack').redo());
    expect(await onGrandchild()).toBe(true);
    expect(await issues(page)).toEqual([]);
  });

  test('Szenario 3 for an output: a new output of a decomposed operator appears on the lower child boundary', async ({ page }) => {
    await load(page);
    await page.evaluate((IDS) => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Product', id: 'neu_aus' });
      window.fpbjs.get('modeling').createShape(shape, { x: sl.x + 80, y: sl.y + sl.height - 100 }, sl);
      window.fpbjs.get('modeling').connect(window.__lr.byId(IDS.child), shape, { type: 'fpb:Flow' });
    }, IDS);
    const b = await page.evaluate((c) => window.__lr.boundary(c), IDS.child);
    expect(b.bottom).toContain('neu_aus');
    expect(b.upper).not.toContain('neu_aus');
    expect(await issues(page)).toEqual([]);
  });

  test('first decomposition of an operator with a Usage: the resource stays on the parent layer', async ({ page }) => {
    await load(page);
    await page.evaluate((IDS) => {
      // Heizplatte -> Prüfen (resource as source), before the first decomposition of Prüfen
      window.fpbjs.get('modeling').connect(window.__lr.byId(IDS.heizplatte), window.__lr.byId(IDS.pruefen), { type: 'fpb:Usage' });
    }, IDS);
    await decompose(page, IDS.pruefen);
    const r = await page.evaluate((IDS) => {
      const root = window.fpbjs.get('canvas').getRootElement();
      return {
        boundary: window.__lr.boundary(root.id),
        resource: !!window.__lr.byId(IDS.heizplatte),
        usages: window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:Usage').length,
      };
    }, IDS);
    expect(r).toEqual({
      boundary: { upper: [IDS.warmprodukt], bottom: [IDS.ausschuss, IDS.gutprodukt].sort() },
      resource: false,
      usages: 0,
    });
    expect(await issues(page)).toEqual([]);
  });

  test('the system limit of a new layer is named after the operator, also when the operator has no name', async ({ page }) => {
    await load(page);
    const name = await page.evaluate((IDS) => {
      const modeling = window.fpbjs.get('modeling');
      const factory = window.fpbjs.get('elementFactory');
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      // an operator fresh from the palette has no name
      const po = factory.createShape({ type: 'fpb:ProcessOperator', id: 'po_ohne_namen' });
      modeling.createShape(po, { x: sl.x + 120, y: sl.y + 260 }, sl);
      modeling.connect(window.__lr.byId(IDS.gutprodukt), po, { type: 'fpb:Flow' });
      const out = factory.createShape({ type: 'fpb:Product', id: 'aus_ohne_namen' });
      modeling.createShape(out, { x: sl.x + 120, y: sl.y + 420 }, sl);
      modeling.connect(po, out, { type: 'fpb:Flow' });
      modeling.decomposeProcessOperator(po);
      return window.__lr.sl(window.fpbjs.get('canvas').getRootElement()).businessObject.name;
    }, IDS);
    expect(name).not.toContain('undefined');
  });

  test('edits inside a child layer can be undone and redone, the layer change itself not', async ({ page }) => {
    await load(page);
    await decompose(page, IDS.child);
    expect(await canUndo(page)).toBe(false);
    await page.evaluate((IDS) => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      const po = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:ProcessOperator', id: 'k_neu' });
      window.fpbjs.get('modeling').createShape(po, { x: sl.x + 520, y: sl.y + 380 }, sl);
      window.fpbjs.get('modeling').connect(window.__lr.byId(IDS.vorgewaermt), po, { type: 'fpb:Flow' });
    }, IDS);
    const has = () => page.evaluate(() => ({
      po: !!window.__lr.byId('k_neu'),
      flow: window.__lr.byId('k_neu') ? window.__lr.byId('k_neu').incoming.length : 0,
    }));
    expect(await has()).toEqual({ po: true, flow: 1 });
    expect(await issues(page)).toEqual([]);

    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await has()).toEqual({ po: true, flow: 0 });
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await has()).toEqual({ po: false, flow: 0 });
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => window.fpbjs.get('commandStack').redo());
    await page.evaluate(() => window.fpbjs.get('commandStack').redo());
    expect(await has()).toEqual({ po: true, flow: 1 });
    expect(await issues(page)).toEqual([]);

    // going up ends the history there, the edits stay in the child layer
    await compose(page);
    expect(await canUndo(page)).toBe(false);
    expect(await containerIds(page, IDS.child)).toContain('k_neu');
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Deleting across layers, with undo and redo', () => {

  test('Szenario 1/17: deleting an input on the root removes it on all lower layers; undo and redo follow', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page);
    await switchTo(page, IDS.root);
    await fpbDelete(page, [IDS.rohstoff]);
    const where = () => page.evaluate(({ IDS, grandchild }) => [IDS.root, IDS.child, grandchild]
      .map((p) => !!window.__lr.byId(IDS.rohstoff, p)), { IDS, grandchild });
    expect(await where()).toEqual([false, false, false]);
    expect(await issues(page)).toEqual([]);

    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await where()).toEqual([true, true, true]);
    expect(await issues(page)).toEqual([]);

    await page.evaluate(() => window.fpbjs.get('commandStack').redo());
    expect(await where()).toEqual([false, false, false]);
    expect(await issues(page)).toEqual([]);
  });

  test('Szenario 16: undo of a new connection to a decomposed operator removes the child state again', async ({ page }) => {
    await load(page);
    await page.evaluate((IDS) => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Product', id: 'neu_p' });
      window.fpbjs.get('modeling').createShape(shape, { x: sl.x + 60, y: sl.y + 60 }, sl);
      window.fpbjs.get('modeling').connect(shape, window.__lr.byId(IDS.child), { type: 'fpb:Flow' });
    }, IDS);
    const onChild = () => page.evaluate((c) => !!window.__lr.byId('neu_p', c), IDS.child);
    expect(await onChild()).toBe(true);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo()); // the connection
    expect(await onChild()).toBe(false);
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => window.fpbjs.get('commandStack').redo());
    expect(await onChild()).toBe(true);
    expect(await issues(page)).toEqual([]);
  });

  test('Szenario 9: deleting an internal child state connected to a decomposed operator removes it below', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page);
    await compose(page);
    await fpbDelete(page, [IDS.vorgewaermt]); // internal on the child: no dialog
    await expect(page.locator(DIALOG)).toHaveCount(0);
    const r = await page.evaluate(({ IDS, grandchild }) => ({
      child: !!window.__lr.byId(IDS.vorgewaermt, IDS.child),
      grandchild: !!window.__lr.byId(IDS.vorgewaermt, grandchild),
    }), { IDS, grandchild });
    expect(r).toEqual({ child: false, grandchild: false });
    expect(await issues(page)).toEqual([]);
  });

  test('deleting a decomposed operator without dialog (API) can be undone and redone', async ({ page }) => {
    await load(page);
    await page.evaluate((IDS) => window.fpbjs.get('modeling').removeElements([window.__lr.byId(IDS.child)]), IDS);
    const state = () => page.evaluate((IDS) => ({
      po: !!window.__lr.byId(IDS.child, IDS.root),
      listed: window.__lr.process(IDS.root).businessObject.consistsOfProcesses.map((p) => p.id),
      store: window.__lr.storeIds().includes(IDS.child),
    }), IDS);
    expect(await state()).toEqual({ po: false, listed: [], store: false });
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await state()).toEqual({ po: true, listed: [IDS.child], store: true });
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => window.fpbjs.get('commandStack').redo());
    expect(await state()).toEqual({ po: false, listed: [], store: false });
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('The top system limit and the technical resource', () => {

  const topSl = (page) => page.evaluate(() => {
    const sl = window.__lr.sl(window.__lr.top());
    return sl ? { id: sl.id, x: sl.x, y: sl.y } : null;
  });

  test('deleting the top system limit takes its content and the sub layers with it; undo and redo follow; a new one can be placed', async ({ page }) => {
    await load(page);
    const before = await containerIds(page, IDS.root);
    await page.evaluate(() => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      window.fpbjs.get('modeling').removeElements([sl]);
    });
    const state = () => page.evaluate((IDS) => {
      const top = window.__lr.process(IDS.root).businessObject;
      return {
        container: top.elementsContainer.map((e) => e.type),
        consistsOfSystemLimit: !!top.consistsOfSystemLimit,
        states: top.consistsOfStates.length,
        processes: top.consistsOfProcesses.map((p) => p.id),
        store: window.__lr.storeIds().includes(IDS.child),
      };
    }, IDS);
    expect(await state()).toEqual({ container: ['fpb:TechnicalResource'], consistsOfSystemLimit: false, states: 0, processes: [], store: false });
    expect(await issues(page)).toEqual([]);

    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await containerIds(page, IDS.root)).toEqual(before);
    expect(await state()).toEqual(expect.objectContaining({ consistsOfSystemLimit: true, states: 7, processes: [IDS.child], store: true }));
    expect(await issues(page)).toEqual([]);

    await page.evaluate(() => window.fpbjs.get('commandStack').redo());
    expect(await state()).toEqual({ container: ['fpb:TechnicalResource'], consistsOfSystemLimit: false, states: 0, processes: [], store: false });
    expect(await issues(page)).toEqual([]);

    // a fresh system limit on the emptied layer
    const r = await page.evaluate(() => {
      const root = window.fpbjs.get('canvas').getRootElement();
      const sl = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:SystemLimit', id: 'sl_neu' });
      window.fpbjs.get('modeling').createShape(sl, { x: 500, y: 500 }, root);
      return { set: root.businessObject.consistsOfSystemLimit === sl.businessObject, listed: root.businessObject.elementsContainer.includes(sl) };
    });
    expect(r).toEqual({ set: true, listed: true });
    expect(await issues(page)).toEqual([]);
  });

  test('deleting the top system limit with a decomposed operator in it asks first (it removes a sub layer)', async ({ page }) => {
    await load(page);
    await fpbDelete(page, [await topSl(page).then((s) => s.id)]);
    await expect(page.locator(DIALOG)).toHaveCount(1, { timeout: 2000 });
  });

  test('moving the technical resource and the system limit keeps every layer consistent; undo and redo', async ({ page }) => {
    await load(page);
    const where = () => page.evaluate((IDS) => {
      const tr = window.__lr.byId(IDS.heizplatte);
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      const po = window.__lr.byId(IDS.child);
      return { tr: [tr.x, tr.y], sl: [sl.x, sl.y], po: [po.x, po.y] };
    }, IDS);
    const start = await where();
    await page.evaluate((IDS) => {
      const modeling = window.fpbjs.get('modeling');
      modeling.moveElements([window.__lr.byId(IDS.heizplatte)], { x: 200, y: 40 });
      modeling.moveElements([window.__lr.sl(window.fpbjs.get('canvas').getRootElement())], { x: -100, y: 60 });
    }, IDS);
    const moved = await where();
    expect(moved).toEqual({
      tr: [start.tr[0] + 200, start.tr[1] + 40],
      sl: [start.sl[0] - 100, start.sl[1] + 60],
      po: [start.po[0] - 100, start.po[1] + 60], // the content moves with the system limit
    });
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => { window.fpbjs.get('commandStack').undo(); window.fpbjs.get('commandStack').undo(); });
    expect(await where()).toEqual(start);
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => { window.fpbjs.get('commandStack').redo(); window.fpbjs.get('commandStack').redo(); });
    expect(await where()).toEqual(moved);
    expect(await issues(page)).toEqual([]);
    // the child layer is untouched by moves on the parent
    await switchTo(page, IDS.child);
    expect(await issues(page)).toEqual([]);
  });

  test('deleting the Usage of a decomposed operator clears both ends; undo restores them', async ({ page }) => {
    await load(page);
    const USAGE = '0059ef37-ea80-4414-8e8d-8985a35e59bf'; // Erhitzen -> Heizplatte
    const refs = () => page.evaluate(({ IDS, USAGE }) => {
      const po = window.__lr.byId(IDS.child);
      const tr = window.__lr.byId(IDS.heizplatte);
      const ids = (l) => (l || []).map((x) => x.id);
      return {
        inRoot: window.fpbjs.get('canvas').getRootElement().businessObject.elementsContainer.some((e) => e.id === USAGE),
        poOut: ids(po.businessObject.outgoing).includes(USAGE),
        trIn: ids(tr.businessObject.incoming).includes(USAGE),
        poAssigned: ids(po.businessObject.isAssignedTo).includes(IDS.heizplatte),
        trAssigned: ids(tr.businessObject.isAssignedTo).includes(IDS.child),
      };
    }, { IDS, USAGE });
    const all = { inRoot: true, poOut: true, trIn: true, poAssigned: true, trAssigned: true };
    const none = { inRoot: false, poOut: false, trIn: false, poAssigned: false, trAssigned: false };
    expect(await refs()).toEqual(all);
    const boundary = await page.evaluate((c) => window.__lr.boundary(c), IDS.child);
    await page.evaluate((USAGE) => window.fpbjs.get('modeling').removeElements([window.fpbjs.get('elementRegistry').get(USAGE)]), USAGE);
    expect(await refs()).toEqual(none);
    // a Usage is no input or output: the child layer keeps its boundary
    expect(await page.evaluate((c) => window.__lr.boundary(c), IDS.child)).toEqual(boundary);
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await refs()).toEqual(all);
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Connections to decomposed operators and technical resources', () => {

  test('deleting the flow to a decomposed operator removes the state on all lower layers; undo restores it', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page);
    await switchTo(page, IDS.root);
    await page.evaluate((IDS) => {
      const flow = window.__lr.byId(IDS.rohstoff).outgoing.find((f) => f.target.id === IDS.child);
      window.fpbjs.get('modeling').removeElements([flow]);
    }, IDS);
    const where = () => page.evaluate(({ IDS, grandchild }) => [IDS.root, IDS.child, grandchild]
      .map((p) => !!window.__lr.byId(IDS.rohstoff, p)), { IDS, grandchild });
    // the state itself stays on the root, only the lower layers lose it
    expect(await where()).toEqual([true, false, false]);
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await where()).toEqual([true, true, true]);
    expect(await issues(page)).toEqual([]);
  });

  test('a new parallel branch of a decomposed operator joins its tandem and reaches the child; deleting it unlinks both', async ({ page }) => {
    await load(page);
    const PARTNERS = ['5ebecf9d', 'af7572cb']; // Erhitzen -> Warmprodukt / Abwärme (id prefixes)
    const flowId = await page.evaluate((IDS) => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      const shape = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Energy', id: 'neu_zweig' });
      window.fpbjs.get('modeling').createShape(shape, { x: sl.x + 120, y: sl.y + sl.height - 120 }, sl);
      return window.fpbjs.get('modeling').connect(window.__lr.byId(IDS.child), shape, { type: 'fpb:ParallelFlow' }).id;
    }, IDS);
    const tandem = () => page.evaluate((flowId) => {
      const f = window.__lr.byId(flowId);
      return f ? f.businessObject.inTandemWith.map((x) => x.id.slice(0, 8)).sort() : null;
    }, flowId);
    expect(await tandem()).toEqual(PARTNERS.sort());
    expect(await page.evaluate((c) => window.__lr.boundary(c).bottom.includes('neu_zweig'), IDS.child)).toBe(true);
    expect(await issues(page)).toEqual([]);

    await page.evaluate((flowId) => window.fpbjs.get('modeling').removeElements([window.__lr.byId(flowId)]), flowId);
    expect(await tandem()).toBeNull();
    expect(await page.evaluate((c) => window.__lr.boundary(c).bottom.includes('neu_zweig'), IDS.child)).toBe(false);
    expect(await issues(page)).toEqual([]);

    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await tandem()).toEqual(PARTNERS.sort());
    expect(await page.evaluate((c) => window.__lr.boundary(c).bottom.includes('neu_zweig'), IDS.child)).toBe(true);
    expect(await issues(page)).toEqual([]);
  });

  test('deleting an output flow of a decomposed operator: gone on child and grandchild, branches left alone become plain flows; undo restores', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page); // Abwärme is also an output of Vorwärmen, so on the grandchild boundary
    await switchTo(page, IDS.root);
    // child layer: Vorwärmen -> Vorgewärmt / Abwärme and Fertigheizen -> Warmprodukt / Abwärme are parallel branches
    const types = () => page.evaluate(({ IDS, grandchild }) => {
      const sl = window.__lr.sl(window.__lr.process(IDS.child));
      const t = (prefix) => {
        const f = sl.businessObject.elementsContainer.find((e) => e.id.startsWith(prefix));
        return f ? f.businessObject.$type : null;
      };
      return {
        vorwaermen: t('97fa2d66'),
        fertigheizen: t('b299ba2b'),
        abwaerme: [IDS.child, grandchild].map((p) => !!window.__lr.byId(IDS.abwaerme, p)),
      };
    }, { IDS, grandchild });
    expect(await types()).toEqual({ vorwaermen: 'fpb:ParallelFlow', fertigheizen: 'fpb:ParallelFlow', abwaerme: [true, true] });
    await page.evaluate((IDS) => {
      const flow = window.__lr.byId(IDS.child).outgoing.find((f) => f.target.id === IDS.abwaerme);
      window.fpbjs.get('modeling').removeElements([flow]);
    }, IDS);
    expect(await types()).toEqual({ vorwaermen: 'fpb:Flow', fertigheizen: 'fpb:Flow', abwaerme: [false, false] });
    expect(await issues(page)).toEqual([]);
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await types()).toEqual({ vorwaermen: 'fpb:ParallelFlow', fertigheizen: 'fpb:ParallelFlow', abwaerme: [true, true] });
    expect(await issues(page)).toEqual([]);
    await switchTo(page, IDS.child);
    expect(await issues(page)).toEqual([]);
  });

  /** Drag an end of a flow onto another element (the command diagram-js runs for it) */
  const reconnect = (page, { from, to, end, onto }) => page.evaluate(({ from, to, end, onto }) => {
    const flow = window.__lr.byId(from).outgoing.find((f) => f.target && f.target.id === to);
    const el = window.__lr.byId(onto);
    const point = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    if (end === 'target') window.fpbjs.get('modeling').reconnectEnd(flow, el, point);
    else window.fpbjs.get('modeling').reconnectStart(flow, el, point);
    return flow.id;
  }, { from, to, end, onto });

  const onBoundary = (page, processId, edge, stateId) => page.evaluate(({ processId, edge, stateId }) =>
    window.__lr.boundary(processId)[edge].includes(stateId), { processId, edge, stateId });

  const assigned = (page, stateId) => page.evaluate((s) => window.__lr.byId(s).businessObject.isAssignedTo.map((o) => o.id).sort(), stateId);

  test('reconnecting a flow end moves the assignment of the state to the new operator', async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      const po = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:ProcessOperator', id: 'po_neu' });
      window.fpbjs.get('modeling').createShape(po, { x: sl.x + 120, y: sl.y + 300 }, sl);
    });
    // Warmprodukt -> Prüfen becomes Warmprodukt -> po_neu (no decomposed operator involved)
    await reconnect(page, { from: IDS.warmprodukt, to: IDS.pruefen, end: 'target', onto: 'po_neu' });
    expect(await assigned(page, IDS.warmprodukt)).toEqual([IDS.child, 'po_neu'].sort());
    expect(await issues(page)).toEqual([]);
  });

  test('reconnecting an input away from the decomposed operator takes the state off the child boundary', async ({ page }) => {
    await load(page);
    await reconnect(page, { from: IDS.rohstoff, to: IDS.child, end: 'target', onto: IDS.pruefen });
    expect(await page.evaluate((IDS) => window.__lr.io(IDS.child, IDS.root).ins.includes(IDS.rohstoff), IDS)).toBe(false);
    expect(await onBoundary(page, IDS.child, 'upper', IDS.rohstoff)).toBe(false);
    expect(await issues(page)).toEqual([]);
  });

  test('reconnecting an input onto the decomposed operator puts the state on the child boundary', async ({ page }) => {
    await load(page);
    // a new state feeding Prüfen; its flow is then dragged over to Erhitzen
    await page.evaluate((IDS) => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      const s = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Product', id: 'neu_um' });
      window.fpbjs.get('modeling').createShape(s, { x: sl.x + sl.width - 80, y: sl.y + 300 }, sl);
      window.fpbjs.get('modeling').connect(s, window.__lr.byId(IDS.pruefen), { type: 'fpb:Flow' });
    }, IDS);
    expect(await issues(page)).toEqual([]);
    await reconnect(page, { from: 'neu_um', to: IDS.pruefen, end: 'target', onto: IDS.child });
    expect(await onBoundary(page, IDS.child, 'upper', 'neu_um')).toBe(true);
    expect(await issues(page)).toEqual([]);
  });

  test('reconnecting the start of an output away from the decomposed operator takes the state off the child boundary', async ({ page }) => {
    await load(page);
    await reconnect(page, { from: IDS.child, to: IDS.abwaerme, end: 'source', onto: IDS.pruefen });
    expect(await onBoundary(page, IDS.child, 'bottom', IDS.abwaerme)).toBe(false);
    expect(await issues(page)).toEqual([]);
  });

  test('Usage in both directions: references on both ends, nothing on the child layer', async ({ page }) => {
    await load(page);
    const boundaryBefore = await page.evaluate((c) => window.__lr.boundary(c), IDS.child);
    const r = await page.evaluate((IDS) => {
      const modeling = window.fpbjs.get('modeling');
      const factory = window.fpbjs.get('elementFactory');
      const root = window.fpbjs.get('canvas').getRootElement();
      const tr = factory.createShape({ type: 'fpb:TechnicalResource', id: 'tr_neu' });
      modeling.createShape(tr, { x: 200, y: 400 }, root);
      const erhitzen = window.__lr.byId(IDS.child);
      const pruefen = window.__lr.byId(IDS.pruefen);
      const u1 = modeling.connect(tr, erhitzen, { type: 'fpb:Usage' });
      const u2 = modeling.connect(pruefen, tr, { type: 'fpb:Usage' });
      const ids = (list) => (list || []).map((x) => x.id).sort();
      return {
        types: [u1.type, u2.type],
        inRoot: root.businessObject.elementsContainer.filter((e) => e.id === u1.id || e.id === u2.id).length,
        u1: [u1.businessObject.sourceRef.id, u1.businessObject.targetRef.id],
        u2: [u2.businessObject.sourceRef.id, u2.businessObject.targetRef.id],
        trAssigned: ids(tr.businessObject.isAssignedTo),
        erhitzenAssigned: ids(erhitzen.businessObject.isAssignedTo).includes('tr_neu'),
        pruefenAssigned: ids(pruefen.businessObject.isAssignedTo).includes('tr_neu'),
        erhitzenIncoming: ids(erhitzen.businessObject.incoming).includes(u1.id),
        pruefenOutgoing: ids(pruefen.businessObject.outgoing).includes(u2.id),
        trIncoming: ids(tr.businessObject.incoming).includes(u2.id),
        trOutgoing: ids(tr.businessObject.outgoing).includes(u1.id),
      };
    }, IDS);
    expect(r).toEqual({
      types: ['fpb:Usage', 'fpb:Usage'],
      inRoot: 2,
      u1: ['tr_neu', IDS.child],
      u2: [IDS.pruefen, 'tr_neu'],
      trAssigned: [IDS.child, IDS.pruefen].sort(),
      erhitzenAssigned: true,
      pruefenAssigned: true,
      erhitzenIncoming: true,
      pruefenOutgoing: true,
      trIncoming: true,
      trOutgoing: true,
    });
    expect(await page.evaluate((c) => window.__lr.boundary(c), IDS.child)).toEqual(boundaryBefore);
    expect(await issues(page)).toEqual([]);

    // entering the decomposition again does not turn the resource into a boundary state
    await decompose(page, IDS.child);
    expect(await page.evaluate((c) => window.__lr.boundary(c), IDS.child)).toEqual(boundaryBefore);
    expect(await issues(page)).toEqual([]);
  });

  test('undo of Usage connections removes all their references', async ({ page }) => {
    await load(page);
    await page.evaluate((IDS) => {
      const modeling = window.fpbjs.get('modeling');
      const root = window.fpbjs.get('canvas').getRootElement();
      const tr = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:TechnicalResource', id: 'tr_undo' });
      modeling.createShape(tr, { x: 200, y: 400 }, root);
      modeling.connect(window.__lr.byId(IDS.pruefen), tr, { type: 'fpb:Usage' });
      window.fpbjs.get('commandStack').undo();
    }, IDS);
    const r = await page.evaluate((IDS) => {
      const pruefen = window.__lr.byId(IDS.pruefen);
      const tr = window.__lr.byId('tr_undo');
      const root = window.fpbjs.get('canvas').getRootElement();
      return {
        usages: root.businessObject.elementsContainer.filter((e) => e.businessObject.$type === 'fpb:Usage').map((e) => e.id),
        pruefenOut: (pruefen.businessObject.outgoing || []).filter((f) => f.$type === 'fpb:Usage').length,
        pruefenAssigned: (pruefen.businessObject.isAssignedTo || []).map((x) => x.id).includes('tr_undo'),
        trAssigned: (tr.businessObject.isAssignedTo || []).length,
      };
    }, IDS);
    // only the Usage of the fixture (Erhitzen -> Heizplatte) is left
    expect(r).toEqual({ usages: ['0059ef37-ea80-4414-8e8d-8985a35e59bf'], pruefenOut: 0, pruefenAssigned: false, trAssigned: 0 });
  });
});

test.describe('Confirmation: deleting a decomposed operator', () => {

  test('Cancel keeps operator and child layer', async ({ page }) => {
    await load(page);
    const before = await containerIds(page, IDS.root);
    await fpbDelete(page, [IDS.child]);
    await expect(modalTitle(page)).toHaveText(/^Delete ".+"\?$/);
    await expect(page.locator(DIALOG)).toContainText('This process operator contains a decomposed layer.');
    await answer(page, 'Cancel');
    expect(await containerIds(page, IDS.root)).toEqual(before);
    expect(await page.evaluate((c) => window.__lr.storeIds().includes(c), IDS.child)).toBe(true);
    expect(await issues(page)).toEqual([]);
  });

  test('Yes removes operator and child layer, with a message, and ends the undo history', async ({ page }) => {
    await load(page);
    await fpbDelete(page, [IDS.child]);
    await answer(page, 'confirm');
    const r = await page.evaluate((IDS) => ({
      po: !!window.__lr.byId(IDS.child, IDS.root),
      listed: window.__lr.process(IDS.root).businessObject.consistsOfProcesses.length,
      store: window.__lr.storeIds().includes(IDS.child),
    }), IDS);
    expect(r).toEqual({ po: false, listed: 0, store: false });
    await expect(page.locator('.djs-tooltip.djs-tooltip-error', { hasText: 'The deleted ProcessOperator had decomposed views.' })).toBeVisible();
    expect(await canUndo(page)).toBe(false);
    expect(await issues(page)).toEqual([]);
  });

  test('Szenario 11: deleting a decomposed operator on the child layer removes the grandchild', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page);
    await compose(page);
    await fpbDelete(page, [IDS.vorwaermen]);
    await answer(page, 'confirm');
    const r = await page.evaluate(({ IDS, grandchild }) => ({
      po: !!window.__lr.byId(IDS.vorwaermen, IDS.child),
      listed: window.__lr.process(IDS.child).businessObject.consistsOfProcesses.length,
      store: window.__lr.storeIds().includes(grandchild),
      rootLink: window.__lr.byId(IDS.child, IDS.root).businessObject.decomposedView.id,
    }), { IDS, grandchild });
    expect(r).toEqual({ po: false, listed: 0, store: false, rootLink: IDS.child });
    expect(await issues(page)).toEqual([]);
  });

  test('via the Delete key (UI): the same dialog, Cancel keeps everything', async ({ page }) => {
    await load(page);
    const before = await containerIds(page, IDS.root);
    await page.evaluate(() => window.__lr.record(['confirmation.required']));
    await clickOn(page, IDS.child);
    await page.keyboard.press('Delete');
    await expect(modalTitle(page)).toHaveText(/^Delete ".+"\?$/);
    await answer(page, 'Cancel');
    expect(await page.evaluate(() => window.__lr.events.length)).toBe(1);
    expect(await containerIds(page, IDS.root)).toEqual(before);
    expect(await issues(page)).toEqual([]);
  });

  test('via the context pad of the operator (UI)', async ({ page }) => {
    await load(page);
    await page.evaluate((id) => {
      const el = window.fpbjs.get('elementRegistry').get(id);
      window.fpbjs.get('selection').select(el);
      window.fpbjs.get('eventBus').fire('element.click', { element: el });
    }, IDS.child);
    await page.locator('.djs-context-pad .entry[data-action="delete"]').click();
    await expect(modalTitle(page)).toHaveText(/^Delete ".+"\?$/);
    await answer(page, 'confirm');
    expect(await page.evaluate((IDS) => !!window.__lr.byId(IDS.child, IDS.root), IDS)).toBe(false);
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Confirmation: Szenario 2, deleting a boundary state on the child layer', () => {

  test('Cancel keeps the state on both layers', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const child = await containerIds(page, IDS.child);
    const root = await containerIds(page, IDS.root);
    await fpbDelete(page, [IDS.rohstoff]);
    await expect(modalTitle(page)).toHaveText(/^Delete ".+"\?$/);
    await expect(page.locator(DIALOG)).toContainText('This state is connected to the parent layer.');
    await answer(page, 'Cancel');
    expect(await containerIds(page, IDS.child)).toEqual(child);
    expect(await containerIds(page, IDS.root)).toEqual(root);
    expect(await issues(page)).toEqual([]);
  });

  test('Yes removes the state below and only its connection to the operator above (input)', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await fpbDelete(page, [IDS.rohstoff]);
    await answer(page, 'confirm');
    const r = await page.evaluate((IDS) => ({
      child: !!window.__lr.byId(IDS.rohstoff, IDS.child),
      parentState: !!window.__lr.byId(IDS.rohstoff, IDS.root),
      inputs: window.__lr.io(IDS.child, IDS.root).ins,
    }), IDS);
    expect(r).toEqual({ child: false, parentState: true, inputs: [IDS.strom, IDS.temperatur].sort() });
    expect(await canUndo(page)).toBe(false);
    expect(await issues(page)).toEqual([]);
  });

  test('Yes on an output whose parent flow is a parallel branch leaves no stale branch partner', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await fpbDelete(page, [IDS.warmprodukt]);
    await answer(page, 'confirm');
    const r = await page.evaluate((IDS) => ({
      child: !!window.__lr.byId(IDS.warmprodukt, IDS.child),
      parentState: !!window.__lr.byId(IDS.warmprodukt, IDS.root),
      outputs: window.__lr.io(IDS.child, IDS.root).outs,
    }), IDS);
    expect(r).toEqual({ child: false, parentState: true, outputs: [IDS.abwaerme] });
    expect(await issues(page)).toEqual([]);
  });

  test('one level down: deleting a grandchild boundary state removes only its flow to the child operator', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page);
    const root = await containerIds(page, IDS.root);
    await fpbDelete(page, [IDS.rohstoff]);
    await expect(page.locator(DIALOG)).toContainText('This state is connected to the parent layer.');
    await answer(page, 'confirm');
    const r = await page.evaluate(({ IDS, grandchild }) => ({
      grandchild: !!window.__lr.byId(IDS.rohstoff, grandchild),
      child: !!window.__lr.byId(IDS.rohstoff, IDS.child),
      vorwaermenInputs: window.__lr.io(IDS.vorwaermen, IDS.child).ins,
      // still an input of Erhitzen, so still on the child boundary
      childBoundary: window.__lr.boundary(IDS.child).upper.includes(IDS.rohstoff),
    }), { IDS, grandchild });
    expect(r).toEqual({ grandchild: false, child: true, vorwaermenInputs: [IDS.strom, IDS.temperatur].sort(), childBoundary: true });
    expect(await containerIds(page, IDS.root)).toEqual(root);
    expect(await issues(page)).toEqual([]);
  });

  test('a selection with a boundary state asks once for all and deletes all', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await fpbDelete(page, [IDS.rohstoff, IDS.vorgewaermt]);
    await expect(page.locator(DIALOG)).toContainText('The selection contains 2 elements.');
    await answer(page, 'confirm');
    const r = await page.evaluate((IDS) => [IDS.rohstoff, IDS.vorgewaermt].map((i) => !!window.__lr.byId(i, IDS.child)), IDS);
    expect(r).toEqual([false, false]);
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Confirmation: Szenario 4, creating a state on the child boundary', () => {

  test('Yes on the upper edge creates the state above and connects it as input', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await createOnEdge(page, 'b_in', 'upper');
    await expect(modalTitle(page)).toHaveText('Confirm boundary placement');
    await expect(page.locator(DIALOG)).toContainText('This state will become an input/output of the parent process operator.');
    await answer(page, 'confirm');
    const r = await page.evaluate((IDS) => {
      const s = window.__lr.byId('b_in', IDS.root);
      const po = window.__lr.byId(IDS.child, IDS.root);
      return {
        parentState: !!s,
        name: s && s.businessObject.name,
        type: s && s.businessObject.$type,
        inputs: window.__lr.io(IDS.child, IDS.root).ins.includes('b_in'),
        // placed above the operator it feeds, centred on it
        above: s.y + s.height <= po.y,
        centred: Math.abs((s.x + s.width / 2) - (po.x + po.width / 2)) < 1,
      };
    }, IDS);
    expect(r).toEqual({ parentState: true, name: 'Neu_b_in', type: 'fpb:Product', inputs: true, above: true, centred: true });
    expect(await canUndo(page)).toBe(false);
    expect(await issues(page)).toEqual([]);

    // the parent layer shows the new state and its flow
    await switchTo(page, IDS.root);
    const drawn = await page.evaluate(() => {
      const s = window.fpbjs.get('elementRegistry').get('b_in');
      return s ? s.outgoing.map((f) => f.target.id) : null;
    });
    expect(drawn).toEqual([IDS.child]);
    expect(await issues(page)).toEqual([]);
  });

  test('Yes on the lower edge connects the state as output', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await createOnEdge(page, 'b_out', 'bottom');
    await answer(page, 'confirm');
    const r = await page.evaluate((IDS) => {
      const s = window.__lr.byId('b_out', IDS.root);
      const po = window.__lr.byId(IDS.child, IDS.root);
      return {
        outputs: window.__lr.io(IDS.child, IDS.root).outs.includes('b_out'),
        assigned: s.businessObject.isAssignedTo.includes(po.businessObject),
        below: s.y >= po.y + po.height,
      };
    }, IDS);
    expect(r).toEqual({ outputs: true, assigned: true, below: true });
    expect(await issues(page)).toEqual([]);
  });

  test('a new input on the child boundary lands inside the parent system limit, even with the operator near its edge', async ({ page }) => {
    await load(page);
    // Erhitzen close below the upper edge of the top system limit
    await page.evaluate((IDS) => {
      const po = window.__lr.byId(IDS.child);
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      window.fpbjs.get('modeling').moveElements([po], { x: 0, y: sl.y + 20 - po.y });
    }, IDS);
    await switchTo(page, IDS.child);
    await createOnEdge(page, 'b_top', 'upper');
    await answer(page, 'confirm');
    const r = await page.evaluate((IDS) => {
      const s = window.__lr.byId('b_top', IDS.root);
      const sl = window.__lr.sl(window.__lr.process(IDS.root));
      return { input: window.__lr.io(IDS.child, IDS.root).ins.includes('b_top'), insideOrOnEdge: s.y + s.height / 2 >= sl.y - 30 };
    }, IDS);
    expect(r).toEqual({ input: true, insideOrOnEdge: true });
    expect(await issues(page)).toEqual([]);
  });

  test('one level down: a state on the grandchild boundary becomes an input of the child operator only', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page);
    const root = await containerIds(page, IDS.root);
    await createOnEdge(page, 'g_in', 'upper');
    await answer(page, 'confirm');
    const r = await page.evaluate(({ IDS, grandchild }) => ({
      grandchild: window.__lr.boundary(grandchild).upper.includes('g_in'),
      child: !!window.__lr.byId('g_in', IDS.child),
      input: window.__lr.io(IDS.vorwaermen, IDS.child).ins.includes('g_in'),
      // inside the child system limit, not on its boundary: no input of Erhitzen
      childBoundary: window.__lr.boundary(IDS.child).upper.includes('g_in'),
    }), { IDS, grandchild });
    expect(r).toEqual({ grandchild: true, child: true, input: true, childBoundary: false });
    expect(await containerIds(page, IDS.root)).toEqual(root);
    expect(await issues(page)).toEqual([]);
  });

  test('one level down with the operator near the child edge: the new state does not land on the child boundary', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    // Vorwärmen close below the upper edge of the child system limit
    await page.evaluate((IDS) => {
      const po = window.__lr.byId(IDS.vorwaermen);
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      window.fpbjs.get('modeling').moveElements([po], { x: 0, y: sl.y + 60 - po.y });
    }, IDS);
    await decompose(page, IDS.vorwaermen);
    await createOnEdge(page, 'g_top', 'upper');
    await answer(page, 'confirm');
    expect(await page.evaluate((IDS) => window.__lr.io(IDS.vorwaermen, IDS.child).ins.includes('g_top'), IDS)).toBe(true);
    expect(await issues(page)).toEqual([]);
  });

  test('the connection created above survives export and import', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await createOnEdge(page, 'b_rt', 'upper');
    await answer(page, 'confirm');
    const data = await exportiere(page);
    const importer = new ImportPage(page);
    await importer.import(data);
    await install(page);
    const r = await page.evaluate((IDS) => ({
      inputs: window.__lr.io(IDS.child, IDS.root).ins.includes('b_rt'),
      below: window.__lr.boundary(IDS.child).upper.includes('b_rt'),
    }), IDS);
    expect(r).toEqual({ inputs: true, below: true });
    expect(await issues(page)).toEqual([]);
  });

  test('Cancel removes the new state again, the parent stays as it was', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const root = await containerIds(page, IDS.root);
    await createOnEdge(page, 'b_no', 'upper');
    await answer(page, 'Cancel');
    const r = await page.evaluate((IDS) => ({
      child: !!window.__lr.byId('b_no', IDS.child),
      canvas: !!window.fpbjs.get('elementRegistry').get('b_no'),
    }), IDS);
    expect(r).toEqual({ child: false, canvas: false });
    expect(await containerIds(page, IDS.root)).toEqual(root);
    expect(await issues(page)).toEqual([]);
  });

  test('undo after Cancel does not bring back an unconnected boundary state', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await createOnEdge(page, 'b_undo', 'upper');
    await answer(page, 'Cancel');
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Confirmation: Szenario 6, moving an internal state onto the child boundary', () => {

  test('Yes on the lower edge makes it an output of the operator above', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await moveToEdge(page, IDS.vorgewaermt, 'bottom');
    await expect(modalTitle(page)).toHaveText('Confirm boundary placement');
    await answer(page, 'confirm');
    const r = await page.evaluate((IDS) => ({
      parentState: !!window.__lr.byId(IDS.vorgewaermt, IDS.root),
      outputs: window.__lr.io(IDS.child, IDS.root).outs.includes(IDS.vorgewaermt),
    }), IDS);
    expect(r).toEqual({ parentState: true, outputs: true });
    expect(await issues(page)).toEqual([]);
  });

  test('Yes on the upper edge makes it an input of the operator above', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await moveToEdge(page, IDS.vorgewaermt, 'upper');
    await answer(page, 'confirm');
    expect(await page.evaluate((IDS) => window.__lr.io(IDS.child, IDS.root).ins.includes(IDS.vorgewaermt), IDS)).toBe(true);
    expect(await issues(page)).toEqual([]);
  });

  test('Cancel moves the state back, the parent stays as it was', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const root = await containerIds(page, IDS.root);
    const pos = () => page.evaluate((i) => { const s = window.__lr.byId(i); return { x: s.x, y: s.y }; }, IDS.vorgewaermt);
    const before = await pos();
    await moveToEdge(page, IDS.vorgewaermt, 'upper');
    await answer(page, 'Cancel');
    expect(await pos()).toEqual(before);
    expect(await containerIds(page, IDS.root)).toEqual(root);
    expect(await issues(page)).toEqual([]);
  });

  test('undo after Cancel does not put the state back on the boundary unconnected', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await moveToEdge(page, IDS.vorgewaermt, 'upper');
    await answer(page, 'Cancel');
    await page.evaluate(() => window.fpbjs.get('commandStack').undo());
    expect(await issues(page)).toEqual([]);
  });

  /** A second internal state on the child layer, right of Vorgewärmt */
  const addSecondState = (page) => page.evaluate(() => {
    const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
    const second = window.fpbjs.get('elementFactory').createShape({ type: 'fpb:Energy', id: 'second' });
    window.fpbjs.get('modeling').createShape(second, { x: sl.x + sl.width - 100, y: sl.y + 350 }, sl);
  });

  /** Vorgewärmt and "second" onto the upper edge in one move (a selection of two) */
  const moveBothToUpperEdge = (page) => page.evaluate((IDS) => {
    const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
    const a = window.__lr.byId(IDS.vorgewaermt);
    window.fpbjs.get('modeling').moveElements([a, window.__lr.byId('second')], { x: 0, y: sl.y - (a.y + a.height / 2) });
  }, IDS);

  const positions = (page) => page.evaluate((IDS) => [IDS.vorgewaermt, 'second'].map((i) => {
    const s = window.__lr.byId(i);
    return { x: s.x, y: s.y };
  }), IDS);

  test('two states moved onto the edge together: Yes makes both inputs of the operator above', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await addSecondState(page);
    await moveBothToUpperEdge(page);
    await answer(page, 'confirm');
    await expect(page.locator(DIALOG)).toHaveCount(0);
    const ins = await page.evaluate((IDS) => window.__lr.io(IDS.child, IDS.root).ins, IDS);
    expect(ins).toEqual(expect.arrayContaining([IDS.vorgewaermt, 'second']));
    expect(await issues(page)).toEqual([]);
  });

  test('two states moved onto the edge together: Cancel moves both back', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await addSecondState(page);
    const before = await positions(page);
    await moveBothToUpperEdge(page);
    await answer(page, 'Cancel');
    await expect(page.locator(DIALOG)).toHaveCount(0);
    expect(await positions(page)).toEqual(before);
    expect(await issues(page)).toEqual([]);
  });

  test('dragging the state onto the lower edge with the mouse asks and applies (UI)', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const pts = await page.evaluate((i) => {
      const reg = window.fpbjs.get('elementRegistry');
      const s = reg.getGraphics(i).getBoundingClientRect();
      const sl = reg.filter((e) => e.type === 'fpb:SystemLimit')[0];
      const slBox = reg.getGraphics(sl).getBoundingClientRect();
      return { from: { x: s.x + s.width / 2, y: s.y + s.height / 2 }, edgeY: slBox.y + slBox.height, left: slBox.x };
    }, IDS.vorgewaermt);
    // lower edge, left of the other boundary states
    const to = { x: pts.left + 130, y: pts.edgeY };
    await page.mouse.move(pts.from.x, pts.from.y);
    await page.mouse.down();
    await page.mouse.move(pts.from.x, pts.from.y + 40, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await expect(modalTitle(page)).toHaveText('Confirm boundary placement');
    await answer(page, 'confirm');
    expect(await page.evaluate((IDS) => window.__lr.io(IDS.child, IDS.root).outs.includes(IDS.vorgewaermt), IDS)).toBe(true);
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Confirmation: Szenario 14, removing a decomposition', () => {

  const deleteSystemLimitViaPad = async (page) => {
    await page.evaluate(() => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      window.fpbjs.get('selection').select(sl);
      window.fpbjs.get('eventBus').fire('element.click', { element: sl });
    });
    await page.locator('.djs-context-pad .entry[data-action="delete"]').click();
  };

  test('Cancel keeps the child layer and stays there', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const child = await containerIds(page, IDS.child);
    await deleteSystemLimitViaPad(page);
    await expect(modalTitle(page)).toContainText('Remove the decomposition of');
    await expect(page.locator(DIALOG)).toContainText('ProcessOperator "Erhitzen"');
    await answer(page, 'Cancel');
    expect(await rootId(page)).toBe(IDS.child);
    expect(await containerIds(page, IDS.child)).toEqual(child);
    expect(await page.evaluate((IDS) => window.__lr.byId(IDS.child, IDS.root).businessObject.decomposedView.id, IDS)).toBe(IDS.child);
    expect(await issues(page)).toEqual([]);
  });

  test('Yes returns to the parent, unlinks the child layer and tells so; decomposing again starts fresh', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await deleteSystemLimitViaPad(page);
    await answer(page, 'confirm');
    const r = await page.evaluate((IDS) => ({
      root: window.fpbjs.get('canvas').getRootElement().id,
      dv: window.__lr.byId(IDS.child, IDS.root).businessObject.decomposedView || null,
      listed: window.__lr.process(IDS.root).businessObject.consistsOfProcesses.length,
      store: window.__lr.storeIds().includes(IDS.child),
    }), IDS);
    expect(r).toEqual({ root: IDS.root, dv: null, listed: 0, store: false });
    await expect(page.locator('.fpb-notification', { hasText: 'The decomposition of "Erhitzen" has been removed.' })).toBeVisible();
    expect(await canUndo(page)).toBe(false);
    expect(await issues(page)).toEqual([]);

    // the operator can be decomposed again: a fresh layer with only the boundary states
    await decompose(page, IDS.child);
    const fresh = await page.evaluate((IDS) => {
      const root = window.fpbjs.get('canvas').getRootElement();
      const sl = window.__lr.sl(root);
      return {
        types: sl.businessObject.elementsContainer.map((e) => e.businessObject.$type).sort(),
        boundary: window.__lr.boundary(root.id),
        vorwaermen: !!window.__lr.byId(IDS.vorwaermen),
      };
    }, IDS);
    expect(fresh.vorwaermen).toBe(false);
    expect(fresh.boundary).toEqual({
      upper: [IDS.rohstoff, IDS.strom, IDS.temperatur].sort(),
      bottom: [IDS.abwaerme, IDS.warmprodukt].sort(),
    });
    expect(fresh.types.filter((t) => /Flow/.test(t))).toEqual([]);
    expect(await issues(page)).toEqual([]);
  });

  test('the Delete key on the child system limit asks exactly once; selecting it asks nothing (UI)', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    const sl = await page.evaluate(() => window.__lr.sl(window.fpbjs.get('canvas').getRootElement()).id);
    await page.evaluate(() => window.__lr.record(['confirmation.required']));
    await clickOn(page, sl, true);
    expect(await page.evaluate(() => window.fpbjs.get('selection').get().map((e) => e.type))).toEqual(['fpb:SystemLimit']);
    await expect(page.locator('.djs-context-pad .entry[data-action="compose"]')).toBeVisible();
    expect(await page.evaluate(() => window.__lr.events.length)).toBe(0);
    await page.keyboard.press('Delete');
    await expect(modalTitle(page)).toContainText('Remove the decomposition of');
    await answer(page, 'Cancel');
    expect(await page.evaluate(() => window.__lr.events.map((e) => e.type))).toEqual(['remove_decomposition']);
    expect(await rootId(page)).toBe(IDS.child);
    expect(await issues(page)).toEqual([]);
  });

  test('the rule path (elements.delete on the child system limit) leads to the same result', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await page.evaluate(() => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      window.fpbjs.get('rules').allowed('elements.delete', { elements: [sl] });
    });
    await answer(page, 'confirm');
    expect(await rootId(page)).toBe(IDS.root);
    expect(await page.evaluate((IDS) => window.__lr.byId(IDS.child, IDS.root).businessObject.decomposedView || null, IDS)).toBeNull();
    expect(await issues(page)).toEqual([]);
  });

  test('nested: removing the grandchild decomposition returns to the child and keeps root -> child', async ({ page }) => {
    await load(page);
    const grandchild = await nest(page);
    await deleteSystemLimitViaPad(page);
    await answer(page, 'confirm');
    const r = await page.evaluate(({ IDS, grandchild }) => ({
      root: window.fpbjs.get('canvas').getRootElement().id,
      dv: window.__lr.byId(IDS.vorwaermen, IDS.child).businessObject.decomposedView || null,
      childListed: window.__lr.process(IDS.child).businessObject.consistsOfProcesses.length,
      rootLink: window.__lr.byId(IDS.child, IDS.root).businessObject.decomposedView.id,
      store: window.__lr.storeIds().includes(grandchild),
    }), { IDS, grandchild });
    expect(r).toEqual({ root: IDS.child, dv: null, childListed: 0, rootLink: IDS.child, store: false });
    expect(await issues(page)).toEqual([]);
  });
});

test.describe('Compose', () => {

  test('compose on a child layer returns to the parent (context pad, UI)', async ({ page }) => {
    await load(page);
    await switchTo(page, IDS.child);
    await page.evaluate(() => {
      const sl = window.__lr.sl(window.fpbjs.get('canvas').getRootElement());
      window.fpbjs.get('selection').select(sl);
      window.fpbjs.get('eventBus').fire('element.click', { element: sl });
    });
    await page.locator('.djs-context-pad .entry[data-action="compose"]').click();
    await page.waitForTimeout(300);
    expect(await rootId(page)).toBe(IDS.root);
    expect(await canUndo(page)).toBe(false);
    expect(await issues(page)).toEqual([]);
  });

  test('compose on the top layer builds a new parent layer around it', async ({ page }) => {
    await load(page);
    await compose(page);
    const r = await page.evaluate((IDS) => {
      const top = window.fpbjs.get('canvas').getRootElement();
      const old = window.__lr.process(IDS.root);
      const sl = window.__lr.sl(top);
      const po = sl.businessObject.elementsContainer.find((e) => e.businessObject.$type === 'fpb:ProcessOperator');
      return {
        newTop: top.id !== IDS.root,
        entryPoint: window.fpbjs.getProjectDefinition().entryPoint === top,
        oldParent: old.businessObject.parent === top,
        poId: po.id,
        poName: po.businessObject.name,
        dv: po.businessObject.decomposedView === old,
        back: old.businessObject.isDecomposedProcessOperator === po.businessObject,
        listedPo: top.businessObject.consistsOfProcessOperator.includes(po.businessObject),
        io: window.__lr.io(po.id, top.id),
        inStore: window.__lr.storeIds().includes(top.id),
      };
    }, IDS);
    expect(r).toEqual({
      newTop: true, entryPoint: true, oldParent: true,
      poId: IDS.root,
      poName: 'Aufheizen mit Prüfung',
      dv: true, back: true, listedPo: true,
      io: {
        ins: [IDS.rohstoff, IDS.strom, IDS.temperatur].sort(),
        outs: [IDS.abwaerme, IDS.ausschuss, IDS.gutprodukt].sort(),
      },
      inStore: true,
    });
    expect(await canUndo(page)).toBe(false);
    expect(await issues(page)).toEqual([]);

    // and back down into the former top layer, with all of its content
    const before = await containerIds(page, IDS.root);
    await decompose(page, IDS.root);
    expect(await rootId(page)).toBe(IDS.root);
    expect(await containerIds(page, IDS.root)).toEqual(before);
    expect(await issues(page)).toEqual([]);
  });

  test('the new parent layer from compose survives export and import', async ({ page }) => {
    await load(page);
    await compose(page);
    const top = await rootId(page);
    const data = await exportiere(page);
    const importer = new ImportPage(page);
    await importer.import(data);
    await install(page);
    const r = await page.evaluate(() => window.__lr.processes().map((p) => p.id));
    expect(r).toEqual([top, IDS.root, IDS.child]);
    expect(await issues(page)).toEqual([]);
  });

  test('compose twice on the top layer stacks two new parent layers, each linked to the one below', async ({ page }) => {
    await load(page);
    await compose(page);
    const first = await rootId(page);
    await compose(page);
    const second = await rootId(page);
    const r = await page.evaluate(() => ({
      chain: window.__lr.processes().map((p) => p.id),
      entry: window.fpbjs.getProjectDefinition().entryPoint.id,
    }));
    expect(r).toEqual({ chain: [second, first, IDS.root, IDS.child], entry: second });
    expect(await issues(page)).toEqual([]);
    // down again through all four layers
    await decompose(page, first);
    await decompose(page, IDS.root);
    await decompose(page, IDS.child);
    expect(await rootId(page)).toBe(IDS.child);
    expect(await issues(page)).toEqual([]);
  });

  test('compose from a grandchild goes to the child, not to the top', async ({ page }) => {
    await load(page);
    await nest(page);
    await compose(page);
    expect(await rootId(page)).toBe(IDS.child);
    expect(await issues(page)).toEqual([]);
  });
});

/** Every copy of a state over all layers: name, identification, characteristics */
const copies = (page, id) => page.evaluate((id) => window.__lr.processes().map((p) => {
  const sl = window.__lr.sl(p);
  const s = sl && (sl.businessObject.elementsContainer || []).find((e) => e.id === id);
  if (!s) return null;
  const bo = s.businessObject;
  return {
    process: p.id,
    name: bo.name,
    shortName: bo.identification && bo.identification.shortName,
    longName: bo.identification && bo.identification.longName,
    characteristics: (bo.characteristics || []).map((c) => c.category && c.category.shortName)
  };
}).filter(Boolean), id);

/** Do all copies of the state hold the same identification and characteristics objects? */
const sharing = (page, id) => page.evaluate((id) => {
  const bos = window.__lr.processes().map((p) => {
    const sl = window.__lr.sl(p);
    const s = sl && (sl.businessObject.elementsContainer || []).find((e) => e.id === id);
    return s && s.businessObject;
  }).filter(Boolean);
  return {
    identification: bos.every((bo) => bo.identification === bos[0].identification),
    characteristics: bos.every((bo) => bo.characteristics === bos[0].characteristics)
  };
}, id);

const undo = (page) => page.evaluate(() => window.fpbjs.get('commandStack').undo());

/** As both properties panels write: a new object through updateProperties */
const writeIdentification = (page, id, changes) => page.evaluate(({ id, changes }) => {
  const shape = window.__lr.byId(id);
  const bo = shape.businessObject;
  const identification = window.fpbjs.get('fpbFactory').create('fpb:Identification', Object.assign({
    uniqueIdent: bo.identification.uniqueIdent,
    longName: bo.identification.longName,
    shortName: bo.identification.shortName,
    versionNumber: bo.identification.versionNumber,
    revisionNumber: bo.identification.revisionNumber
  }, changes));
  window.fpbjs.get('modeling').updateProperties(shape, { identification });
}, { id, changes });

const addCharacteristic = (page, id, shortName) => page.evaluate(({ id, shortName }) => {
  const shape = window.__lr.byId(id);
  const factory = window.fpbjs.get('fpbFactory');
  const characteristic = factory.create('fpbch:Characteristics', {
    category: factory.create('fpb:Identification', { uniqueIdent: id + '_' + shortName, shortName })
  });
  const list = (shape.businessObject.characteristics || []).concat(characteristic);
  window.fpbjs.get('modeling').updateProperties(shape, { characteristics: list });
}, { id, shortName });

// B14: a boundary state is one object shown on several layers; every edit
// reaches all its copies, and one undo takes it back everywhere
test.describe('Boundary state copies stay one object (B14)', () => {

  test('renaming on the third level renames the state on every level, undo on every level', async ({ page }) => {
    await load(page);
    await nest(page);
    expect((await copies(page, IDS.rohstoff)).length).toBe(3);

    await page.evaluate((id) => window.fpbjs.get('modeling').updateLabel(window.__lr.byId(id), 'Rohstoff neu'), IDS.rohstoff);
    for (const copy of await copies(page, IDS.rohstoff)) {
      expect(copy).toMatchObject({ name: 'Rohstoff neu', shortName: 'Rohstoff neu' });
    }

    await undo(page);
    for (const copy of await copies(page, IDS.rohstoff)) {
      expect(copy).toMatchObject({ name: 'Rohstoff', shortName: 'Rohstoff' });
    }
    expect(await issues(page)).toEqual([]);
  });

  test('renaming on the top level reaches the third level', async ({ page }) => {
    await load(page);
    await nest(page);
    await switchTo(page, IDS.root);

    await page.evaluate((id) => window.fpbjs.get('modeling').updateLabel(window.__lr.byId(id), 'Rohstoff oben'), IDS.rohstoff);
    for (const copy of await copies(page, IDS.rohstoff)) {
      expect(copy).toMatchObject({ name: 'Rohstoff oben', shortName: 'Rohstoff oben' });
    }
    expect(await issues(page)).toEqual([]);
  });

  // Strom: the file holds the same identification and characteristics on all layers
  test('a new identification on one copy reaches all copies that agreed, which then share it; one undo', async ({ page }) => {
    await load(page);
    await nest(page);
    await switchTo(page, IDS.child);
    const before = await copies(page, IDS.strom);
    expect(before.length).toBe(3);

    await writeIdentification(page, IDS.strom, { longName: 'Netzstrom 400 V', versionNumber: '2' });
    for (const copy of await copies(page, IDS.strom)) {
      expect(copy.longName).toBe('Netzstrom 400 V');
    }
    expect(await sharing(page, IDS.strom)).toMatchObject({ identification: true });

    await undo(page);
    expect(await copies(page, IDS.strom)).toEqual(before);
  });

  test('a characteristic added on one copy shows on all copies that agreed; one undo', async ({ page }) => {
    await load(page);
    await nest(page);
    const before = await copies(page, IDS.strom);

    await addCharacteristic(page, IDS.strom, 'Spannung');
    for (const copy of await copies(page, IDS.strom)) {
      expect(copy.characteristics).toContain('Spannung');
    }
    expect(await sharing(page, IDS.strom)).toMatchObject({ characteristics: true });

    await undo(page);
    expect(await copies(page, IDS.strom)).toEqual(before);
  });

  // Rohstoff: the file disagrees, "Rohstoff (unbehandelt)" and the
  // characteristic Temperatur on top, nothing below (020 §2). Aligning such
  // copies is open (020a); until then an edit below must not wipe the top
  test('a copy an older file left different keeps its own data', async ({ page }) => {
    await load(page);
    await nest(page);
    const [top, ...below] = await copies(page, IDS.rohstoff);
    expect(top).toMatchObject({ process: IDS.root, longName: 'Rohstoff (unbehandelt)', characteristics: ['Temperatur'] });
    expect(below.length).toBe(2);

    await writeIdentification(page, IDS.rohstoff, { longName: 'Rohstoff (gemahlen)' });
    await addCharacteristic(page, IDS.rohstoff, 'Feuchte');

    const after = await copies(page, IDS.rohstoff);
    expect(after[0]).toEqual(top);
    for (const copy of after.slice(1)) {
      expect(copy).toMatchObject({ longName: 'Rohstoff (gemahlen)', characteristics: ['Feuchte'] });
    }
  });
});

// B16 and the names of a boundary state: one state, one name (VDI 3682
// Blatt 1, decomposition structures the operators, not the products; Blatt 2,
// one identification per object). Renaming and clearing reach every copy that
// had the same name; a copy an older file left with another name keeps it
// (decided by the user 2026-10-19).
test.describe('Names of a state on every layer (B16)', () => {

  /** As on the canvas: double click the name, type (or delete), click away */
  async function nameOnCanvas(page, id, text) {
    await page.locator(`.djs-element[data-element-id="${id}_label"]`).dblclick({ force: true });
    await page.waitForSelector('.djs-direct-editing-parent', { state: 'visible' });
    await page.keyboard.press('Control+A');
    if (text) {
      await page.keyboard.type(text);
    } else {
      await page.keyboard.press('Delete');
    }
    await page.mouse.click(1100, 960);
    await page.waitForTimeout(300);
  }

  const unnamed = (page) => page.evaluate(() => window.fpbjs.get('fpbValidation').run()
    .filter((i) => i.rule === 'D4').map((i) => i.elementId));

  /** What an older file may hold: the copy in the decomposition named differently */
  const nameBelow = (page, id, name) => page.evaluate(({ id, name, child }) => {
    const sl = window.__lr.sl(window.__lr.process(child));
    const copy = sl.businessObject.elementsContainer.find((e) => e.id === id);
    copy.businessObject.name = name;
    copy.businessObject.identification.shortName = name;
  }, { id, name, child: IDS.child });

  test('a state without copies loses its short name with its name, and the model check notices', async ({ page }) => {
    await load(page);
    await nameOnCanvas(page, IDS.gutprodukt, '');

    const [copy] = await copies(page, IDS.gutprodukt);
    expect(copy.name || '').toBe('');
    expect(copy.shortName || '').toBe('');
    expect(await unnamed(page)).toContain(IDS.gutprodukt);
  });

  test('renaming on the canvas renames the copies on every layer, one undo takes it back', async ({ page }) => {
    await load(page);
    await nameOnCanvas(page, IDS.rohstoff, 'Rohstoff neu');

    const all = await copies(page, IDS.rohstoff);
    expect(all.length).toBeGreaterThan(1);
    for (const copy of all) {
      expect(copy).toMatchObject({ name: 'Rohstoff neu', shortName: 'Rohstoff neu' });
    }
    await undo(page);
    expect(await canUndo(page)).toBe(false);
    for (const copy of await copies(page, IDS.rohstoff)) {
      expect(copy).toMatchObject({ name: 'Rohstoff', shortName: 'Rohstoff' });
    }
    expect(await issues(page)).toEqual([]);
  });

  test('clearing on the canvas clears the name on every layer without a question, one undo brings it back', async ({ page }) => {
    await load(page);
    await nameOnCanvas(page, IDS.rohstoff, '');
    await expect(page.locator(DIALOG)).toHaveCount(0);

    for (const copy of await copies(page, IDS.rohstoff)) {
      expect(copy.name || '').toBe('');
      expect(copy.shortName || '').toBe('');
    }
    await undo(page);
    expect(await canUndo(page)).toBe(false);
    for (const copy of await copies(page, IDS.rohstoff)) {
      expect(copy).toMatchObject({ name: 'Rohstoff', shortName: 'Rohstoff' });
    }
    expect(await issues(page)).toEqual([]);
  });

  test('in read-only mode the finding offers no alignment, and offers it again afterwards (F9)', async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
      window.fpbjs.get('readOnly').set(true);
      window.fpbjs.get('fpbValidation').run();
      window.fpbjs.get('fpbValidation').openPanel();
    });
    const item = page.locator('.fpb-validation-item[data-rule="F9"]');
    await expect(item).toHaveCount(1);
    await expect(item.getByRole('button', { name: /Use the values of/ })).toHaveCount(0);

    await page.evaluate(() => window.fpbjs.get('readOnly').set(false));
    await expect(item.getByRole('button', { name: 'Use the values of the top level' })).toBeVisible();
  });

  // the test model: "Rohstoff (unbehandelt)" and Temperatur on top, nothing below (020 §2)
  test('the model check reports copies that differ and aligns them to the chosen layer in one step (F9)', async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
      window.fpbjs.get('fpbValidation').run();
      window.fpbjs.get('fpbValidation').openPanel();
    });
    const item = page.locator('.fpb-validation-item[data-rule="F9"]');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('"Rohstoff"');
    await expect(item).toContainText('long name');
    await item.getByRole('button', { name: 'Use the values of the top level' }).click();

    for (const copy of await copies(page, IDS.rohstoff)) {
      expect(copy).toMatchObject({ name: 'Rohstoff', longName: 'Rohstoff (unbehandelt)', characteristics: ['Temperatur'] });
    }
    // one object again, as the copies of a new boundary state (B14)
    expect(await sharing(page, IDS.rohstoff)).toEqual({ identification: true, characteristics: true });
    await expect(page.locator('.fpb-validation-item[data-rule="F9"]')).toHaveCount(0);

    await undo(page);
    expect(await canUndo(page)).toBe(false);
    const [top, ...below] = await copies(page, IDS.rohstoff);
    expect(top).toMatchObject({ longName: 'Rohstoff (unbehandelt)', characteristics: ['Temperatur'] });
    for (const copy of below) {
      expect(copy.characteristics).toEqual([]);
    }
  });

  test('a copy an older file left with another name keeps it when the state is renamed or cleared', async ({ page }) => {
    await load(page);
    await nameBelow(page, IDS.rohstoff, 'Rohstoff (alt)');

    await nameOnCanvas(page, IDS.rohstoff, 'Rohstoff neu');
    let [top, ...below] = await copies(page, IDS.rohstoff);
    expect(top).toMatchObject({ name: 'Rohstoff neu', shortName: 'Rohstoff neu' });
    for (const copy of below) {
      expect(copy).toMatchObject({ name: 'Rohstoff (alt)', shortName: 'Rohstoff (alt)' });
    }

    await nameOnCanvas(page, IDS.rohstoff, '');
    [top, ...below] = await copies(page, IDS.rohstoff);
    expect(top.name || '').toBe('');
    for (const copy of below) {
      expect(copy).toMatchObject({ name: 'Rohstoff (alt)', shortName: 'Rohstoff (alt)' });
    }
  });
});
