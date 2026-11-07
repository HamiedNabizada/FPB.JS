import { test, expect } from './support/test';
import fs from 'fs';
import path from 'path';

import { ImportPage } from './pages/ImportPage';
import { install } from './helpers/layerCheck';
import basis from './fixtures/temperieren.json';

/**
 * Random use of the web app ("monkey test"): mouse, keys and API calls picked
 * by a seeded random number, each seed its own test. After every step: no
 * error in the page or the console, and the layers consistent
 * (`__lr.issues()`, the check of the layer specs). Every 30 steps the model
 * goes out through the export dialog and comes back in, and must come back
 * the same.
 *
 * Off by default: `MONKEY=1 npx playwright test tests/e2e/monkey.spec.js
 * --project=chromium`. MONKEY_SEEDS (default 12) seeds from MONKEY_FIRST
 * (default 1000), MONKEY_STEPS (default 150), MONKEY_SEED (a single seed, to
 * repeat a finding), MONKEY_TRACE (from that step on, the layers after each step).
 */

const ON = !!process.env.MONKEY;
const FIRST = Number(process.env.MONKEY_FIRST || 1000);
const SEEDS = process.env.MONKEY_SEED ? [Number(process.env.MONKEY_SEED)]
  : Array.from({ length: Number(process.env.MONKEY_SEEDS || 12) }, (_, i) => FIRST + i);
const STEPS = Number(process.env.MONKEY_STEPS || 150);
// MONKEY_TRACE=n: from step n on, log the layers after every step
const TRACE = Number(process.env.MONKEY_TRACE || 0);
const EXAMPLE = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'examples', 'Showcase-A-WaermetauscherMitRegelung.aml'), 'utf8');

/** mulberry32 */
function random(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p
  };
}

const TEXTS = ['', 'A', 'Zustand ä', 'Neuer Name', '   ', 'x'.repeat(80), 'Prüfen', '<b>&amp;</b>'];
const KEYS = ['Delete', 'Backspace', 'Control+z', 'Control+y', 'Control+Shift+z', 'Control+a', 'Control+c', 'Control+v',
  'Escape', 'Alt+ArrowUp', 'Alt+ArrowDown', 'Control+f', 'Tab', 'Enter', 'ArrowLeft', 'ArrowDown'];

/** In-page helpers: what is on the canvas, and where on the screen */
async function helpers(page) {
  await page.evaluate(() => {
    const get = (n) => window.fpbjs.get(n);
    window.__monkey = {
      screen(p) {
        const canvas = get('canvas');
        const vb = canvas.viewbox();
        const rect = canvas.getContainer().getBoundingClientRect();
        return { x: rect.left + (p.x - vb.x) * vb.scale, y: rect.top + (p.y - vb.y) * vb.scale };
      },
      inView(p) {
        const rect = get('canvas').getContainer().getBoundingClientRect();
        return p.x > rect.left + 5 && p.x < rect.right - 5 && p.y > rect.top + 5 && p.y < rect.bottom - 5;
      },
      shapes() {
        const root = get('canvas').getRootElement();
        return get('elementRegistry').filter((e) => !e.waypoints && e.type !== 'label' && e !== root && e.businessObject)
          .map((e) => ({ id: e.id, type: e.type, c: window.__monkey.screen({ x: e.x + e.width / 2, y: e.y + e.height / 2 }) }))
          .filter((s) => window.__monkey.inView(s.c));
      },
      flows() {
        return get('elementRegistry').filter((e) => e.waypoints).map((e) => e.id);
      },
      area() {
        const rect = get('canvas').getContainer().getBoundingClientRect();
        return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
      },
      processes() {
        const out = [];
        const project = window.fpbjs.getProjectDefinition && window.fpbjs.getProjectDefinition();
        const queue = project && project.entryPoint ? [project.entryPoint] : [];
        while (queue.length) {
          const p = queue.shift();
          if (!p || out.includes(p)) continue;
          out.push(p);
          ((p.businessObject && p.businessObject.consistsOfProcesses) || []).forEach((c) => queue.push(c));
        }
        return out;
      }
    };
  });
}

async function point(page, rnd) {
  const shapes = await page.evaluate(() => window.__monkey.shapes());
  if (shapes.length && rnd.chance(0.6)) {
    const s = rnd.pick(shapes);
    return { x: s.c.x + rnd.int(120) - 60, y: s.c.y + rnd.int(120) - 60 };
  }
  const a = await page.evaluate(() => window.__monkey.area());
  return { x: a.x + 20 + rnd.int(Math.max(1, a.w - 40)), y: a.y + 20 + rnd.int(Math.max(1, a.h - 40)) };
}

