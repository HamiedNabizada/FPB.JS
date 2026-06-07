// tests/setup/integration.js
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Globale Variablen für Test-Context
let testContainer = null;
let diagramInstance = null;

// ============================================
// Container Management
// ============================================

function createTestContainer() {
  const container = document.createElement('div');
  container.id = 'test-container';
  container.style.cssText = `
    width: 1200px;
    height: 800px;
    position: absolute;
    left: 0;
    top: 0;
  `;
  document.body.appendChild(container);
  return container;
}

function removeTestContainer() {
  if (testContainer && testContainer.parentNode) {
    testContainer.parentNode.removeChild(testContainer);
  }
  testContainer = null;
}

// ============================================
// Diagram Bootstrap
// ============================================

/**
 * Erstellt eine neue Diagram-Instanz für Tests
 * @param {Object} options - Optionale Konfiguration
 */
export async function bootstrapDiagram(options = {}) {
  // Vorherige Instanz aufräumen
  if (diagramInstance) {
    diagramInstance.destroy();
  }
  removeTestContainer();

  // Neuen Container erstellen
  testContainer = createTestContainer();

  // Dynamischer Import um ES Module korrekt zu laden
  const { default: FpbModeler } = await import('../../app/fpb/FpbModeler');

  // Modeler erstellen
  diagramInstance = new FpbModeler({
    container: testContainer,
    ...options,
  });

  // Warten bis initialisiert
  await new Promise(resolve => setTimeout(resolve, 100));

  return {
    modeler: diagramInstance,
    container: testContainer,
    get: (name) => diagramInstance.get(name),
    invoke: (fn) => diagramInstance.get('injector').invoke(fn),
  };
}

/**
 * Räumt die Test-Umgebung auf
 */
export function destroyDiagram() {
  if (diagramInstance) {
    diagramInstance.destroy();
    diagramInstance = null;
  }
  removeTestContainer();
}

// ============================================
// Test Utilities
// ============================================

/**
 * Wartet auf ein Event
 */
export function waitForEvent(eventBus, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeout);

    eventBus.once(eventName, (event) => {
      clearTimeout(timer);
      resolve(event);
    });
  });
}

/**
 * Erstellt ein Element im Diagram
 */
export async function createShape(context, type, position, name) {
  const { get } = context;

  const elementFactory = get('elementFactory');
  const modeling = get('modeling');
  const canvas = get('canvas');

  const root = canvas.getRootElement();
  const systemLimit = root.children?.find(c =>
    c.type === 'fpb:SystemLimit'
  ) || root;

  const shape = elementFactory.createShape({
    type: type,
    width: type.includes('State') || type.includes('Product') ? 40 : 120,
    height: type.includes('State') || type.includes('Product') ? 40 : 80,
  });

  modeling.createShape(shape, position, systemLimit);

  if (name) {
    modeling.updateLabel(shape, name);
  }

  return shape;
}

/**
 * Findet ein Element nach Namen
 */
export function findElementByName(context, name) {
  const { get } = context;
  const elementRegistry = get('elementRegistry');

  return elementRegistry.find(element =>
    element.businessObject?.name === name
  );
}

// ============================================
// Lifecycle
// ============================================

beforeEach(() => {
  // Jeder Test startet mit frischem DOM
  document.body.innerHTML = '';
});

afterEach(() => {
  // Nach jedem Test aufräumen
  destroyDiagram();
});

console.log('✓ Integration test setup loaded');
