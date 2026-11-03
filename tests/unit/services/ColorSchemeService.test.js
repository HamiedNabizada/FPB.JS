// tests/unit/services/ColorSchemeService.test.js
import { describe, it, expect, vi } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';

// the real bus: the events each modeler gets are what counts here
vi.unmock('diagram-js/lib/core/EventBus');

import ColorSchemeService from '../../../app/fpb/services/ColorSchemeService.js';

/**
 * The colour scheme holds for the whole page (data-colors on the document):
 * a second modeler on the page follows when the first switches it, redraws
 * and tells its own toolbar (016g E4).
 */

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function build() {
  const eventBus = new EventBus();
  const events = [];
  eventBus.on('colorScheme.changed', (event) => {
    events.push(event.scheme);
  });
  const service = new ColorSchemeService(eventBus, { filter: () => [] });
  return { eventBus, service, events };
}

describe('ColorSchemeService', () => {

  it('a second modeler on the page follows when the first switches the scheme', async () => {
    const a = build();
    a.service.set('standard', { silent: true });
    const b = build();
    await tick();
    a.events.length = 0;
    b.events.length = 0;

    a.service.set('accessible');
    await tick();
    expect(a.events).toEqual(['accessible']);
    expect(b.events).toEqual(['accessible']);

    b.service.set('standard');
    await tick();
    expect(a.events).toEqual(['accessible', 'standard']);
    expect(b.events).toEqual(['accessible', 'standard']);
  });
});