async function shape(page, rnd) {
  const shapes = await page.evaluate(() => window.__monkey.shapes());
  return shapes.length ? rnd.pick(shapes) : null;
}

const visible = (page, selector) => page.locator(selector).filter({ visible: true });

async function clickSome(page, rnd, selector) {
  const items = visible(page, selector);
  const n = await items.count();
  if (!n) return null;
  const item = items.nth(rnd.int(n));
  const name = (await item.getAttribute('data-action')) || (await item.getAttribute('id')) || (await item.getAttribute('aria-label')) || (await item.textContent() || '').trim().slice(0, 30);
  await item.click({ timeout: 1500 });
  return name;
}

/** One step; returns what it did */
async function step(page, rnd) {
  // something open first: a dialog, a popup menu, direct editing
  if (await visible(page, 'dialog[open]').count()) {
    if (rnd.chance(0.2)) {
      await page.keyboard.press('Escape');
      return 'dialog: Escape';
    }
    const name = await clickSome(page, rnd, 'dialog[open] button, dialog[open] input[type=radio], dialog[open] input[type=checkbox]');
    return 'dialog: ' + name;
  }
  if (await visible(page, '.djs-popup').count()) {
    if (rnd.chance(0.3)) {
      await page.keyboard.press('Escape');
      return 'popup: Escape';
    }
    return 'popup: ' + await clickSome(page, rnd, '.djs-popup .entry');
  }
  if (await visible(page, '.djs-direct-editing-parent').count()) {
    const text = rnd.pick(TEXTS);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(text);
    const end = rnd.chance(0.8) ? 'Enter' : 'Escape';
    await page.keyboard.press(end);
    return `edit: "${text.slice(0, 20)}" ${end}`;
  }

  const r = rnd.next();
  if (r < 0.10) {
    const name = await clickSome(page, rnd, '.djs-palette .entry');
    const p = await point(page, rnd);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.mouse.click(p.x, p.y);
    return `palette ${name} at ${Math.round(p.x)},${Math.round(p.y)}`;
  }
  if (r < 0.18) {
    const s = await shape(page, rnd);
    if (!s) return 'click: no shape';
    await page.mouse.click(s.c.x, s.c.y, { modifiers: rnd.chance(0.15) ? ['Shift'] : [] });
    return 'click ' + s.type + ' ' + s.id.slice(0, 8);
  }
  if (r < 0.32) {
    if (!await visible(page, '.djs-context-pad.open .entry').count()) {
      const s = await shape(page, rnd);
      if (!s) return 'pad: no shape';
      await page.mouse.click(s.c.x, s.c.y);
    }
    const name = await clickSome(page, rnd, '.djs-context-pad.open .entry');
    const dragging = await page.evaluate(() => !!window.fpbjs.get('dragging').context());
    if (dragging) {
      const target = rnd.chance(0.7) ? await shape(page, rnd) : null;
      const p = target ? target.c : await point(page, rnd);
      await page.mouse.move(p.x, p.y, { steps: 4 });
      await page.mouse.click(p.x, p.y);
      return `pad ${name} -> ${target ? target.type : 'point'}`;
    }
    return 'pad ' + name;
  }
  if (r < 0.40) {
    const s = await shape(page, rnd);
    if (!s) return 'drag: no shape';
    const dx = rnd.int(300) - 150;
    const dy = rnd.int(300) - 150;
    await page.mouse.move(s.c.x, s.c.y);
    await page.mouse.down();
    await page.mouse.move(s.c.x + dx, s.c.y + dy, { steps: 6 });
    await page.mouse.up();
    return `drag ${s.type} ${s.id.slice(0, 8)} by ${dx},${dy}`;
  }
  if (r < 0.44) {
    const s = await shape(page, rnd);
    if (!s) return 'dblclick: no shape';
    await page.mouse.dblclick(s.c.x, s.c.y);
    return 'dblclick ' + s.type;
  }
  if (r < 0.54) {
    const key = rnd.pick(KEYS);
    if (rnd.chance(0.7)) {
      await page.evaluate(() => window.fpbjs.get('canvas').focus && window.fpbjs.get('canvas').focus());
    }
    await page.keyboard.press(key);
    return 'key ' + key;
  }
  if (r < 0.60) {
    const name = await clickSome(page, rnd, '#layer-container button:not(#openFileButton):not(#saveFileButton)');
    return 'toolbar ' + name;
  }
  if (r < 0.64) {
    const p = await point(page, rnd);
    await page.mouse.click(p.x, p.y);
    return 'canvas click';
  }
  if (r < 0.68) {
    const name = await clickSome(page, rnd, 'nav.fpb-breadcrumbs button, [role=tree] [role=treeitem]');
    return 'layers ' + name;
  }
  if (r < 0.70) {
    const p = await point(page, rnd);
    await page.mouse.move(p.x, p.y);
    if (rnd.chance(0.5)) await page.keyboard.down('Control');
    await page.mouse.wheel(0, rnd.int(600) - 300);
    await page.keyboard.up('Control');
    return 'wheel';
  }
  if (r < 0.74) {
    // drag an end of a flow somewhere
    const info = await page.evaluate((n) => {
      const flows = window.fpbjs.get('elementRegistry').filter((e) => e.waypoints);
      if (!flows.length) return null;
      const flow = flows[n % flows.length];
      const index = n % 2 ? flow.waypoints.length - 1 : 0;
      const from = window.__monkey.screen(flow.waypoints[index]);
      window.fpbjs.get('bendpointMove').start(new MouseEvent('mousedown', { clientX: from.x, clientY: from.y, button: 0 }), flow, index);
      return { from, id: flow.id };
    }, rnd.int(1000));
    if (!info) return 'flow end: no flow';
    const target = await shape(page, rnd);
    const p = target ? target.c : await point(page, rnd);
    await page.mouse.move(info.from.x, info.from.y);
    await page.mouse.move(p.x, p.y, { steps: 6 });
    await page.mouse.up();
    return `flow end ${info.id.slice(0, 8)} -> ${target ? target.type : 'point'}`;
  }
  return api(page, rnd);
}

