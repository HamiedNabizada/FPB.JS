// tests/unit/autosave/Autosave.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import Autosave from '../../../app/fpb/autosave/Autosave.js';
import { createMemoryStore } from '../../../app/fpb/autosave/BackupStore.js';

/**
 * Sicherung im Browser: aus, solange der Host sie nicht einschaltet; eine
 * Sicherung je Tab; angeboten werden nur Sicherungen von Tabs, die nicht mehr
 * offen sind; gesichert wird nur, was in keiner Datei steht.
 */
const busse = [];

function bus() {
  const handlers = {};
  const fired = [];
  const b = {
    fired,
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    fire(name, data) {
      fired.push({ name, data });
      (handlers[name] || []).forEach((fn) => fn(data || {}));
    }
  };
  busse.push(b);
  return b;
}

function modeler(processes) {
  return { getProcesses: () => processes };
}

/** Nachgestellte Tabs: `offen` sind die Ids der Tabs, die gerade laufen */
function presence(id, offen = []) {
  return {
    id,
    start: () => Promise.resolve(),
    aliveIds: () => Promise.resolve(new Set([id, ...offen])),
    stop: () => {}
  };
}

function sicherung(id, model, savedAt = '2026-09-25T10:00:00Z') {
  return { id, savedAt, title: 'Modell ' + id, model };
}

async function starten({ store = createMemoryStore(), processes = [], id = 'tab-neu', offen = [] } = {}) {
  const eventBus = bus();
  const autosave = new Autosave(eventBus, modeler(processes), { store, presence: presence(id, offen) });
  await autosave.ready();
  return { eventBus, autosave, store, processes };
}

