// tests/unit/modeling/DataBehavior.test.js
import { describe, it, expect } from 'vitest';

import DataBehavior from '../../../app/fpb/modeling/behavior/DataBehavior.js';

/** Minimaler Event-Bus: on und fire, Priorität wird ignoriert */
function eventBus() {
  const listeners = {};
  return {
    on: (types, prioOderFn, fn) => {
      const handler = typeof prioOderFn === 'function' ? prioOderFn : fn;
      [].concat(types).forEach((t) => { (listeners[t] = listeners[t] || []).push(handler); });
    },
    fire: (type, event) => (listeners[type] || []).forEach((fn) => fn(event || {})),
  };
}

/** Prozess-Eintrag wie im Datenspeicher: { process: businessObject, ... } */
const eintrag = (id, kinder = []) => ({
  process: { id, consistsOfProcesses: kinder.map((k) => ({ id: k })) },
  elementDataInformation: [],
  elementVisualInformation: [],
});

function aufbauen(eintraege) {
  const bus = eventBus();
  const speicher = [{ $type: 'fpb:Project', entryPoint: 'p0' }, ...eintraege];
  // eslint-disable-next-line no-new
  new DataBehavior(bus, { getProcesses: () => speicher });
  return { bus, speicher };
}

const ids = (speicher) => speicher.filter((e) => e.process).map((e) => e.process.id);

describe('DataBehavior: Löschen eines Prozesses', () => {

  it('entfernt einen Prozess samt allen verschachtelten Unterprozessen', () => {
    // p1 hat p2 und p3, p2 hat p4: drei Ebenen
    const { bus, speicher } = aufbauen([
      eintrag('p0', ['p1']),
      eintrag('p1', ['p2', 'p3']),
      eintrag('p2', ['p4']),
      eintrag('p3'),
      eintrag('p4'),
    ]);

    bus.fire('dataStore.processDeleted', { deletedProcess: { businessObject: { id: 'p1' } } });

    expect(ids(speicher)).toEqual(['p0']);
  });

  it('lässt die Projektdefinition und fremde Prozesse stehen', () => {
    const { bus, speicher } = aufbauen([eintrag('a', ['b']), eintrag('b'), eintrag('c')]);

    bus.fire('dataStore.processDeleted', { deletedProcess: { businessObject: { id: 'a' } } });

    expect(ids(speicher)).toEqual(['c']);
    expect(speicher[0].$type).toBe('fpb:Project');
  });

  it('entfernt auch einen doppelt eingetragenen Prozess vollständig', () => {
    // Ein Eintrag direkt hinter einem gelöschten wurde beim Löschen während
    // des Durchlaufs übersprungen; mit zwei gleichen Einträgen blieb einer übrig.
    const { bus, speicher } = aufbauen([eintrag('x'), eintrag('x'), eintrag('y')]);

    bus.fire('dataStore.processDeleted', { deletedProcess: { businessObject: { id: 'x' } } });

    expect(ids(speicher)).toEqual(['y']);
  });
});
