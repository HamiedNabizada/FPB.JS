// tests/e2e/full-model.spec.js
import { test, expect } from '@playwright/test';
import { ModelerPage } from './pages/ModelerPage';

/**
 * Vollständiger FPB-Modellierungstest nach VDI 3682
 *
 * Zielmodell:
 *
 *                          SystemLimit
 *     ┌─────────────────────────────────────────────────┐
 *     │                                                 │
 *   Product ──Flow──→ ProcessOperator ──Flow──→ Product │
 *   (Input)           │                       (Output)  │
 *     │               │                         │       │
 *   Energy ──Flow──→  │               ──Flow──→ Energy  │
 *   (Input)           │                       (Output)  │
 *     │               │                         │       │
 *     └───────────────┼─────────────────────────────────┘
 *                     │
 *                   Usage
 *                     │
 *              TechnicalResource
 */

// Positionen für die Elemente (relativ zum Canvas)
// SystemLimit wird groß erstellt (Standard: 650x700)
//
// VDI 3682 Layout (von oben nach unten):
//   Input-States (oben) → ProcessOperator (Mitte) → Output-States (unten)
//
// Wichtig: ProcessOperator muss UNTERHALB der Input-States sein
//   (noOfElementsUnderTheSource prüft: element.y > source.y + 50)
const POSITIONS = {
  systemLimit:       { x: 500, y: 400 },
  inputProduct:      { x: 350, y: 150 },
  inputEnergy:       { x: 500, y: 150 },
  processOperator:   { x: 450, y: 350 },
  outputProduct:     { x: 350, y: 550 },
  outputEnergy:      { x: 500, y: 550 },
  technicalResource: { x: 900, y: 350 },
};

test.describe('Complete FPB Model', () => {

  test('creates a full VDI 3682 process model', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // ============================================
    // Schritt 1: SystemLimit erstellen
    // ============================================
    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);

    // Prüfen: Mindestens 1 visuelles Element
    const shapesAfterSL = await page.locator('.djs-visual').count();
    expect(shapesAfterSL).toBeGreaterThan(0);

    // ============================================
    // Schritt 2: Input-States erstellen (innerhalb SystemLimit)
    // ============================================
    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);

    await modeler.createEnergy(POSITIONS.inputEnergy);
    await page.waitForTimeout(300);

    // ============================================
    // Schritt 3: ProcessOperator erstellen (innerhalb SystemLimit)
    // ============================================
    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    // ============================================
    // Schritt 4: Output-States erstellen (innerhalb SystemLimit)
    // ============================================
    await modeler.createProduct(POSITIONS.outputProduct);
    await page.waitForTimeout(300);

    await modeler.createEnergy(POSITIONS.outputEnergy);
    await page.waitForTimeout(300);

    // Prüfen: Jetzt sollten mindestens 6 Shapes existieren
    // (SystemLimit + 2 Input + PO + 2 Output)
    const shapesAfterAll = await page.locator('.djs-element').count();
    expect(shapesAfterAll).toBeGreaterThanOrEqual(6);

    // Screenshot für Debugging
    await modeler.takeCanvasScreenshot('01-elements-created');

    // ============================================
    // Schritt 5: TechnicalResource erstellen (außerhalb SystemLimit)
    // ============================================
    await modeler.createTechnicalResource(POSITIONS.technicalResource);
    await page.waitForTimeout(300);

    await modeler.takeCanvasScreenshot('02-with-technical-resource');
  });

  test('connects elements with flows', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // Erst Elemente erstellen
    await modeler.createSystemLimit(POSITIONS.systemLimit);
    await page.waitForTimeout(500);

    await modeler.createProduct(POSITIONS.inputProduct);
    await page.waitForTimeout(300);

    await modeler.createProcessOperator(POSITIONS.processOperator);
    await page.waitForTimeout(300);

    await modeler.createProduct(POSITIONS.outputProduct);
    await page.waitForTimeout(300);

    await modeler.takeCanvasScreenshot('03-before-connections');

    // ============================================
    // Schritt 6: Input Product → ProcessOperator verbinden
    // ============================================
    await modeler.connectWithFlow(
      POSITIONS.inputProduct,
      POSITIONS.processOperator
    );

    await modeler.takeCanvasScreenshot('04-after-first-connection');

    // Prüfen: Connection sollte existieren (SVG path)
    const connections = await page.locator('.djs-connection').count();
    expect(connections).toBeGreaterThanOrEqual(1);

    // ============================================
    // Schritt 7: ProcessOperator → Output Product verbinden
    // ============================================
    await modeler.connectWithFlow(
      POSITIONS.processOperator,
      POSITIONS.outputProduct
    );

    await modeler.takeCanvasScreenshot('05-after-second-connection');

    // Prüfen: Jetzt mindestens 2 Connections
    const connectionsAfter = await page.locator('.djs-connection').count();
    expect(connectionsAfter).toBeGreaterThanOrEqual(2);
  });

});
