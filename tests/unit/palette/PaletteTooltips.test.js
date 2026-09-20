// tests/unit/palette/PaletteTooltips.test.js
import { describe, it, expect, beforeEach } from 'vitest';

import PaletteTooltips from '../../../app/fpb/palette/PaletteTooltips.js';

/** Minimaler Event-Bus: nur on und fire */
function eventBus() {
  const listeners = {};
  return {
    on: (types, fn) => [].concat(types).forEach((t) => { (listeners[t] = listeners[t] || []).push(fn); }),
    fire: (type) => (listeners[type] || []).forEach((fn) => fn({})),
  };
}

/** Palette so, wie diagram-js 15 sie rendert: aria-label, kein title */
function palette(eintraege) {
  const container = document.createElement('div');
  eintraege.forEach(({ aktion, label }) => {
    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.setAttribute('data-action', aktion);
    if (label) {
      entry.setAttribute('aria-label', label);
    }
    container.appendChild(entry);
  });
  return { _container: container };
}

describe('PaletteTooltips', () => {

  let bus;

  beforeEach(() => {
    bus = eventBus();
  });

  const titel = (p) => [...p._container.querySelectorAll('.entry')].map((e) => e.getAttribute('title'));

  it('macht aus der Beschriftung ein Tooltip', () => {
    const p = palette([{ aktion: 'fpb-product', label: 'Add Product' }, { aktion: 'hand-tool', label: 'Activate the hand tool' }]);
    new PaletteTooltips(bus, p);

    bus.fire('canvas.init');

    expect(titel(p)).toEqual(['Add Product', 'Activate the hand tool']);
  });

  it('zieht auch nachgerenderte Einträge nach', () => {
    const p = palette([{ aktion: 'fpb-product', label: 'Add Product' }]);
    new PaletteTooltips(bus, p);
    bus.fire('canvas.init');

    const neu = document.createElement('div');
    neu.className = 'entry';
    neu.setAttribute('aria-label', 'Add Energy');
    p._container.appendChild(neu);
    bus.fire('palette.changed');

    expect(titel(p)).toEqual(['Add Product', 'Add Energy']);
  });

  it('überschreibt kein vorhandenes Tooltip und stolpert nicht über Trenner', () => {
    const p = palette([{ aktion: 'fpb-product', label: 'Add Product' }, { aktion: 'trenner', label: null }]);
    p._container.querySelector('.entry').setAttribute('title', 'Eigener Text');
    new PaletteTooltips(bus, p);

    bus.fire('canvas.init');

    expect(titel(p)).toEqual(['Eigener Text', null]);
  });

  it('kommt ohne gerenderte Palette zurecht', () => {
    const tooltips = new PaletteTooltips(bus, {});
    expect(() => bus.fire('canvas.init')).not.toThrow();
    expect(tooltips).toBeDefined();
  });
});
