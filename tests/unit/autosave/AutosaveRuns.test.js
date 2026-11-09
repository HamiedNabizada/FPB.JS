// tests/unit/autosave/AutosaveRuns.test.js
import { describe, it, expect } from 'vitest';

import Changes from '../../../app/fpb/changes/Changes.js';
import Autosave from '../../../app/fpb/autosave/Autosave.js';

/**
 * Restoring a backup is an import run like any other (032a, final review I1):
 * when a newer import replaces the model before the restore is done, the
 * restore never shows; its backup stays on offer. When a newer import is
 * refused, the restore finishes and its backup leaves the store. The browser
 * backup and fpbChanges agree on the unsaved state either way.
 */

function createBus() {
  const handlers = {};
  return {
    on(name, priority, fn) {
      if (typeof priority === 'function') {
        fn = priority;
        priority = 1000;
      }
      [].concat(name).forEach((n) => {
        const list = handlers[n] = handlers[n] || [];
        list.push({ priority, fn });
        list.sort((a, b) => b.priority - a.priority);
      });
    },
    fire(name, data) {
      (handlers[name] || []).slice().forEach((h) => h.fn(data || {}));
    }
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

/** Changes and Autosave with a stand-in importer that counts runs like JSONImporter */
function setup() {
  const bus = createBus();
  const processes = [];
  const fpbjs = { getProcesses: () => processes };
  const importer = {
    run: 0,
    open: new Set(),
    plan: [],
    getLastRun() { return this.run; },
    isBusy() { return this.open.size > 0; }
  };
  const injector = { get: (name) => (name === 'jsonImporter' ? importer : null) };
  bus.on('FPBJS.import', 1000, (event) => {
    const run = ++importer.run;
    if ((importer.plan.shift() || 'accept') === 'refuse') {
      bus.fire('import.error', { message: 'refused', run });
      return;
    }
    processes.splice(0, processes.length, ...event.data);
    importer.open.clear();
    importer.open.add(run);
  });
  const done = (run) => {
    importer.open.delete(run);
    bus.fire('import.done', { run });
  };
  const removed = [];
  const store = {
    list: () => Promise.resolve([{ id: 'old', savedAt: '2026-11-01', title: 'Backup', model: [{ name: 'Backup' }] }]),
    get: () => Promise.resolve({ id: 'old', model: [{ name: 'Backup' }] }),
    remove: (id) => {
      removed.push(id);
      return Promise.resolve();
    },
    put: () => Promise.resolve()
  };
  const presence = { id: 'me', start: () => Promise.resolve(), aliveIds: () => Promise.resolve(new Set(['me'])), stop() {} };
  const changes = new Changes(bus, fpbjs, injector);
  const autosave = new Autosave(bus, fpbjs, { store, presence, delay: 5 }, injector);
  const state = () => ({
    changesDirty: changes.isDirty(),
    autosaveDirty: autosave.isDirty(),
    removed: removed.slice(),
    pending: autosave.getPending().map((entry) => entry.id)
  });
  return { bus, importer, done, autosave, state };
}

describe('Autosave and import runs', () => {

  it('a restore on its own: the backup leaves the store, the model stays unsaved', async () => {
    const s = setup();
    await s.autosave.ready();
    await s.autosave.restore('old');
    s.done(1);
    await tick();

    expect(s.state()).toEqual({ changesDirty: true, autosaveDirty: true, removed: ['old'], pending: [] });
  });

  it('a restore that a newer import replaces keeps its backup on offer', async () => {
    const s = setup();
    await s.autosave.ready();
    await s.autosave.restore('old');
    s.bus.fire('FPBJS.import', { data: [{ name: 'Dropped' }] });
    s.done(2);
    await tick();

    expect(s.state()).toEqual({ changesDirty: false, autosaveDirty: false, removed: [], pending: ['old'] });
  });

  it('a restore and a refused newer import: the restore finishes', async () => {
    const s = setup();
    await s.autosave.ready();
    await s.autosave.restore('old');
    s.importer.plan.push('refuse');
    s.bus.fire('FPBJS.import', { data: {} });
    s.done(1);
    await tick();

    expect(s.state()).toEqual({ changesDirty: true, autosaveDirty: true, removed: ['old'], pending: [] });
  });

  it('a refused restore is offered again', async () => {
    const s = setup();
    await s.autosave.ready();
    s.importer.plan.push('refuse');
    expect(await s.autosave.restore('old')).toBe(false);
    await tick();

    expect(s.state().pending).toEqual(['old']);
    expect(s.state().removed).toEqual([]);
  });
});
