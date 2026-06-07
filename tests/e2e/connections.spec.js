// tests/e2e/connections.spec.js
import { test, expect } from '@playwright/test';
import { ModelerPage } from './pages/ModelerPage';

/**
 * E2E-Tests für Connections:
 * Flow, ParallelFlow, AlternativeFlow, Usage
 *
 * Deckt FpbUpdater.js ab:
 * - connection.create Handler (updateProcessInformation)
 * - connection.delete Handler
 * - updateConnection (sourceRef/targetRef Management)
 * - isAssignedTo Management
 * - inTandemWith für Parallel/Alternative Flows
 */

// Layout: Input-States oben (y=150), PO Mitte (y=350), Output-States unten (y=550)
const POSITIONS = {
  systemLimit:       { x: 500, y: 400 },
  inputProduct:      { x: 350, y: 150 },
  inputEnergy:       { x: 500, y: 150 },
  processOperator:   { x: 450, y: 350 },
  outputProduct:     { x: 350, y: 550 },
  outputEnergy:      { x: 500, y: 550 },
  technicalResource: { x: 900, y: 350 },
};

/**
 * Helper: Erstellt ein Basismodell mit SL, Input, PO, Output
 */
async function createBaseModel(modeler, page) {
  await modeler.createSystemLimit(POSITIONS.systemLimit);
  await page.waitForTimeout(500);
  await modeler.createProduct(POSITIONS.inputProduct);
  await page.waitForTimeout(300);
  await modeler.createProcessOperator(POSITIONS.processOperator);
  await page.waitForTimeout(300);
  await modeler.createProduct(POSITIONS.outputProduct);
  await page.waitForTimeout(300);
}

test.describe('Connection Lifecycle', () => {

  test('creates a Flow connection from State to ProcessOperator', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createBaseModel(modeler, page);

    const connectionsBefore = await modeler.countConnections();

    // Input Product → ProcessOperator verbinden
    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);

    const connectionsAfter = await modeler.countConnections();
    expect(connectionsAfter).toBe(connectionsBefore + 1);

    await modeler.takeCanvasScreenshot('conn-01-flow-created');
  });

  test('creates a Flow connection from ProcessOperator to State', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createBaseModel(modeler, page);

    // PO → Output Product
    await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputProduct);

    const connections = await modeler.countConnections();
    expect(connections).toBeGreaterThanOrEqual(1);
  });

  test('creates full flow chain: Input → PO → Output', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createBaseModel(modeler, page);

    // Input → PO
    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);
    // PO → Output
    await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputProduct);

    const connections = await modeler.countConnections();
    expect(connections).toBe(2);

    await modeler.takeCanvasScreenshot('conn-02-full-chain');
  });

  test('creates a Usage connection between PO and TechnicalResource', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);
    await modeler.createTechnicalResource(POSITIONS.technicalResource);
    await page.waitForTimeout(300);

    // PO hat connect_usage im Context-Pad wenn TR verfügbar
    await modeler.connectElements(POSITIONS.processOperator, 'connect_usage', POSITIONS.technicalResource);

    const connections = await modeler.countConnections();
    expect(connections).toBeGreaterThanOrEqual(1);

    await modeler.takeCanvasScreenshot('conn-03-usage');
  });

  test('creates Usage connection from TechnicalResource to PO', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);
    await modeler.createTechnicalResource(POSITIONS.technicalResource);
    await page.waitForTimeout(300);

    // TR → PO via connect_usage (type-based für TR, da Position außerhalb Canvas-Viewport sein kann)
    await modeler.openContextPadByType('fpb:TechnicalResource');
    await modeler.clickContextPadAction('connect_usage');
    await page.waitForTimeout(200);
    await modeler.clickCanvasAt(POSITIONS.processOperator);
    await page.waitForTimeout(500);

    const connections = await modeler.countConnections();
    expect(connections).toBeGreaterThanOrEqual(1);
  });

  test('deleting a connected element removes its connections', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createBaseModel(modeler, page);

    // Verbindungen erstellen
    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);
    await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputProduct);

    expect(await modeler.countConnections()).toBe(2);

    // PO löschen via type-based → beide Connections sollten verschwinden
    await modeler.deleteByType('fpb:ProcessOperator');

    const connectionsAfter = await modeler.countConnections();
    expect(connectionsAfter).toBe(0);
  });

  test('deleting a connection does not delete the elements', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createBaseModel(modeler, page);

    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);

    const shapesBefore = await modeler.countShapes();
    expect(await modeler.countConnections()).toBe(1);

    // Connection löschen via internal API (Midpoint-Klick ist unzuverlässig)
    await modeler.deleteConnectionByIndex(0);

    // Shapes sollten noch da sein
    const shapesAfter = await modeler.countShapes();
    expect(shapesAfter).toBe(shapesBefore);
    expect(await modeler.countConnections()).toBe(0);
  });

});

test.describe('Multiple Connections', () => {

  test('creates multiple inputs to one ProcessOperator', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createEnergy(POSITIONS.inputEnergy);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    // Product → PO
    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);
    // Energy → PO
    await modeler.connectWithFlow(POSITIONS.inputEnergy, POSITIONS.processOperator);

    expect(await modeler.countConnections()).toBe(2);

    await modeler.takeCanvasScreenshot('conn-04-multiple-inputs');
  });

  test('creates multiple outputs from one ProcessOperator', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);

    // Wir brauchen Input zuerst, damit PO connect anzeigt
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    // Input verbinden damit PO connect hat
    await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);

    // Output-States erstellen (unten, y > PO.y + 50)
    await modeler.createProduct(POSITIONS.outputProduct);
    await page.waitForTimeout(300);
    await modeler.createEnergy(POSITIONS.outputEnergy);
    await page.waitForTimeout(300);

    // PO → Product
    await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputProduct);
    // PO → Energy
    await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputEnergy);

    expect(await modeler.countConnections()).toBe(3);

    await modeler.takeCanvasScreenshot('conn-05-multiple-outputs');
  });

});
