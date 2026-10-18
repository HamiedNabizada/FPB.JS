// tests/unit/aml/AmlSupport.test.js
import { describe, it, expect, vi } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';

// the real bus: the order of the listeners (priorities) is what counts here
vi.unmock('diagram-js/lib/core/EventBus');

import AmlSupport from '../../../app/fpb/aml/AmlSupport.js';

/**
 * The kept AML file follows the model: an import replaces it, but only an
 * import that goes through. The importer refuses invalid content while
 * FPBJS.import runs (import.error) and keeps the model it had (B15).
 */
const datei = (name) => ({ text: '<CAEXFile/>', fileName: name + '.aml', hierarchyId: null, hierarchyName: null });

function aufbauen() {
  const eventBus = new EventBus();
  const aml = new AmlSupport(eventBus, {});
  // nachgestellter Importer: lehnt ab, solange `ablehnen` gesetzt ist
  const importer = { ablehnen: false };
  eventBus.on('FPBJS.import', () => {
    if (importer.ablehnen) {
      eventBus.fire('import.error', { message: 'Invalid import data structure' });
    } else {
      eventBus.fire('import.done', {});
    }
  });
  return { eventBus, aml, importer };
}

describe('AmlSupport', () => {

  it('an AML import keeps its file, an ordinary import drops it', () => {
    const { eventBus, aml } = aufbauen();
    const anlage = datei('Anlage');

    eventBus.fire('FPBJS.import', { data: [], amlSource: anlage });
    expect(aml.getSource()).toBe(anlage);

    eventBus.fire('FPBJS.import', { data: [] });
    expect(aml.getSource()).toBe(null);
  });

  it('a refused import keeps the file of the model that stays', () => {
    const { eventBus, aml, importer } = aufbauen();
    const anlage = datei('Anlage');
    eventBus.fire('FPBJS.import', { data: [], amlSource: anlage });

    importer.ablehnen = true;
    eventBus.fire('FPBJS.import', { data: [{ kaputt: true }] });
    expect(aml.getSource()).toBe(anlage);

    eventBus.fire('FPBJS.import', { data: [{ kaputt: true }], amlSource: datei('Andere') });
    expect(aml.getSource()).toBe(anlage);
  });

  it('tells the panels when a refused import brings the old file back', () => {
    const { eventBus, aml, importer } = aufbauen();
    const anlage = datei('Anlage');
    eventBus.fire('FPBJS.import', { data: [], amlSource: anlage });

    const gemeldet = [];
    eventBus.on('aml.sourceChanged', (event) => gemeldet.push(event.source));
    importer.ablehnen = true;
    eventBus.fire('FPBJS.import', { data: [{ kaputt: true }] });

    expect(gemeldet[gemeldet.length - 1]).toBe(anlage);
    expect(aml.getSource()).toBe(anlage);
  });
});
