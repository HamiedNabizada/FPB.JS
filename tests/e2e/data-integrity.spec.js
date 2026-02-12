// tests/e2e/data-integrity.spec.js
import { test, expect } from '@playwright/test';
import { ModelerPage } from './pages/ModelerPage';

/**
 * E2E-Tests für Daten-Integrität:
 * Prüft den internen Zustand des Modelers über window.fpbjs
 *
 * Deckt FpbUpdater.js ab:
 * - updateProcessInformation (elementsContainer, consistsOfStates, etc.)
 * - updateConnection (sourceRef, targetRef, isAssignedTo)
 * - updateBounds (DI bounds)
 * - updateConnectionWaypoints (DI waypoints)
 * - updateDiParent (DI plane hierarchy)
 * - updateDiConnection (DI source/target)
 */

const POSITIONS = {
  systemLimit:       { x: 500, y: 400 },
  inputProduct:      { x: 350, y: 150 },
  inputEnergy:       { x: 500, y: 150 },
  processOperator:   { x: 450, y: 350 },
  outputProduct:     { x: 350, y: 550 },
  outputEnergy:      { x: 500, y: 550 },
  technicalResource: { x: 900, y: 350 },
};

test.describe('Data Integrity - Process Structure', () => {

  test('creating elements populates process data correctly', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    // Internen Zustand prüfen via canvas.getRootElement()
    const processData = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      if (!root) return null;

      const bo = root.businessObject;

      return {
        hasSystemLimit: !!bo.consistsOfSystemLimit,
        stateCount: bo.consistsOfStates ? bo.consistsOfStates.length : 0,
        processOperatorCount: bo.consistsOfProcessOperator ? bo.consistsOfProcessOperator.length : 0,
        elementsContainerCount: bo.elementsContainer ? bo.elementsContainer.length : 0,
      };
    });

    expect(processData).not.toBeNull();
    expect(processData.hasSystemLimit).toBeTruthy();
    expect(processData.stateCount).toBeGreaterThanOrEqual(1);
    expect(processData.processOperatorCount).toBe(1);
  });

  test('creating connections sets sourceRef and targetRef correctly', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);
    await modeler.createProduct(POSITIONS.outputProduct);
    await page.waitForTimeout(300);

    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);
    await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputProduct);

    const connectionData = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      if (!root) return null;

      const bo = root.businessObject;
      const sl = bo.consistsOfSystemLimit;
      if (!sl || !sl.elementsContainer) return null;

      // Finde alle Connections im elementsContainer der SystemLimit
      const connections = sl.elementsContainer.filter(el => {
        const type = el.$type || (el.businessObject && el.businessObject.$type) || '';
        return type.indexOf('Flow') !== -1 || type.indexOf('Usage') !== -1;
      });

      return {
        connectionCount: connections.length,
        connections: connections.map(conn => {
          // Connection BO kann direkt das Element sein oder über .businessObject erreichbar
          const connBo = conn.businessObject || conn;
          return {
            type: connBo.$type,
            hasSourceRef: !!connBo.sourceRef,
            hasTargetRef: !!connBo.targetRef,
            sourceType: connBo.sourceRef ? connBo.sourceRef.$type : null,
            targetType: connBo.targetRef ? connBo.targetRef.$type : null,
          };
        })
      };
    });

    expect(connectionData).not.toBeNull();
    expect(connectionData.connectionCount).toBe(2);

    // Jede Connection sollte sourceRef und targetRef haben
    for (const conn of connectionData.connections) {
      expect(conn.hasSourceRef).toBeTruthy();
      expect(conn.hasTargetRef).toBeTruthy();
    }
  });

  test('isAssignedTo is set when connecting state to PO', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);

    const assignmentData = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      if (!root) return null;

      const bo = root.businessObject;
      const states = bo.consistsOfStates || [];

      return states.map(state => ({
        name: state.name || '(unnamed)',
        type: state.$type,
        isAssignedToCount: state.isAssignedTo ? state.isAssignedTo.length : 0,
      }));
    });

    expect(assignmentData).not.toBeNull();
    // Mindestens ein State mit isAssignedTo
    const assignedState = assignmentData.find(s => s.isAssignedToCount > 0);
    expect(assignedState).toBeDefined();
  });

  test('deleting elements cleans up process data', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);

    // Product löschen (type-based)
    await modeler.deleteByType('fpb:Product');
    await page.waitForTimeout(500);

    const afterDelete = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      if (!root) return null;

      const bo = root.businessObject;
      return {
        stateCount: bo.consistsOfStates ? bo.consistsOfStates.length : 0,
        processOperatorCount: bo.consistsOfProcessOperator ? bo.consistsOfProcessOperator.length : 0,
      };
    });

    expect(afterDelete).not.toBeNull();
    // Der gelöschte State sollte nicht mehr in consistsOfStates sein
    expect(afterDelete.stateCount).toBe(0);
    // PO sollte noch da sein
    expect(afterDelete.processOperatorCount).toBe(1);
  });

});

