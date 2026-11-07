// tests/unit/export/renderLayers.test.js
import { describe, it, expect } from 'vitest';

import { renderLayers } from '../../../app/fpb/export/renderLayers.js';

/**
 * Der Durchlauf über alle Ebenen, den Download-Dialog und API gemeinsam
 * nutzen. Die API-Fassung hatte früher eine eigene Kopie ohne Schutz der
 * Undo-Historie und ohne sichere Rückkehr zur Ausgangsebene.
 */
function modeler(startRoot, translate) {
  const log = { switches: [], keepHistory: 0 };
  let root = startRoot;
  const dienste = {
    modeling: { switchProcess: (p, hints) => { log.switches.push({ id: p.id, hints }); root = p; } },
    canvas: { getRootElement: () => root },
    layerUndoBoundary: { keepHistory: async (work) => { log.keepHistory++; return work(); } },
    translate,
  };
  return { log, modeler: { get: (name) => dienste[name] } };
}

// a layer below the top one: named after its decomposed operator
const ebene = (id, name) => ({ id, businessObject: { isDecomposedProcessOperator: { name } } });

describe('renderLayers', () => {

  it('zeichnet jede Ebene und kehrt zur Ausgangsebene zurück', async () => {
    const start = ebene('p0', 'Start');
    const { log, modeler: m } = modeler(start);
    const ebenen = [ebene('p1', 'Eins'), ebene('p2', 'Zwei')];

    const ergebnis = await renderLayers(m, ebenen, async () => 'bild-' + m.get('canvas').getRootElement().id);

    expect(ergebnis).toEqual([{ name: 'Eins', image: 'bild-p1' }, { name: 'Zwei', image: 'bild-p2' }]);
    expect(log.switches.map((s) => s.id)).toEqual(['p1', 'p2', 'p0']);
  });

  it('schaltet nur vorübergehend und lässt die Historie stehen', async () => {
    const { log, modeler: m } = modeler(ebene('p0'));

    await renderLayers(m, [ebene('p1')], async () => 'bild');

    expect(log.keepHistory).toBe(1);
    expect(log.switches.every((s) => s.hints && s.hints.fpbTransient)).toBe(true);
  });

  it('kehrt auch zurück, wenn eine Ebene scheitert', async () => {
    const { log, modeler: m } = modeler(ebene('p0'));

    await expect(renderLayers(m, [ebene('p1'), ebene('p2')], async () => {
      throw new Error('kaputt');
    })).rejects.toThrow('kaputt');

    expect(log.switches[log.switches.length - 1].id).toBe('p0');
  });

  it('benennt Ebenen wie Ebenen und Brotkrumen: oben das Projekt, darunter den Operator', async () => {
    // Testrunde 2026-11-07: der Seitentitel im PDF zeigte die ID der obersten Ebene
    const projekt = { $instanceOf: (type) => type === 'fpb:Project', name: 'Kaffee kochen' };
    const oben = { id: 'b2c7e0f4-uuid', businessObject: { parent: projekt } };
    const { modeler: m } = modeler(oben, (text) => (text === 'unnamed' ? 'unbenannt' : text));

    const ergebnis = await renderLayers(m, [oben, ebene('p2', 'Mahlen'), ebene('p3')], async () => 'bild');

    expect(ergebnis.map((l) => l.name)).toEqual(['Kaffee kochen', 'Mahlen', 'unbenannt']);
  });
});
