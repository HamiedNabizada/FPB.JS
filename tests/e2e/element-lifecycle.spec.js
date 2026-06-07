// tests/e2e/element-lifecycle.spec.js
import { test, expect } from '@playwright/test';
import { ModelerPage } from './pages/ModelerPage';

/**
 * E2E-Tests für den Element-Lebenszyklus:
 * Erstellen, Context-Pad prüfen, Löschen
 *
 * Deckt FpbUpdater.js ab:
 * - shape.create Handler (updateProcessInformation)
 * - shape.delete Handler
 * - elementsContainer-Management
 */

// Layout: Input-States oben, PO Mitte, Output-States unten
const POSITIONS = {
  systemLimit:       { x: 500, y: 400 },
  product1:          { x: 350, y: 150 },
  product2:          { x: 500, y: 150 },
  energy:            { x: 350, y: 550 },
  information:       { x: 500, y: 550 },
  processOperator:   { x: 450, y: 350 },
  technicalResource: { x: 900, y: 350 },
};

test.describe('Element Lifecycle', () => {

  test('creates all FPB element types and verifies shapes', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // SystemLimit erstellen
    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    const shapesAfterSL = await modeler.countShapes();
    expect(shapesAfterSL).toBeGreaterThan(0);

    // Product
    await modeler.createProduct(POSITIONS.product1);
    await page.waitForTimeout(300);

    // Energy
    await modeler.createEnergy(POSITIONS.energy);
    await page.waitForTimeout(300);

    // Information
    await modeler.createInformation(POSITIONS.information);
    await page.waitForTimeout(300);

    // ProcessOperator
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    // TechnicalResource (außerhalb SystemLimit)
    await modeler.createTechnicalResource(POSITIONS.technicalResource);
    await page.waitForTimeout(300);

    // Mindestens 6 Shapes (SL + Product + Energy + Info + PO + TR)
    const totalShapes = await modeler.countShapes();
    expect(totalShapes).toBeGreaterThanOrEqual(6);

    await modeler.takeCanvasScreenshot('lifecycle-01-all-elements');
  });

  test('context pad shows correct actions for Product', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.product1);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    // Context-Pad auf Product öffnen (type-based, da Position unzuverlässig)
    const actions = await modeler.getContextPadActionsByType('fpb:Product');

    // Product sollte delete und connect-Aktionen haben
    expect(actions).toContain('delete');
    expect(actions).toContain('connect');
  });

  test('context pad shows correct actions for ProcessOperator', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.product1);
    await page.waitForTimeout(300);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);
    await modeler.createProduct(POSITIONS.energy);
    await page.waitForTimeout(300);

    // Input mit PO verbinden (für Decompose-Button)
    await modeler.connectWithFlow(POSITIONS.product1, POSITIONS.processOperator);
    // PO mit Output verbinden
    await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.energy);

    // Context-Pad auf PO öffnen (type-based für Zuverlässigkeit)
    const actions = await modeler.getContextPadActionsByType('fpb:ProcessOperator');

    expect(actions).toContain('delete');
    // PO hat incoming und outgoing → decompose sollte verfügbar sein
    expect(actions).toContain('decompose');
  });

  test('context pad shows connect_usage for TechnicalResource', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createTechnicalResource(POSITIONS.technicalResource);
    await page.waitForTimeout(300);

    // TR ist außerhalb SystemLimit, benutze type-based Zugriff
    const actions = await modeler.getContextPadActionsByType('fpb:TechnicalResource');
    expect(actions).toContain('delete');
    expect(actions).toContain('connect_usage');
  });

  test('deletes a Product element via context pad', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProduct(POSITIONS.product1);
    await page.waitForTimeout(300);

    const shapesBefore = await modeler.countShapes();

    // Product löschen (type-based, da Position unzuverlässig)
    await modeler.deleteByType('fpb:Product');

    const shapesAfter = await modeler.countShapes();
    expect(shapesAfter).toBeLessThan(shapesBefore);
  });

  test('deletes a ProcessOperator element via context pad', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    const shapesBefore = await modeler.countShapes();

    // PO löschen (type-based)
    await modeler.deleteByType('fpb:ProcessOperator');

    const shapesAfter = await modeler.countShapes();
    expect(shapesAfter).toBeLessThan(shapesBefore);
  });

  test('deletes a TechnicalResource element via context pad', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await modeler.createTechnicalResource(POSITIONS.technicalResource);
    await page.waitForTimeout(300);

    const shapesBefore = await modeler.countShapes();

    // TR löschen (type-based)
    await modeler.deleteByType('fpb:TechnicalResource');

    const shapesAfter = await modeler.countShapes();
    expect(shapesAfter).toBeLessThan(shapesBefore);
  });

});
