// tests/unit/autosave/Autosave.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import Autosave from '../../../app/fpb/autosave/Autosave.js';

/**
 * Sicherung im Browser: aus, solange der Host sie nicht einschaltet; eine
 * gefundene Sicherung wartet auf die Entscheidung und wird bis dahin nicht
 * überschrieben; "ungespeichert" heißt verschieden vom letzten Datei-Stand.
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

const KEY = 'fpbjs.autosave';
const gespeichert = () => JSON.parse(window.localStorage.getItem(KEY));

describe('Autosave', () => {

  beforeEach(() => {
    window.localStorage.clear();
  });

  // Jede Instanz hängt am Fenster (beforeunload), sonst warnt die vorige mit
  afterEach(() => {
    busse.splice(0).forEach((b) => b.fire('diagram.destroy'));
  });

  it('ist ohne Einstellung aus und schreibt nichts', () => {
    const eventBus = bus();
    const processes = [{ process: { id: 'p1' } }];
    const autosave = new Autosave(eventBus, modeler(processes), undefined);

    eventBus.fire('commandStack.changed');
    autosave.flush();

    expect(autosave.isEnabled()).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('sichert nach einer Änderung und meldet sie als ungespeichert', () => {
    const eventBus = bus();
    const processes = [];
    const autosave = new Autosave(eventBus, modeler(processes), true);

    processes.push({ process: { id: 'p1', name: 'Neu' } });
    autosave.flush();

    expect(gespeichert().model).toEqual([{ process: { id: 'p1', name: 'Neu' } }]);
    expect(autosave.isDirty()).toBe(true);
  });

  it('wartet mit einer gefundenen Sicherung auf die Entscheidung und überschreibt sie nicht', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: '2026-09-25T10:00:00Z', model: [{ alt: true }] }));
    const eventBus = bus();
    const processes = [];
    const autosave = new Autosave(eventBus, modeler(processes), true);

    expect(autosave.getPending()).toEqual({ savedAt: '2026-09-25T10:00:00Z', model: [{ alt: true }] });

    processes.push({ neu: true });
    autosave.flush();
    expect(gespeichert().model).toEqual([{ alt: true }]);
  });

  it('Wiederherstellen importiert die Sicherung, danach gilt sie als ungespeichert', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: 'x', model: [{ alt: true }] }));
    const eventBus = bus();
    const processes = [];
    const autosave = new Autosave(eventBus, modeler(processes), true);

    autosave.restore();
    const importiert = eventBus.fired.find((f) => f.name === 'FPBJS.import');
    expect(importiert.data.data).toEqual([{ alt: true }]);

    // der Importer füllt das Modell und meldet sich fertig
    processes.push({ alt: true });
    eventBus.fire('import.done');

    expect(autosave.getPending()).toBeNull();
    expect(autosave.isDirty()).toBe(true);
  });

  it('Verwerfen ersetzt die Sicherung durch den aktuellen Stand', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: 'x', model: [{ alt: true }] }));
    const eventBus = bus();
    const processes = [];
    const autosave = new Autosave(eventBus, modeler(processes), true);

    autosave.discard();
    expect(window.localStorage.getItem(KEY)).toBeNull();

    processes.push({ neu: true });
    autosave.flush();
    expect(gespeichert().model).toEqual([{ neu: true }]);
  });

  it('eine importierte oder heruntergeladene Datei gilt als gespeichert', () => {
    const eventBus = bus();
    const processes = [];
    const autosave = new Autosave(eventBus, modeler(processes), true);

    processes.push({ datei: true });
    eventBus.fire('import.done');
    expect(autosave.isDirty()).toBe(false);
    expect(gespeichert().model).toEqual([{ datei: true }]);

    processes.push({ dazu: true });
    autosave.flush();
    expect(autosave.isDirty()).toBe(true);

    eventBus.fire('model.downloaded');
    expect(autosave.isDirty()).toBe(false);
  });

  it('ein neues Modell löscht die Sicherung', () => {
    const eventBus = bus();
    const processes = [{ alt: true }];
    const autosave = new Autosave(eventBus, modeler(processes), true);
    autosave.flush();
    expect(window.localStorage.getItem(KEY)).not.toBeNull();

    processes.length = 0;
    eventBus.fire('model.new');

    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(autosave.isDirty()).toBe(false);
  });

  it('warnt beim Verlassen nur mit ungespeicherten Änderungen', () => {
    const eventBus = bus();
    const processes = [];
    new Autosave(eventBus, modeler(processes), true);

    const verlassen = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(verlassen()).toBe(false);
    processes.push({ neu: true });
    expect(verlassen()).toBe(true);
    eventBus.fire('model.downloaded');
    expect(verlassen()).toBe(false);
  });

  it('eine unlesbare Sicherung zählt als keine', () => {
    window.localStorage.setItem(KEY, '{kaputt');
    const autosave = new Autosave(bus(), modeler([]), { storageKey: KEY });

    expect(autosave.isEnabled()).toBe(true);
    expect(autosave.getPending()).toBeNull();
  });
});