describe('Autosave', () => {

  beforeEach(() => {
    window.localStorage.clear();
  });

  // Jede Instanz hängt am Fenster (beforeunload), sonst warnt die vorige mit
  afterEach(() => {
    busse.splice(0).forEach((b) => b.fire('diagram.destroy'));
  });

  it('ist ohne Einstellung aus und schreibt nichts', async () => {
    const eventBus = bus();
    const store = createMemoryStore();
    const autosave = new Autosave(eventBus, modeler([{ process: { id: 'p1' } }]), undefined);

    eventBus.fire('commandStack.changed');
    await autosave.flush();

    expect(autosave.isEnabled()).toBe(false);
    expect(store.records.size).toBe(0);
  });

  it('sichert eine Änderung unter der Id dieses Tabs', async () => {
    const { autosave, store, processes } = await starten({ id: 'tab-a' });

    processes.push({ neu: true });
    await autosave.flush();

    expect(autosave.isDirty()).toBe(true);
    expect(store.records.get('tab-a').model).toEqual([{ neu: true }]);
  });

  it('zwei Tabs überschreiben sich nicht', async () => {
    const store = createMemoryStore();
    const a = await starten({ store, id: 'tab-a', offen: ['tab-b'] });
    const b = await starten({ store, id: 'tab-b', offen: ['tab-a'] });

    a.processes.push({ modell: 'A' });
    b.processes.push({ modell: 'B' });
    await a.autosave.flush();
    await b.autosave.flush();

    expect(store.records.get('tab-a').model).toEqual([{ modell: 'A' }]);
    expect(store.records.get('tab-b').model).toEqual([{ modell: 'B' }]);
  });

  it('bietet nur Sicherungen von Tabs an, die nicht mehr offen sind, die neueste zuerst', async () => {
    const store = createMemoryStore();
    await store.put(sicherung('geschlossen-alt', [{ x: 1 }], '2026-09-25T09:00:00Z'));
    await store.put(sicherung('geschlossen-neu', [{ x: 2 }], '2026-09-25T11:00:00Z'));
    await store.put(sicherung('noch-offen', [{ x: 3 }]));

    const { autosave } = await starten({ store, offen: ['noch-offen'] });

    expect(autosave.getPending().map((p) => p.id)).toEqual(['geschlossen-neu', 'geschlossen-alt']);
  });

  it('Wiederherstellen lädt die Sicherung; nach dem Import gehört sie diesem Tab', async () => {
    const store = createMemoryStore();
    await store.put(sicherung('alt', [{ alt: true }]));
    const { eventBus, autosave, processes } = await starten({ store, id: 'tab-neu' });

    await autosave.restore('alt');
    const importiert = eventBus.fired.find((f) => f.name === 'FPBJS.import');
    expect(importiert.data.data).toEqual([{ alt: true }]);
    expect(autosave.getPending()).toEqual([]);

    processes.push({ alt: true });
    eventBus.fire('import.done');
    await autosave.flush();

    // wiederhergestellt ist noch in keiner Datei
    expect(autosave.isDirty()).toBe(true);
    expect(store.records.has('alt')).toBe(false);
    expect(store.records.get('tab-neu').model).toEqual([{ alt: true }]);
  });

  it('hat ein anderer Tab die Sicherung schon übernommen, lädt Wiederherstellen nichts doppelt', async () => {
    const store = createMemoryStore();
    await store.put(sicherung('alt', [{ alt: true }]));
    const { eventBus, autosave } = await starten({ store });

    // ein zweiter Tab war schneller
    await store.remove('alt');

    expect(await autosave.restore('alt')).toBe(false);
    expect(eventBus.fired.some((f) => f.name === 'FPBJS.import')).toBe(false);
    expect(autosave.getPending()).toEqual([]);
  });

  it('Verwerfen löscht nur die gewählte Sicherung', async () => {
    const store = createMemoryStore();
    await store.put(sicherung('eins', [{ x: 1 }]));
    await store.put(sicherung('zwei', [{ x: 2 }]));
    const { autosave } = await starten({ store });

    autosave.discard('eins');
    await autosave.flush();

    expect(store.records.has('eins')).toBe(false);
    expect(store.records.has('zwei')).toBe(true);
    expect(autosave.getPending().map((p) => p.id)).toEqual(['zwei']);
  });

  it('eine importierte oder heruntergeladene Datei braucht keine Sicherung', async () => {
    const { eventBus, autosave, store, processes } = await starten({ id: 'tab-a' });

    processes.push({ datei: true });
    eventBus.fire('import.done');
    await autosave.flush();
    expect(autosave.isDirty()).toBe(false);
    expect(store.records.has('tab-a')).toBe(false);

    processes.push({ dazu: true });
    await autosave.flush();
    expect(store.records.get('tab-a').model).toEqual([{ datei: true }, { dazu: true }]);

    eventBus.fire('model.downloaded');
    await autosave.flush();
    expect(autosave.isDirty()).toBe(false);
    expect(store.records.has('tab-a')).toBe(false);
  });

  it('ein neues Modell löscht die Sicherung dieses Tabs', async () => {
    const { eventBus, autosave, store, processes } = await starten({ id: 'tab-a' });
    processes.push({ alt: true });
    await autosave.flush();
    expect(store.records.has('tab-a')).toBe(true);

    processes.length = 0;
    eventBus.fire('model.new');
    await autosave.flush();

    expect(store.records.has('tab-a')).toBe(false);
    expect(autosave.isDirty()).toBe(false);
  });

  it('beim Verlassen: Warnung nur mit ungespeicherten Änderungen, und ein Rettungsstand', async () => {
    const { eventBus, autosave, processes } = await starten({ id: 'tab-a' });

    const verlassen = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(verlassen()).toBe(false);

    // geändert, aber noch nicht gespeichert: das Verlassen legt eine Rettungskopie ab
    processes.push({ neu: true });
    expect(verlassen()).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('fpbjs.autosave.rescue.tab-a')).model).toEqual([{ neu: true }]);

    eventBus.fire('model.downloaded');
    await autosave.flush();
    expect(verlassen()).toBe(false);
  });

  it('der nächste Start übernimmt Rettungskopien in den Speicher und bietet sie an', async () => {
    window.localStorage.setItem('fpbjs.autosave.rescue.weg', JSON.stringify(sicherung('weg', [{ gerettet: true }])));
    const store = createMemoryStore();

    const { autosave } = await starten({ store });

    expect(store.records.get('weg').model).toEqual([{ gerettet: true }]);
    expect(window.localStorage.getItem('fpbjs.autosave.rescue.weg')).toBeNull();
    expect(autosave.getPending().map((p) => p.id)).toEqual(['weg']);
  });

  it('Rettungskopien offener Tabs bleiben liegen, das nächste Speichern räumt sie ab', async () => {
    window.localStorage.setItem('fpbjs.autosave.rescue.offen', JSON.stringify(sicherung('offen', [{ alt: true }])));
    const store = createMemoryStore();

    // ein anderer Tab startet, "offen" läuft noch (Verlassen abgebrochen)
    await starten({ store, id: 'fremd', offen: ['offen'] });
    expect(store.records.has('offen')).toBe(false);
    expect(window.localStorage.getItem('fpbjs.autosave.rescue.offen')).not.toBeNull();

    // der Tab selbst speichert wieder regulär
    const { autosave, processes } = await starten({ store, id: 'offen' });
    processes.push({ neu: true });
    await autosave.flush();
    expect(window.localStorage.getItem('fpbjs.autosave.rescue.offen')).toBeNull();
  });

  it('meldet, wenn der Browser das Speichern verweigert', async () => {
    const store = createMemoryStore();
    store.put = () => Promise.reject(new Error('QuotaExceededError'));
    const { eventBus, autosave, processes } = await starten({ store });

    processes.push({ gross: true });
    await autosave.flush();

    expect(eventBus.fired.some((f) => f.name === 'autosave.failed')).toBe(true);
  });

  it('behält höchstens zehn Sicherungen geschlossener Tabs', async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 12; i++) {
      await store.put(sicherung('t' + i, [{ i }], '2026-09-25T10:' + String(i).padStart(2, '0') + ':00Z'));
    }

    const { autosave } = await starten({ store });

    expect(autosave.getPending()).toHaveLength(10);
    expect(store.records.has('t0')).toBe(false);
    expect(store.records.has('t1')).toBe(false);
    expect(store.records.has('t11')).toBe(true);
  });
});