/** A model operation through the API, as hosts and tests call them */
async function api(page, rnd) {
  const ops = ['decompose', 'compose', 'undo', 'redo', 'switch', 'delete', 'connect', 'reconnect', 'label', 'readOnly', 'language', 'theme', 'copyPaste'];
  const op = rnd.pick(ops);
  const n = rnd.int(100000);
  const text = rnd.pick(TEXTS);
  const result = await page.evaluate(({ op, n, text }) => {
    const get = (s) => window.fpbjs.get(s);
    const root = get('canvas').getRootElement();
    const all = get('elementRegistry').filter((e) => e !== root && e.type !== 'label' && e.businessObject);
    const of = (types) => all.filter((e) => types.includes(e.type));
    const pick = (list) => list.length ? list[n % list.length] : null;
    const modeling = get('modeling');
    switch (op) {
      case 'decompose': {
        const po = pick(of(['fpb:ProcessOperator']));
        if (!po) return 'no operator';
        modeling.decomposeProcessOperator(po);
        return po.id.slice(0, 8);
      }
      case 'compose': {
        const sl = pick(of(['fpb:SystemLimit']));
        if (!sl || !root.businessObject.isDecomposedProcessOperator) return 'top layer';
        modeling.composeProcess(sl);
        return 'composed';
      }
      case 'undo': get('commandStack').undo(); return '';
      case 'redo': get('commandStack').redo(); return '';
      case 'switch': {
        const p = pick(window.__monkey.processes());
        if (!p) return 'no layer';
        modeling.switchProcess(p);
        return p.id.slice(0, 8);
      }
      case 'delete': {
        const e = pick(all);
        if (!e) return 'nothing';
        get('fpbDelete').remove([e]);
        return e.type + ' ' + e.id.slice(0, 8);
      }
      case 'connect': {
        const shapes = all.filter((e) => !e.waypoints);
        if (shapes.length < 2) return 'too few';
        const source = shapes[n % shapes.length];
        const target = shapes[Math.floor(n / 7) % shapes.length];
        const allowed = get('rules').allowed('connection.create', { source, target });
        if (!allowed) return 'not allowed';
        modeling.connect(source, target, typeof allowed === 'object' ? allowed : undefined);
        return source.type + ' -> ' + target.type;
      }
      case 'reconnect': {
        const flows = all.filter((e) => e.waypoints);
        const shapes = all.filter((e) => !e.waypoints);
        if (!flows.length || !shapes.length) return 'none';
        const flow = flows[n % flows.length];
        const other = shapes[Math.floor(n / 3) % shapes.length];
        const end = n % 2 ? 'target' : 'source';
        const source = end === 'source' ? other : flow.source;
        const target = end === 'target' ? other : flow.target;
        if (!get('rules').allowed('connection.reconnect', { connection: flow, source, target, hover: other })) return 'not allowed';
        modeling.reconnect(flow, source, target, { x: other.x + other.width / 2, y: other.y + other.height / 2 }, { docking: end });
        return end + ' -> ' + other.type;
      }
      case 'label': {
        const e = pick(all.filter((x) => !x.waypoints));
        if (!e) return 'none';
        modeling.updateLabel(e, text);
        return e.type;
      }
      case 'readOnly': {
        const ro = get('readOnly', false);
        if (!ro) return 'no service';
        ro.set(!ro.isEnabled());
        return String(ro.isEnabled());
      }
      case 'language': get('fpbI18n').set(n % 2 ? 'de' : 'en'); return n % 2 ? 'de' : 'en';
      case 'theme': { const t = get('fpbTheme', false); if (t) t.choose(n % 2 ? 'dark' : 'light'); return ''; }
      case 'copyPaste': {
        const e = pick(all.filter((x) => !x.waypoints));
        if (!e) return 'none';
        get('selection').select(e);
        get('editorActions').trigger('copy');
        get('editorActions').trigger('paste');
        return e.type;
      }
    }
    return '';
  }, { op, n, text });
  return `api ${op} ${result}`;
}

