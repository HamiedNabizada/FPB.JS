// tests/setup/mocks/MockEventBus.js

/**
 * Vollständiger Mock für diagram-js EventBus
 * Kann für Unit-Tests verwendet werden
 */
export class MockEventBus {
  constructor() {
    this._listeners = new Map();
    this._firedEvents = [];
  }

  /**
   * Registriert einen Event-Listener
   */
  on(events, priority, callback) {
    if (typeof priority === 'function') {
      callback = priority;
      priority = 1000;
    }

    const eventNames = Array.isArray(events) ? events : [events];

    eventNames.forEach(event => {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, []);
      }
      this._listeners.get(event).push({ priority, callback });
      this._listeners.get(event).sort((a, b) => b.priority - a.priority);
    });
  }

  /**
   * Registriert einen einmaligen Listener
   */
  once(event, priority, callback) {
    if (typeof priority === 'function') {
      callback = priority;
      priority = 1000;
    }

    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      return callback(...args);
    };

    this.on(event, priority, onceWrapper);
  }

  /**
   * Entfernt einen Listener
   */
  off(event, callback) {
    if (!this._listeners.has(event)) return;

    const listeners = this._listeners.get(event);
    const index = listeners.findIndex(l => l.callback === callback);

    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Feuert ein Event
   */
  fire(event, data = {}) {
    this._firedEvents.push({ event, data, timestamp: Date.now() });

    const listeners = this._listeners.get(event) || [];

    let result = data;
    for (const listener of listeners) {
      const returnValue = listener.callback(result);
      if (returnValue !== undefined) {
        result = returnValue;
      }
    }

    return result;
  }

  // ============================================
  // Test-Helpers
  // ============================================

  /**
   * Prüft ob ein Event gefeuert wurde
   */
  wasEventFired(eventName) {
    return this._firedEvents.some(e => e.event === eventName);
  }

  /**
   * Gibt alle gefeuerten Events zurück
   */
  getFiredEvents(eventName = null) {
    if (eventName) {
      return this._firedEvents.filter(e => e.event === eventName);
    }
    return [...this._firedEvents];
  }

  /**
   * Setzt den Event-Log zurück
   */
  clearFiredEvents() {
    this._firedEvents = [];
  }

  /**
   * Setzt alles zurück
   */
  reset() {
    this._listeners.clear();
    this._firedEvents = [];
  }
}

export default MockEventBus;
