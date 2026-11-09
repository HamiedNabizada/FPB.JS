// tests/unit/changes/Changes.test.js
import { describe, it, expect, beforeEach } from 'vitest';

import Changes from '../../../app/fpb/changes/Changes.js';

/** An event bus with priorities, as diagram-js orders its listeners (the test setup mocks the real one) */
function createBus() {
  const handlers = {};
  return {
    on(name, priority, fn) {
      if (typeof priority === 'function') {
        fn = priority;
        priority = 1000;
      }
      const list = handlers[name] = handlers[name] || [];
      list.push({ priority, fn });
      list.sort((a, b) => b.priority - a.priority);
    },
    fire(name, data) {
      (handlers[name] || []).slice().forEach((h) => h.fn(data || {}));
    }
  };
}

/**
 * fpbChanges (032a V4, V5): model.changed after an edit that changes the
 * content, model.dirtyChanged when the unsaved state flips; layer switches and
 * imports are no edits.
 */

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

let bus;
let processes;
let importer;
let changes;
let seen;

beforeEach(() => {
  bus = createBus();
  processes = [];
  importer = { run: 0, busy: false, getLastRun() { return this.run; }, isBusy() { return this.busy; } };
  changes = new Changes(bus, { getProcesses: () => processes }, { get: (name) => (name === 'jsonImporter' ? importer : null) });
  seen = { changed: 0, dirty: [] };
  bus.on('model.changed', () => { seen.changed++; });
  bus.on('model.dirtyChanged', (e) => { seen.dirty.push(e.dirty); });
});

/** An import of `data` that goes through, as the importer runs it */
function importModel(data, extra = {}) {
  importer.run++;
  bus.fire('FPBJS.import', { data, ...extra });
  processes.splice(0, processes.length, ...data);
  bus.fire('import.done', { run: importer.run });
}

describe('fpbChanges', () => {

  it('no change after a layer switch (same content)', async () => {
    importModel([{ name: 'A' }]);
    bus.fire('commandStack.changed', { trigger: 'execute' });
    bus.fire('commandStack.changed', { trigger: 'clear' });
    await tick();

    expect(seen.changed).toBe(0);
    expect(changes.isDirty()).toBe(false);
  });

  it('one model.changed for several commands in one task', async () => {
    importModel([{ name: 'A' }]);
    processes[0].name = 'B';
    bus.fire('commandStack.changed', { trigger: 'execute' });
    bus.fire('commandStack.changed', { trigger: 'execute' });
    bus.fire('commandStack.changed', { trigger: 'clear' });
    await tick();

    expect(seen.changed).toBe(1);
    expect(seen.dirty).toEqual([true]);
  });

  it('dirty after an edit and clean again after undoing to the saved content', async () => {
    importModel([{ name: 'A' }]);
    processes[0].name = 'B';
    expect(changes.isDirty()).toBe(true);

    processes[0].name = 'A';
    bus.fire('commandStack.changed', { trigger: 'undo' });
    await tick();

    expect(changes.isDirty()).toBe(false);
    expect(seen.dirty).toEqual([true, false]);
    expect(seen.changed).toBe(2);
  });

  it('markSaved fires model.downloaded with the baseline', () => {
    const downloaded = [];
    bus.on('model.downloaded', (e) => { downloaded.push(e); });
    importModel([{ name: 'A' }]);
    processes[0].name = 'B';
    expect(changes.isDirty()).toBe(true);

    changes.markSaved();

    expect(downloaded).toHaveLength(1);
    expect(downloaded[0].format).toBe(null);
    expect(downloaded[0].baseline).toContain('"B"');
    expect(changes.isDirty()).toBe(false);
  });

  it('a restored import stays dirty', () => {
    importModel([{ name: 'A' }], { restored: true });

    expect(changes.isDirty()).toBe(true);
  });

  it('nothing is compared between FPBJS.import and import.done', async () => {
    importModel([{ name: 'A' }]);
    importer.run++;
    bus.fire('FPBJS.import', { data: [] });
    processes[0].name = 'during the import';
    bus.fire('commandStack.changed', { trigger: 'clear' });
    await tick();
    expect(seen.changed).toBe(0);

    bus.fire('import.done', { run: importer.run });
    await tick();

    expect(seen.changed).toBe(0);
    expect(changes.isDirty()).toBe(false);
  });

  it('a refused import leaves the state as it was', async () => {
    importModel([{ name: 'A' }]);
    processes[0].name = 'B';
    expect(changes.isDirty()).toBe(true);

    importer.run++;
    bus.fire('FPBJS.import', { data: {} });
    bus.fire('import.error', { message: 'Broken', run: importer.run });
    processes[0].name = 'C';
    bus.fire('commandStack.changed', { trigger: 'execute' });
    await tick();

    // B (seen by isDirty) and C after the refused import
    expect(seen.changed).toBe(2);
    expect(changes.isDirty()).toBe(true);
  });

  it('is clean on the empty start and after New model', () => {
    expect(changes.isDirty()).toBe(false);
    importModel([{ name: 'A' }]);
    processes[0].name = 'B';
    processes.length = 0;
    bus.fire('model.new', {});

    expect(changes.isDirty()).toBe(false);
  });

});
