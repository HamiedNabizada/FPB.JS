// tests/e2e/helpers/layerCheck.js
import { ImportPage } from '../pages/ImportPage';
import basis from '../fixtures/temperieren.json';

/**
 * Shared setup for the layer rule and decomposition specs.
 *
 * `load` imports the temperieren fixture (root layer with the decomposed
 * operator "Erhitzen", child layer with "Vorwärmen" and "Fertigheizen") and
 * installs `window.__lr`, a set of in-page helpers:
 *
 * - `__lr.issues()` walks every layer from the top process down and lists
 *   every break of layer consistency it finds in the business objects:
 *   boundary states of a child layer vs. inputs/outputs of the decomposed
 *   operator, parent/child references, sourceRef/targetRef vs. incoming/
 *   outgoing, isAssignedTo, dangling flows, stale inTandemWith partners,
 *   the canvas vs. the container of the displayed layer, and the data store.
 * - `__lr.shape(name, processId?)` finds a shape by (normalised) name in the
 *   system limit container of a process (default: the displayed one).
 *
 * `open(page, data)` does the same for a model built with helpers/modelBuilder.
 */

export const IDS = {
  root: '55b4780e-6896-4e92-b184-858cf0cb5b32',
  child: '9ca400c0-a373-48c0-9f13-37ce196cee29', // = id of operator "Erhitzen"
  vorwaermen: 'c9dc0159-5e01-4139-a98a-141a10e4e4c4',
  pruefen: '9833d9a9-1b88-4bfb-91b3-7ab5e2617045',
  rohstoff: 'c50336d6-9a7f-46e3-a7f5-e6187618dd69',
  strom: '6d5ba42c-ba5f-4348-abc3-3f7395b8ce2d',
  temperatur: '448910e5-360c-4533-adbc-e4a022f30780',
  warmprodukt: 'ee2dd67d-eecf-4a76-bb64-148b6ed4c320',
  abwaerme: 'ad82ec45-1b70-48ee-bf1f-a56cc2f40c8c',
  gutprodukt: '1a9fc4c7-3c89-4277-8965-3b186eaa2672',
  ausschuss: '61a6df5b-1081-4651-93ae-572fea3994ab',
  vorgewaermt: '2ef5a29f-cf06-4faa-833d-62f61f98eb0f',
  heizplatte: '9fe05bdc-4f2b-4ec5-8128-51dbc597eee2',
};

export async function load(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(JSON.parse(JSON.stringify(basis)));
  await install(page);
  return importer;
}

/** Import a model (e.g. from ModelBuilder.build()) and install the helpers */
export async function open(page, data) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const importer = new ImportPage(page);
  await importer.goto();
  await importer.import(data);
  await install(page);
  return importer;
}

