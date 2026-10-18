// tests/setup/unit.js
import { vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Globale Mocks für diagram-js
// ============================================

// Mock für diagram-js Module die SVG benötigen
vi.mock('diagram-js/lib/core/Canvas', () => ({
  default: vi.fn().mockImplementation(() => ({
    getRootElement: vi.fn(),
    getContainer: vi.fn(() => document.createElement('div')),
    addShape: vi.fn(),
    removeShape: vi.fn(),
    addConnection: vi.fn(),
    removeConnection: vi.fn(),
  })),
}));

vi.mock('diagram-js/lib/core/EventBus', () => ({
  default: vi.fn().mockImplementation(() => {
    const listeners = new Map();
    return {
      on: vi.fn((event, callback) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(callback);
      }),
      off: vi.fn((event, callback) => {
        if (listeners.has(event)) {
          const arr = listeners.get(event);
          const idx = arr.indexOf(callback);
          if (idx > -1) arr.splice(idx, 1);
        }
      }),
      fire: vi.fn((event, data) => {
        const callbacks = listeners.get(event) || [];
        callbacks.forEach(cb => cb(data));
        return data;
      }),
      once: vi.fn((event, callback) => {
        const wrapper = (data) => {
          callback(data);
          listeners.get(event)?.splice(
            listeners.get(event).indexOf(wrapper), 1
          );
        };
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(wrapper);
      }),
    };
  }),
}));

// ============================================
// Test Lifecycle Hooks
// ============================================

beforeEach(() => {
  // Alle Mocks zurücksetzen
  vi.clearAllMocks();
});

afterEach(() => {
  // DOM aufräumen
  document.body.innerHTML = '';
});

// ============================================
// Globale Test-Utilities
// ============================================

/**
 * Erstellt ein Mock-Element für Tests
 * @param {string} type - Der Elementtyp (z.B. 'fpb:Product')
 * @param {string} name - Der Name des Elements
 * @returns {Object} Mock-Element
 */
globalThis.createMockElement = (type, name = 'Test Element') => ({
  id: `element_${Math.random().toString(36).substr(2, 9)}`,
  type: type,
  x: 100,
  y: 100,
  width: 40,
  height: 40,
  businessObject: {
    $type: type,
    name: name,
    id: `bo_${Math.random().toString(36).substr(2, 9)}`,
    // Mock $instanceOf für is() Funktion
    $instanceOf: (checkType) => type === checkType,
  },
  parent: null,
  children: [],
  incoming: [],
  outgoing: [],
  labels: [],
});

/**
 * Erstellt ein Mock-SystemLimit für Tests
 * @param {Object} options - Position und Größe
 * @returns {Object} Mock-SystemLimit
 */
globalThis.createMockSystemLimit = (options = {}) => ({
  id: `systemlimit_${Math.random().toString(36).substr(2, 9)}`,
  type: 'fpb:SystemLimit',
  x: options.x ?? 50,
  y: options.y ?? 50,
  width: options.width ?? 400,
  height: options.height ?? 300,
  businessObject: {
    $type: 'fpb:SystemLimit',
    name: options.name ?? 'Test SystemLimit',
    $instanceOf: (checkType) => checkType === 'fpb:SystemLimit',
  },
  parent: null,
  children: [],
});

/**
 * Erstellt ein Mock-State (Product/Energy/Information)
 * @param {string} type - 'fpb:Product', 'fpb:Energy', oder 'fpb:Information'
 * @param {Object} options - Position und Name
 * @returns {Object} Mock-State
 */
globalThis.createMockState = (type, options = {}) => ({
  id: `state_${Math.random().toString(36).substr(2, 9)}`,
  type: type,
  x: options.x ?? 100,
  y: options.y ?? 100,
  width: options.width ?? 50,
  height: options.height ?? 50,
  businessObject: {
    $type: type,
    name: options.name ?? 'Test State',
    $instanceOf: (checkType) => checkType === type,
  },
  parent: options.parent ?? null,
});

/**
 * Erstellt eine Mock-Connection
 */
globalThis.createMockConnection = (source, target, type = 'fpb:Flow') => ({
  id: `connection_${Math.random().toString(36).substr(2, 9)}`,
  type: type,
  source: source,
  target: target,
  waypoints: [
    { x: source.x + source.width, y: source.y + source.height / 2 },
    { x: target.x, y: target.y + target.height / 2 },
  ],
  businessObject: {
    $type: type,
    $instanceOf: (checkType) => checkType === type,
  },
});

console.log('✓ Unit test setup loaded');
