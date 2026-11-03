// tests/unit/sheets/Sheets.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';

// the real bus: the order of the events is what counts here
vi.unmock('diagram-js/lib/core/EventBus');

import Sheets from '../../../app/fpb/sheets/Sheets.js';

/**
 * One sheet from the bottom at a time on narrow touch screens (016f E2,
 * V8, V9, T7): only with a container from the host and while the media
 * query matches.
 */

let media;

/** The screen as a phone has it: upright, or held sideways */
function screenOf(width, height, type) {
  Object.defineProperty(window.screen, 'width', { value: width, configurable: true });
  Object.defineProperty(window.screen, 'height', { value: height, configurable: true });
  Object.defineProperty(window.screen, 'orientation', {
    value: { type, addEventListener: () => {}, removeEventListener: () => {} },
    configurable: true
  });
}

beforeEach(() => {
  screenOf(393, 851, 'portrait-primary');
  media = { matches: true, listeners: [] };
  window.matchMedia = () => ({
    get matches() {
      return media.matches;
    },
    addEventListener: (type, listener) => media.listeners.push(listener),
    removeEventListener: () => {}
  });
});

const translate = (text) => text;
const injector = { get: () => null };

function build(sheets) {
  const eventBus = new EventBus();
  const events = [];
  eventBus.on('sheets.changed', (event) => {
    events.push({ active: event.active, current: event.current, body: !!event.body });
  });
  const service = new Sheets(eventBus, { sheets }, translate, injector);
  return { eventBus, service, events };
}

const withContainer = () => ({ container: document.createElement('div') });

describe('Sheets', () => {

  it('without a container there are no sheets', () => {
    const { service, events } = build(undefined);
    expect(service.isActive()).toBe(false);
    service.open('properties', { title: 'Properties' });
    expect(service.current()).toBe(null);
    expect(events).toEqual([]);
  });

  it('opens a sheet and tells which one, with its body', () => {
    const { service, events } = build(withContainer());
    expect(service.isActive()).toBe(true);
    service.open('properties', { title: 'Properties' });
    expect(service.current()).toBe('properties');
    expect(service.body()).toBeTruthy();
    expect(events).toEqual([{ active: true, current: 'properties', body: true }]);
  });

  it('closes the open sheet before it opens another', () => {
    const { service, events } = build(withContainer());
    service.open('properties', { title: 'Properties' });
    service.open('layers', { title: 'Layers' });
    expect(service.current()).toBe('layers');
    expect(events.slice(1)).toEqual([
      { active: true, current: null, body: false },
      { active: true, current: 'layers', body: true }
    ]);
  });

  it('toggle closes the open sheet; close without a sheet tells nothing', () => {
    const { service, events } = build(withContainer());
    service.toggle('layers', { title: 'Layers' });
    service.toggle('layers', { title: 'Layers' });
    expect(service.current()).toBe(null);
    const count = events.length;
    service.close();
    expect(events.length).toBe(count);
  });

  // final review 016f E2, I1
  it('a screen held sideways has no sheets, a host query alone decides', () => {
    screenOf(851, 393, 'landscape-primary');
    expect(build(withContainer()).service.isActive()).toBe(false);
    expect(build({ container: document.createElement('div'), media: '(pointer: coarse)' }).service.isActive()).toBe(true);
  });

  it('when the media query stops matching, the open sheet closes', () => {
    const { service, events } = build(withContainer());
    service.open('check', { title: 'Model check (VDI 3682)' });
    media.matches = false;
    media.listeners.forEach((listener) => listener());
    expect(service.isActive()).toBe(false);
    expect(service.current()).toBe(null);
    expect(events[events.length - 1]).toEqual({ active: false, current: null, body: false });
    service.open('check', { title: 'Model check (VDI 3682)' });
    expect(service.current()).toBe(null);
  });
});