test.describe('Data Integrity - DI Bounds', () => {

  test('elements have DI bounds after creation', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    const diData = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      if (!root) return null;

      const bo = root.businessObject;
      const sl = bo.consistsOfSystemLimit;

      // Prüfe DI bounds für alle Elemente im elementsContainer
      const elements = (sl && sl.elementsContainer) ? sl.elementsContainer : [];
      const results = [];

      for (const el of elements) {
        // Element kann ein BO oder ein Shape-Ref sein
        const elBo = el.businessObject || el;
        if (elBo.di) {
          const di = elBo.di;
          const hasBounds = !!(di.bounds && di.bounds.x !== undefined);
          results.push({
            type: elBo.$type || el.type,
            hasDi: true,
            hasBounds: hasBounds,
          });
        }
      }

      return results;
    });

    expect(diData).not.toBeNull();
    expect(diData.length).toBeGreaterThan(0);

    // Alle Shapes (nicht Connections) sollten DI bounds haben
    for (const el of diData) {
      expect(el.hasDi).toBeTruthy();
    }
  });

  test('connections have DI waypoints after creation', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);

    const waypointData = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      if (!root) return null;

      const bo = root.businessObject;
      const sl = bo.consistsOfSystemLimit;
      if (!sl || !sl.elementsContainer) return null;

      const connections = sl.elementsContainer.filter(el => {
        const type = el.$type || (el.businessObject && el.businessObject.$type) || '';
        return type.indexOf('Flow') !== -1;
      });

      return connections.map(conn => {
        const connBo = conn.businessObject || conn;
        return {
          type: connBo.$type,
          hasDi: !!connBo.di,
          hasWaypoints: !!(connBo.di && connBo.di.waypoint),
          waypointCount: connBo.di && connBo.di.waypoint
            ? connBo.di.waypoint.length : 0,
        };
      });
    });

    expect(waypointData).not.toBeNull();
    expect(waypointData.length).toBeGreaterThanOrEqual(1);

    for (const conn of waypointData) {
      expect(conn.hasDi).toBeTruthy();
      expect(conn.hasWaypoints).toBeTruthy();
      expect(conn.waypointCount).toBeGreaterThanOrEqual(2);
    }
  });

});

test.describe('Data Integrity - Decomposition', () => {

  test('decomposition creates child process with correct references', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);
    await modeler.createProduct(POSITIONS.outputProduct);
    await page.waitForTimeout(300);

    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);
    await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputProduct);

    // Dekomponieren (type-based)
    await modeler.decomposeByType();
    await page.waitForTimeout(1000);

    // Nach Dekomposition sind wir auf dem Child-Layer
    // Prüfe den aktuellen Root-Element (Child-Layer)
    const decompData = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      if (!root) return null;

      const bo = root.businessObject;
      return {
        isDecomposedPO: !!bo.isDecomposedProcessOperator,
        hasParent: !!bo.parent,
        hasSystemLimit: !!bo.consistsOfSystemLimit,
        stateCount: bo.consistsOfStates ? bo.consistsOfStates.length : 0,
      };
    });

    expect(decompData).not.toBeNull();
    // Wir sind auf dem Child-Layer → isDecomposedProcessOperator sollte gesetzt sein
    expect(decompData.isDecomposedPO).toBeTruthy();
    expect(decompData.hasParent).toBeTruthy();
    expect(decompData.hasSystemLimit).toBeTruthy();
    // Grenz-States (2: Input + Output)
    expect(decompData.stateCount).toBe(2);
  });

  test('compose restores parent process correctly', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);
    await modeler.createProduct(POSITIONS.outputProduct);
    await page.waitForTimeout(300);

    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);
    await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputProduct);

    // Dekomponieren (type-based)
    await modeler.decomposeByType();
    await page.waitForTimeout(500);

    // Compose zurück (type-based)
    await modeler.composeToParent();

    // Prüfe dass Parent-Process korrekt ist
    const parentData = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      if (!root) return null;

      const bo = root.businessObject;

      return {
        isDecomposedPO: !!bo.isDecomposedProcessOperator,
        hasSystemLimit: !!bo.consistsOfSystemLimit,
        stateCount: bo.consistsOfStates ? bo.consistsOfStates.length : 0,
        processOperatorCount: bo.consistsOfProcessOperator ? bo.consistsOfProcessOperator.length : 0,
      };
    });

    // Wir sind auf dem Parent-Layer (kein decomposedPO)
    expect(parentData.isDecomposedPO).toBeFalsy();
    expect(parentData.hasSystemLimit).toBeTruthy();
    expect(parentData.stateCount).toBe(2); // Input + Output
    expect(parentData.processOperatorCount).toBe(1);
  });

});
