// tests/e2e/decompose-compose.spec.js
import { test, expect } from '@playwright/test';
import { ModelerPage } from './pages/ModelerPage';

/**
 * E2E-Tests für Decompose/Compose (Layer-Navigation):
 * - ProcessOperator dekomponieren → Child-Layer mit SystemLimit + Grenz-States
 * - Compose zurück zum Parent-Layer
 * - Layer-Panel Navigation
 *
 * Deckt FpbUpdater.js ab:
 * - shape.create mit Szenario 3 (State auf Child-Layer erstellen)
 * - connection.create mit decomposedView (State-Propagation)
 * - Confirmation-Handler (remove_decomposition)
 * - DI-Plane Management
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

/**
 * Helper: Erstellt ein Modell mit SL, Input, PO (mit Input+Output), Output
 * → PO hat incoming + outgoing → Decompose-Button verfügbar
 */
async function createDecomposableModel(modeler, page) {
  await modeler.createSystemLimit(POSITIONS.systemLimit);
  await page.waitForTimeout(500);

  await modeler.createProduct(POSITIONS.inputProduct);
  await page.waitForTimeout(300);
  await modeler.createProcessOperator(POSITIONS.processOperator);
  await page.waitForTimeout(300);
  await modeler.createProduct(POSITIONS.outputProduct);
  await page.waitForTimeout(300);

  // Input → PO
  await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);
  // PO → Output
  await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputProduct);

  await page.waitForTimeout(300);
}

/**
 * Helper: Vom Child-Layer zurück zum Parent navigieren via type-based SystemLimit click
 */
async function navigateToParent(modeler) {
  await modeler.composeToParent();
}

test.describe('Decompose ProcessOperator', () => {

  test('decompose button is available when PO has input and output', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createDecomposableModel(modeler, page);

    // PO ist groß (150x75), position-based funktioniert
    const actions = await modeler.getContextPadActions(POSITIONS.processOperator);
    expect(actions).toContain('decompose');
  });

  test('decompose button is NOT available when PO has no input and output', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    // PO ohne Connections → sollte delete haben aber NICHT decompose
    const actions = await modeler.getContextPadActionsByType('fpb:ProcessOperator');
    expect(actions).toContain('delete');
    expect(actions).not.toContain('decompose');
  });

  test('decomposes PO and navigates to child layer', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createDecomposableModel(modeler, page);

    await modeler.takeCanvasScreenshot('decompose-01-before');

    // Dekomponieren
    await modeler.decomposeByType();

    await modeler.takeCanvasScreenshot('decompose-02-child-layer');

    // Auf dem Child-Layer sollte ein neues SystemLimit existieren
    const shapes = await modeler.countShapes();
    expect(shapes).toBeGreaterThan(0);

    // Es sollten Grenz-States auf dem Child-Layer existieren
    // (Input Product und Output Product vom Parent)
    const elements = await page.locator('.djs-element.djs-shape').count();
    // Mindestens: SystemLimit + 2 Grenz-States (Input + Output)
    expect(elements).toBeGreaterThanOrEqual(3);
  });

  test('child layer has compose button on SystemLimit', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createDecomposableModel(modeler, page);

    // Dekomponieren
    await modeler.decomposeByType();

    // SystemLimit auf Child-Layer finden via type-based und Context-Pad prüfen
    const actions = await modeler.getContextPadActionsByType('fpb:SystemLimit');
    expect(actions).toContain('compose');
  });

  test('compose navigates back to parent layer', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createDecomposableModel(modeler, page);

    const shapesOnParent = await modeler.countShapes();

    // Dekomponieren → Child-Layer
    await modeler.decomposeByType();
    await page.waitForTimeout(500);

    // Compose → zurück zum Parent
    await navigateToParent(modeler);

    await modeler.takeCanvasScreenshot('decompose-03-back-to-parent');

    // Auf dem Parent-Layer sollten die gleichen Shapes wie vorher existieren
    const shapesAfterCompose = await modeler.countShapes();
    expect(shapesAfterCompose).toBe(shapesOnParent);
  });

  test('adding new connection to decomposed PO creates state on child layer', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createDecomposableModel(modeler, page);

    // Dekomponieren
    await modeler.decomposeByType();
    const shapesOnChild = await modeler.countShapes();

    // Zurück zum Parent
    await navigateToParent(modeler);

    // Neuen Energy-State auf Parent erstellen und mit PO verbinden (Szenario 3)
    await modeler.createEnergy(POSITIONS.inputEnergy);
    await page.waitForTimeout(300);
    // Type-based connect, da Position nach Navigation unzuverlässig
    await modeler.connectByType('fpb:Energy', 0, 'connect', POSITIONS.processOperator);
    await page.waitForTimeout(500);

    // Zurück zum Child-Layer → neuer State sollte vorhanden sein
    await modeler.decomposeByType();

    const shapesOnChildAfter = await modeler.countShapes();
    // Ein zusätzlicher Grenz-State sollte existieren
    expect(shapesOnChildAfter).toBeGreaterThan(shapesOnChild);

    await modeler.takeCanvasScreenshot('decompose-04-new-state-on-child');
  });

});

test.describe('Remove Decomposition', () => {

  test('deleting decomposed PO removes child layer', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();
    await createDecomposableModel(modeler, page);

    // Dekomponieren
    await modeler.decomposeByType();
    await page.waitForTimeout(500);

    // Zurück zum Parent
    await navigateToParent(modeler);

    // PO löschen via type-based (zuverlässiger als Position)
    await modeler.deleteByType('fpb:ProcessOperator');

    // Bestätigungsdialog erwartet (decomposed PO hat Konsequenzen)
    const modalVisible = await modeler.isModalVisible();
    if (modalVisible) {
      await modeler.confirmModal();
    }

    await page.waitForTimeout(500);
    await modeler.takeCanvasScreenshot('decompose-05-po-deleted');

    // PO sollte weg sein → keine Connections mehr
    const connections = await modeler.countConnections();
    expect(connections).toBe(0);
  });

});