export async function install(page) {
  await page.evaluate(() => {
    const STATES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];
    const FLOWS = ['fpb:Flow', 'fpb:ParallelFlow', 'fpb:AlternativeFlow'];
    const get = (n) => window.fpbjs.get(n);
    const type = (e) => e && e.businessObject && e.businessObject.$type;
    const norm = (s) => String(s || '').replace(/\s+/g, '');

    const lr = {
      events: [],

      sl(process) {
        return ((process && process.businessObject.elementsContainer) || [])
          .find((e) => type(e) === 'fpb:SystemLimit') || null;
      },

      border(sl, s) {
        const c = s.y + (s.height || 50) / 2;
        if (Math.abs(c - sl.y) <= 30) return 'upper';
        if (Math.abs(c - (sl.y + sl.height)) <= 30) return 'bottom';
        return '';
      },

      top() {
        let p = get('canvas').getRootElement();
        for (let i = 0; i < 20; i++) {
          const parent = p.businessObject.parent;
          if (parent && parent.businessObject && parent.businessObject.$type === 'fpb:Process') {
            p = parent;
          } else {
            break;
          }
        }
        return p;
      },

      processes() {
        const out = [];
        const walk = (p) => {
          if (!p || out.includes(p)) return;
          out.push(p);
          (p.businessObject.consistsOfProcesses || []).forEach(walk);
        };
        walk(lr.top());
        return out;
      },

      process(id) {
        return lr.processes().find((p) => p.id === id) || null;
      },

      shape(name, processId) {
        const p = processId ? lr.process(processId) : get('canvas').getRootElement();
        const sl = lr.sl(p);
        const all = (sl ? sl.businessObject.elementsContainer : []).concat(p.businessObject.elementsContainer || []);
        return all.find((e) => norm(e.businessObject && e.businessObject.name) === norm(name)) || null;
      },

      byId(id, processId) {
        const p = processId ? lr.process(processId) : get('canvas').getRootElement();
        const sl = lr.sl(p);
        const all = (sl ? sl.businessObject.elementsContainer : []).concat(p.businessObject.elementsContainer || []);
        return all.find((e) => e.id === id) || null;
      },

      /** boundary state ids of a process: { upper: [...], bottom: [...] } */
      boundary(processId) {
        const p = lr.process(processId);
        const sl = lr.sl(p);
        const res = { upper: [], bottom: [] };
        (sl ? sl.businessObject.elementsContainer : []).filter((e) => STATES.includes(type(e))).forEach((s) => {
          const b = lr.border(sl, s);
          if (b) res[b].push(s.id);
        });
        res.upper.sort();
        res.bottom.sort();
        return res;
      },

      /** inputs/outputs (state ids) of an operator in a process */
      io(poId, processId) {
        const po = lr.byId(poId, processId);
        const bo = po.businessObject;
        const ins = (bo.incoming || []).filter((f) => f.$type !== 'fpb:Usage').map((f) => f.sourceRef && f.sourceRef.id).sort();
        const outs = (bo.outgoing || []).filter((f) => f.$type !== 'fpb:Usage').map((f) => f.targetRef && f.targetRef.id).sort();
        return { ins, outs };
      },

      issues() {
        const issues = [];
        const processes = lr.processes();
        const storeIds = (window.fpbjs.getProcesses() || []).filter((e) => e && e.process).map((e) => e.process.id);

        processes.forEach((p) => {
          const pid = p.id.slice(0, 8);
          const bo = p.businessObject;
          if (!storeIds.includes(p.id)) issues.push(`${pid}: process missing in data store`);
          const sl = lr.sl(p);
          if (!sl) return;
          const items = sl.businessObject.elementsContainer || [];
          const ids = items.map((e) => e.id);
          const states = items.filter((e) => STATES.includes(type(e)));
          const pos = items.filter((e) => type(e) === 'fpb:ProcessOperator');
          const flows = items.filter((e) => FLOWS.includes(type(e)));

          if (new Set(ids).size !== ids.length) issues.push(`${pid}: duplicate ids in system limit container`);

          // consistsOfStates matches the states in the container
          const cos = (bo.consistsOfStates || []).map((s) => s.id).sort();
          const sts = states.map((s) => s.id).sort();
          if (JSON.stringify(cos) !== JSON.stringify(sts)) {
            issues.push(`${pid}: consistsOfStates ${JSON.stringify(cos.map((x) => x.slice(0, 8)))} != states ${JSON.stringify(sts.map((x) => x.slice(0, 8)))}`);
          }

          flows.forEach((f) => {
            const fb = f.businessObject;
            const fid = f.id.slice(0, 8);
            if (!fb.sourceRef || !fb.targetRef || typeof fb.sourceRef === 'string' || typeof fb.targetRef === 'string') {
              issues.push(`${pid}: flow ${fid} without resolved refs`);
              return;
            }
            if (!ids.includes(fb.sourceRef.id)) issues.push(`${pid}: flow ${fid} source not in layer`);
            if (!ids.includes(fb.targetRef.id)) issues.push(`${pid}: flow ${fid} target not in layer`);
            if (!(fb.sourceRef.outgoing || []).includes(fb)) issues.push(`${pid}: flow ${fid} missing in sourceRef.outgoing`);
            if (!(fb.targetRef.incoming || []).includes(fb)) issues.push(`${pid}: flow ${fid} missing in targetRef.incoming`);
            if (f.source && f.source.id !== fb.sourceRef.id) issues.push(`${pid}: flow ${fid} shape source != sourceRef`);
            if (f.target && f.target.id !== fb.targetRef.id) issues.push(`${pid}: flow ${fid} shape target != targetRef`);
            const state = STATES.includes(fb.sourceRef.$type) ? fb.sourceRef : fb.targetRef;
            const po = state === fb.sourceRef ? fb.targetRef : fb.sourceRef;
            if (!(state.isAssignedTo || []).includes(po)) issues.push(`${pid}: state ${state.id.slice(0, 8)} not assigned to ${po.id.slice(0, 8)}`);
            (fb.inTandemWith || []).forEach((partner) => {
              if (!partner || typeof partner === 'string') {
                issues.push(`${pid}: flow ${fid} unresolved tandem partner`);
              } else if (!ids.includes(partner.id)) {
                issues.push(`${pid}: flow ${fid} tandem partner ${partner.id.slice(0, 8)} not in layer`);
              } else if (!(partner.inTandemWith || []).includes(fb)) {
                issues.push(`${pid}: flow ${fid} tandem not mutual`);
              }
            });
          });

          // every state lies on or within its system limit (a boundary state
          // sits on the edge, within the 30px tolerance of checkIfOnSystemBorder)
          states.forEach((s) => {
            const cx = s.x + (s.width || 50) / 2;
            const cy = s.y + (s.height || 50) / 2;
            const T = 30;
            if (cx < sl.x - T || cx > sl.x + sl.width + T || cy < sl.y - T || cy > sl.y + sl.height + T) {
              issues.push(`${pid}: state ${s.id.slice(0, 8)} outside the system limit`);
            }
          });

          // a Usage connects a process operator and a technical resource, nothing else
          items.concat(bo.elementsContainer || []).filter((e) => type(e) === 'fpb:Usage').forEach((u) => {
            const ends = [u.businessObject.sourceRef, u.businessObject.targetRef].map((x) => x && x.$type).sort();
            if (JSON.stringify(ends) !== JSON.stringify(['fpb:ProcessOperator', 'fpb:TechnicalResource'])) {
              issues.push(`${pid}: usage ${u.id.slice(0, 8)} connects ${ends.join(' and ')}`);
            }
          });

          // no dangling references from states / operators
          states.concat(pos).forEach((e) => {
            const eb = e.businessObject;
            ['incoming', 'outgoing'].forEach((k) => {
              (eb[k] || []).filter((f) => f && f.$type !== 'fpb:Usage').forEach((f) => {
                if (!ids.includes(f.id)) issues.push(`${pid}: ${e.id.slice(0, 8)}.${k} holds flow ${String(f.id).slice(0, 8)} that is not in the layer`);
              });
            });
            (e.incoming || []).concat(e.outgoing || []).forEach((c) => {
              if (FLOWS.includes(type(c)) && !ids.includes(c.id)) issues.push(`${pid}: shape ${e.id.slice(0, 8)} keeps connection ${c.id.slice(0, 8)} that is not in the layer`);
            });
          });

          // decomposition links
          pos.forEach((po) => {
            const child = po.businessObject.decomposedView;
            if (!child) return;
            const cid = child.id.slice(0, 8);
            if (child.businessObject.isDecomposedProcessOperator !== po.businessObject) issues.push(`${cid}: isDecomposedProcessOperator does not point back`);
            if (child.businessObject.parent !== p) issues.push(`${cid}: parent is not ${pid}`);
            if (!(bo.consistsOfProcesses || []).includes(child)) issues.push(`${pid}: consistsOfProcesses lacks ${cid}`);
            const childSl = lr.sl(child);
            if (!childSl) {
              issues.push(`${cid}: no system limit`);
              return;
            }
            const b = lr.boundary(child.id);
            const io = lr.io(po.id, p.id);
            if (JSON.stringify(b.upper) !== JSON.stringify(io.ins)) {
              issues.push(`${cid}: upper boundary ${JSON.stringify(b.upper.map((x) => x.slice(0, 8)))} != inputs of ${po.id.slice(0, 8)} ${JSON.stringify(io.ins.map((x) => (x || '').slice(0, 8)))}`);
            }
            if (JSON.stringify(b.bottom) !== JSON.stringify(io.outs)) {
              issues.push(`${cid}: bottom boundary ${JSON.stringify(b.bottom.map((x) => x.slice(0, 8)))} != outputs of ${po.id.slice(0, 8)} ${JSON.stringify(io.outs.map((x) => (x || '').slice(0, 8)))}`);
            }
          });
          (bo.consistsOfProcesses || []).forEach((child) => {
            const po = child.businessObject.isDecomposedProcessOperator;
            const poShape = po && items.find((e) => e.businessObject === po);
            if (!poShape) issues.push(`${pid}: sub process ${child.id.slice(0, 8)} has no operator in this layer`);
            else if (po.decomposedView !== child) issues.push(`${pid}: operator ${po.id.slice(0, 8)} does not point to sub process ${child.id.slice(0, 8)}`);
          });
        });

        // the canvas shows exactly the container of the displayed layer
        const root = get('canvas').getRootElement();
        const sl = lr.sl(root);
        const expected = (root.businessObject.elementsContainer || []).concat(sl ? sl.businessObject.elementsContainer : [])
          .map((e) => e.id).sort();
        const shown = get('elementRegistry').filter((e) => e !== root && e.type !== 'label' && e.parent).map((e) => e.id).sort();
        if (JSON.stringify(expected) !== JSON.stringify(shown)) {
          const miss = expected.filter((x) => !shown.includes(x)).map((x) => x.slice(0, 8));
          const extra = shown.filter((x) => !expected.includes(x)).map((x) => x.slice(0, 8));
          issues.push(`canvas != container of ${root.id.slice(0, 8)}: missing ${JSON.stringify(miss)} extra ${JSON.stringify(extra)}`);
        }
        return issues;
      },

      storeIds() {
        return (window.fpbjs.getProcesses() || []).filter((e) => e && e.process).map((e) => e.process.id);
      },

      record(names) {
        names.forEach((n) => get('eventBus').on(n, (e) => {
          lr.events.push({ name: n, title: e.title, type: e.action && e.action.type });
        }));
      },

      tooltips() {
        return Array.from(document.querySelectorAll('.djs-tooltip')).map((t) => ({
          type: (t.className.match(/djs-tooltip-(\w+)/) || [])[1] || '',
          text: t.textContent.trim(),
        }));
      },
    };
    window.__lr = lr;
  });
}

/** Consistency issues across all layers (empty when consistent) */
export const issues = (page) => page.evaluate(() => window.__lr.issues());

export const rootId = (page) => page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);

/** Switch the canvas to a process (by id) */
export async function switchTo(page, id) {
  await page.evaluate((pid) => {
    window.fpbjs.get('modeling').switchProcess(window.__lr.process(pid));
  }, id);
  await page.waitForTimeout(200);
}

/** Wait for the confirmation modal and click one of its buttons */
export async function answer(page, button) {
  const modal = page.locator('.modal.show');
  await modal.waitFor({ state: 'visible', timeout: 5000 });
  await modal.getByRole('button', { name: button }).click();
  await modal.waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForTimeout(200);
}

export const modalTitle = (page) => page.locator('.modal.show .modal-title');
