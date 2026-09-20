// tests/unit/services/UiReadiness.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import UiReadiness from '../../../app/fpb/services/UiReadiness.js';

/** Minimaler Event-Bus: nur on und fire */
function eventBus() {
  const listeners = {};
  return {
    on: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    fire: (type, event) => (listeners[type] || []).forEach((fn) => fn(event)),
  };
}

describe('UiReadiness', () => {

  let bus;
  let readiness;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = eventBus();
    readiness = new UiReadiness(bus);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs right away when nothing announced itself', () => {
    const gelaufen = vi.fn();
    readiness.whenReady(gelaufen, 2000);

    expect(gelaufen).not.toHaveBeenCalled(); // immer erst im nächsten Zug
    vi.advanceTimersByTime(0);
    expect(gelaufen).toHaveBeenCalledTimes(1);
  });

  it('waits for a registered panel and continues as soon as it is there', () => {
    bus.fire('ui.componentRegistered', { component: 'layerPanel' });
    const gelaufen = vi.fn();
    readiness.whenReady(gelaufen, 2000);

    vi.advanceTimersByTime(500);
    expect(gelaufen).not.toHaveBeenCalled();

    bus.fire('ui.componentReady', { component: 'layerPanel' });
    expect(gelaufen).toHaveBeenCalledTimes(1);

    // der Sicherheitsnetz-Timer darf nicht noch einmal auslösen
    vi.advanceTimersByTime(5000);
    expect(gelaufen).toHaveBeenCalledTimes(1);
  });

  it('waits for every registered panel', () => {
    bus.fire('ui.componentRegistered', { component: 'layerPanel' });
    bus.fire('ui.componentRegistered', { component: 'propertiesPanel' });
    const gelaufen = vi.fn();
    readiness.whenReady(gelaufen, 2000);

    bus.fire('ui.componentReady', { component: 'layerPanel' });
    expect(gelaufen).not.toHaveBeenCalled();

    bus.fire('ui.componentReady', { component: 'propertiesPanel' });
    expect(gelaufen).toHaveBeenCalledTimes(1);
  });

  /** Das Sicherheitsnetz: ein Panel, das sich nie meldet, blockiert nicht */
  it('gives up waiting after the timeout', () => {
    bus.fire('ui.componentRegistered', { component: 'layerPanel' });
    const gelaufen = vi.fn();
    readiness.whenReady(gelaufen, 2000);

    vi.advanceTimersByTime(2000);
    expect(gelaufen).toHaveBeenCalledTimes(1);

    // meldet es sich verspätet, läuft der Rückruf nicht erneut
    bus.fire('ui.componentReady', { component: 'layerPanel' });
    expect(gelaufen).toHaveBeenCalledTimes(1);
  });

  it('is ready again for the next import once the panels are mounted', () => {
    bus.fire('ui.componentRegistered', { component: 'layerPanel' });
    bus.fire('ui.componentReady', { component: 'layerPanel' });
    expect(readiness.isReady()).toBe(true);

    const gelaufen = vi.fn();
    readiness.whenReady(gelaufen, 2000);
    vi.advanceTimersByTime(0);
    expect(gelaufen).toHaveBeenCalledTimes(1);
  });
});