/** The model as the export dialog writes it, then imported again: the same elements per layer */
async function roundTrip(page) {
  const count = () => page.evaluate(() => {
    window.fpbjs.get('eventBus').fire('dataStore.updateAll', {});
    return (window.fpbjs.getProcesses() || []).filter((e) => e.process)
      .map((e) => e.process.id.slice(0, 8) + ':' + (e.elementDataInformation || []).map((d) => d.$type + '/' + d.id).sort().join(','))
      .sort();
  });
  if (await visible(page, 'dialog[open]').count()) return null;
  const readOnly = await page.evaluate(() => { const r = window.fpbjs.get('readOnly', false); return r ? r.isEnabled() : false; });
  const before = await count();
  if (!before.length) return null;
  await page.locator('#exportButton').click();
  const dialog = page.locator('dialog.fpb-export-dialog[open]');
  await dialog.locator('#exportFormat-json').check();
  await dialog.locator('#exportScope-model').check();
  await dialog.locator('#exportLayout').setChecked(true);
  const waiting = page.waitForEvent('download', { timeout: 15000 });
  await dialog.locator('[data-answer="export"]').click();
  const file = await (await waiting).path();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (readOnly) return null;
  const errors = await page.evaluate((d) => new Promise((resolve) => {
    const bus = window.fpbjs.get('eventBus');
    const failed = [];
    const onError = (e) => failed.push((e && e.message) || 'import.error');
    bus.on('import.error', onError);
    bus.once('import.done', () => { bus.off('import.error', onError); resolve(failed); });
    bus.fire('FPBJS.import', { data: d });
    setTimeout(() => resolve(failed.concat(['no import.done'])), 8000);
  }), data);
  await page.waitForTimeout(300);
  const after = await count();
  if (errors.length) return 'round trip: import failed: ' + errors.join('; ');
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    return 'round trip changed the model:\n  before ' + before.join('\n         ') + '\n  after  ' + after.join('\n         ');
  }
  return null;
}

test.describe('Monkey', () => {
  test.skip(!ON, 'MONKEY=1 to run');
  test.setTimeout(20 * 60 * 1000);

  for (const seed of SEEDS) {
    test('seed ' + seed, async ({ page }) => {
      const pageErrors = [];
      const consoleErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e && (e.stack || e.message) || e)));
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('dialog', (d) => d.dismiss().catch(() => {}));
      await page.setViewportSize({ width: 1500, height: 950 });

      const rnd = random(seed);
      const importer = new ImportPage(page);
      await importer.goto();
      const start = seed % 3;
      if (start === 0) {
        await importer.import(JSON.parse(JSON.stringify(basis)));
      } else if (start === 1) {
        await page.evaluate(async (t) => {
          const done = new Promise((resolve) => { window.fpbjs.get('eventBus').once('import.done', resolve); setTimeout(resolve, 8000); });
          await window.fpbjs.get('amlSupport').importAml(t, { fileName: 'Showcase-A.aml' });
          await done;
        }, EXAMPLE);
      } else {
        await page.evaluate(() => window.fpbjs.newModel());
      }
      await install(page);
      await helpers(page);

      const log = [`start ${['temperieren', 'Showcase A', 'empty'][start]}`];
      const fail = async (what) => {
        const shot = test.info().outputPath('seed-' + seed + '.png');
        await page.screenshot({ path: shot }).catch(() => {});
        const dump = await page.evaluate(() => {
          const get = (n) => window.fpbjs.get(n);
          const cs = get('commandStack');
          const box = (e) => e && [Math.round(e.x), Math.round(e.y), Math.round(e.width), Math.round(e.height)].join(',');
          return {
            commands: cs._stack.slice(Math.max(0, cs._stackIdx - 6), cs._stackIdx + 1).map((a) => a.command),
            layers: window.__monkey.processes().map((p) => {
              const sl = window.__lr.sl(p);
              const items = (sl && sl.businessObject.elementsContainer) || [];
              return p.id.slice(0, 8) + ' sl ' + box(sl) + ' | ' + items.filter((e) => /Product|Energy|Information/.test(e.type))
                .map((e) => e.id.slice(0, 8) + '@' + box(e)).join(' ');
            })
          };
        }).catch((e) => ({ error: String(e) }));
        throw new Error(`seed ${seed}: ${what}\nlast steps:\n  ${log.slice(TRACE ? -60 : -25).join('\n  ')}\nstate: ${JSON.stringify(dump, null, 1)}`);
      };

      for (let i = 1; i <= STEPS; i++) {
        let did;
        try {
          did = await step(page, rnd);
        } catch (e) {
          const message = String(e.message || e);
          // an exception inside the app (an API call threw) is a finding;
          // a target that went away under the mouse is not
          if (/page\.evaluate: /.test(message)) {
            log.push(i + ': threw');
            await fail('the app threw: ' + message.split('\n').slice(0, 6).join('\n'));
          }
          did = 'skipped (' + message.split('\n')[0].slice(0, 80) + ')';
        }
        log.push(i + ': ' + did);
        await page.waitForTimeout(80);
        if (TRACE && i >= TRACE) {
          log.push('   ' + await page.evaluate(() => {
            const root = window.fpbjs.get('canvas').getRootElement();
            const project = window.fpbjs.getProjectDefinition && window.fpbjs.getProjectDefinition();
            const sls = window.fpbjs.get('elementRegistry').filter((e) => e.type === 'fpb:SystemLimit').map((e) => e.id.slice(0, 8));
            const bo = root.businessObject || {};
            return 'root ' + String(root.id).slice(0, 8) + ' entry ' + (project && project.entryPoint ? project.entryPoint.id.slice(0, 8) : '-')
              + ' sl ' + sls.join(',') + ' states ' + (bo.consistsOfStates || []).length + ' sub ' + (bo.consistsOfProcesses || []).map((p) => p.id.slice(0, 8)).join(',')
              + ' store ' + (window.fpbjs.getProcesses() || []).filter((e) => e.process).map((e) => e.process.id.slice(0, 8)).join(',');
          }).catch((e) => 'trace failed ' + e.message));
        }

        if (pageErrors.length) await fail('page error: ' + pageErrors.join('\n'));
        if (consoleErrors.length) await fail('console error: ' + consoleErrors.join('\n'));
        const issues = await page.evaluate(() => {
          // the check walks the layers from the project: an empty model has none yet
          const project = window.fpbjs.getProjectDefinition && window.fpbjs.getProjectDefinition();
          if (!project || !project.entryPoint) return [];
          try {
            return window.__lr.issues();
          } catch (e) {
            return ['issues() threw: ' + e.message];
          }
        });
        if (issues.length) await fail('layers inconsistent: ' + issues.join('; '));

        if (i % 30 === 0) {
          let problem;
          try {
            problem = await roundTrip(page);
          } catch (e) {
            problem = null;
            log.push(i + ': round trip skipped (' + String(e.message || e).split('\n')[0].slice(0, 80) + ')');
          }
          if (problem) await fail(problem);
          log.push(i + ': round trip');
        }
      }
      expect(pageErrors).toEqual([]);
    });
  }
});
