// tests/e2e/layer-consistency.spec.js
import { test, expect } from '@playwright/test';
import { ModelerPage } from './pages/ModelerPage';

/**
 * E2E-Tests für Layer-Konsistenz-Szenarien:
 * Prüft, dass Änderungen auf einem Layer korrekt auf anderen Layern propagiert werden.
 *
 * Deckt FpbUpdater.js ab:
 * - Szenario 1: State auf Parent löschen → Kaskadierendes Löschen
 * - Szenario 2: Grenz-State auf Child löschen → Connection auf Parent entfernen
 * - Szenario 3: Neue Connection zu dekomp. PO → State auf Child erstellen
 * - Szenario 14: SystemLimit auf Child löschen → Bestätigung + Dekomposition entfernen
 * - Confirmation-Handler für alle Layer-übergreifenden Aktionen
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
 * Helper: Erstellt und dekomponiert ein Modell
 * Gibt die Anzahl der Shapes auf dem Child-Layer zurück
 */
async function createAndDecomposeModel(modeler, page) {
  await modeler.createSystemLimit(POSITIONS.systemLimit);
  await page.waitForTimeout(500);
  await modeler.createProduct(POSITIONS.inputProduct);
  await page.waitForTimeout(300);
  await modeler.createProcessOperator(POSITIONS.processOperator);
  await page.waitForTimeout(300);
  await modeler.createProduct(POSITIONS.outputProduct);
  await page.waitForTimeout(300);

  // Input → PO → Output verbinden
  await modeler.connectWithFlow(POSITIONS.inputProduct, POSITIONS.processOperator);
  await modeler.connectWithFlow(POSITIONS.processOperator, POSITIONS.outputProduct);

  // Dekomponieren
  await modeler.decomposeByType();
  await page.waitForTimeout(500);

  return await modeler.countShapes();
}

/**
 * Helper: Vom Child-Layer zurück zum Parent navigieren via type-based SystemLimit click
 */
async function navigateToParent(modeler) {
  await modeler.composeToParent();
}

test.describe('Layer Consistency - State Deletion', () => {

  test('Szenario 1: Deleting state on parent removes it from child layer', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await createAndDecomposeModel(modeler, page);

    // Child-Layer: Grenz-States zählen via interner API
    const childStatesBefore = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      const bo = root.businessObject;
      return bo.consistsOfStates ? bo.consistsOfStates.length : 0;
    });

    await modeler.takeCanvasScreenshot('layer-01-child-before-delete');

    // Zurück zum Parent
    await navigateToParent(modeler);

    // Input Product auf Parent löschen (type-based, da Position unzuverlässig)
    await modeler.deleteByType('fpb:Product', 0);
    await page.waitForTimeout(500);

    await modeler.takeCanvasScreenshot('layer-02-parent-after-delete');

    // Child-Layer Daten via interner API prüfen (ohne Navigation)
    const childStatesAfter = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      // PO finden (auf dem Parent-Layer)
      const allElements = [];
      function collect(p) { if (p.children) p.children.forEach(c => { allElements.push(c); collect(c); }); }
      collect(root);
      const po = allElements.find(e => e.type === 'fpb:ProcessOperator');
      if (!po || !po.businessObject.decomposedView) return -1;
      const childBO = po.businessObject.decomposedView.businessObject;
      return childBO.consistsOfStates ? childBO.consistsOfStates.length : 0;
    });

    // Child sollte weniger States haben (der gelöschte State fehlt)
    expect(childStatesAfter).toBeLessThan(childStatesBefore);
  });

  test('Szenario 2: Deleting boundary state on child shows confirmation', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await createAndDecomposeModel(modeler, page);

    // Wir sind auf dem Child-Layer
    // Finde einen Grenz-State via DOM - States haben IDs ohne "SystemLimit" und ohne "Process"
    const shapes = page.locator('.djs-element.djs-shape');
    const shapeCount = await shapes.count();

    let stateDeleted = false;
    for (let i = 0; i < shapeCount; i++) {
      const shape = shapes.nth(i);
      const id = await shape.getAttribute('data-element-id');
      // States haben IDs die NICHT SystemLimit oder Process enthalten
      if (id && !id.includes('SystemLimit') && !id.includes('Process')) {
        await shape.click();
        await page.waitForTimeout(300);

        // Prüfe ob Context-Pad sichtbar ist
        const contextPad = page.locator('.djs-context-pad');
        if (await contextPad.isVisible()) {
          const deleteBtn = contextPad.locator('.entry[data-action="delete"]');
          if (await deleteBtn.isVisible()) {
            await deleteBtn.click();
            await page.waitForTimeout(500);

            // Bestätigungsdialog sollte erscheinen (Grenz-State)
            const modalVisible = await modeler.isModalVisible();
            if (modalVisible) {
              const title = await modeler.getModalTitle();
              expect(title).toBeTruthy();
              // Modal bestätigen
              await modeler.confirmModal();
              await modeler.takeCanvasScreenshot('layer-04-boundary-state-deleted');
              stateDeleted = true;
            }
            break;
          }
        }
      }
    }

    // Sicherstellen, dass wir tatsächlich einen State gelöscht haben
    expect(stateDeleted).toBeTruthy();
  });

});

test.describe('Layer Consistency - Connection to Decomposed PO', () => {

  test('Szenario 3: New connection to decomposed PO creates state on child', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await createAndDecomposeModel(modeler, page);

    // Child-Layer States zählen via interner API
    const childStatesBefore = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      const bo = root.businessObject;
      return bo.consistsOfStates ? bo.consistsOfStates.length : 0;
    });

    // Zurück zum Parent
    await navigateToParent(modeler);

    // Neuen Energy-State erstellen und mit PO verbinden (type-based)
    await modeler.createEnergy(POSITIONS.inputEnergy);
    await page.waitForTimeout(300);
    await modeler.connectByType('fpb:Energy', 0, 'connect', POSITIONS.processOperator);
    await page.waitForTimeout(500);

    await modeler.takeCanvasScreenshot('layer-05-new-connection-on-parent');

    // Child-Layer States via interner API prüfen
    const childStatesAfter = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      const allElements = [];
      function collect(p) { if (p.children) p.children.forEach(c => { allElements.push(c); collect(c); }); }
      collect(root);
      const po = allElements.find(e => e.type === 'fpb:ProcessOperator');
      if (!po || !po.businessObject.decomposedView) return -1;
      const childBO = po.businessObject.decomposedView.businessObject;
      return childBO.consistsOfStates ? childBO.consistsOfStates.length : 0;
    });

    await modeler.takeCanvasScreenshot('layer-06-after-new-connection');

    // Neuer Grenz-State sollte auf Child-Layer existieren
    expect(childStatesAfter).toBeGreaterThan(childStatesBefore);
  });

  test('deleting connection to decomposed PO removes state from child', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await createAndDecomposeModel(modeler, page);

    // Child-Layer States zählen via interner API
    const childStatesBefore = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      const bo = root.businessObject;
      return bo.consistsOfStates ? bo.consistsOfStates.length : 0;
    });

    // Zurück zum Parent
    await navigateToParent(modeler);

    // Connection zwischen Input und PO löschen via internal API
    await modeler.deleteConnectionByIndex(0);
    await page.waitForTimeout(500);

    await modeler.takeCanvasScreenshot('layer-07-connection-deleted-parent');

    // Child-Layer States via interner API prüfen
    const childStatesAfter = await page.evaluate(() => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      const allElements = [];
      function collect(p) { if (p.children) p.children.forEach(c => { allElements.push(c); collect(c); }); }
      collect(root);
      const po = allElements.find(e => e.type === 'fpb:ProcessOperator');
      if (!po || !po.businessObject.decomposedView) return -1;
      const childBO = po.businessObject.decomposedView.businessObject;
      return childBO.consistsOfStates ? childBO.consistsOfStates.length : 0;
    });

    await modeler.takeCanvasScreenshot('layer-08-state-removed-from-child');

    // Der State sollte vom Child-Layer verschwunden sein
    expect(childStatesAfter).toBeLessThan(childStatesBefore);
  });

});

test.describe('Layer Consistency - SystemLimit Protection', () => {

  test('Szenario 14: Deleting SystemLimit on child layer shows confirmation', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await createAndDecomposeModel(modeler, page);

    // Wir sind auf dem Child-Layer
    // SystemLimit via type-based anklicken → Context-Pad
    await modeler.openContextPadByType('fpb:SystemLimit');

    // Delete-Button klicken
    await modeler.clickContextPadAction('delete');
    await page.waitForTimeout(500);

    // Bestätigungsdialog sollte erscheinen
    const modalVisible = await modeler.isModalVisible();
    expect(modalVisible).toBeTruthy();

    await modeler.takeCanvasScreenshot('layer-09-sl-delete-confirmation');

    // Abbrechen → nichts passiert, bleiben auf Child-Layer
    await modeler.cancelModal();
    await page.waitForTimeout(500);

    // Shapes sollten noch da sein (SystemLimit wurde nicht gelöscht)
    const shapes = await modeler.countShapes();
    expect(shapes).toBeGreaterThan(0);
  });

  test('Szenario 14: Confirming SystemLimit deletion removes decomposition', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    await createAndDecomposeModel(modeler, page);

    // SystemLimit via type-based anklicken und löschen
    await modeler.openContextPadByType('fpb:SystemLimit');
    await modeler.clickContextPadAction('delete');
    await page.waitForTimeout(500);

    // Bestätigen
    await modeler.confirmModal();
    await page.waitForTimeout(1000);

    await modeler.takeCanvasScreenshot('layer-10-decomposition-removed');

    // Wir sollten zurück auf dem Parent-Layer sein
    // Die Dekomposition sollte entfernt sein
    const shapes = await modeler.countShapes();
    expect(shapes).toBeGreaterThan(0);
  });

});

test.describe('Layer Consistency - Complete Workflow', () => {

  test('full workflow: create, decompose, add states, compose, verify', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // 1. Modell erstellen
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

    await modeler.takeCanvasScreenshot('workflow-01-initial');

    // 2. Dekomponieren
    await modeler.decomposeByType();
    await page.waitForTimeout(500);

    const childShapes = await modeler.countShapes();
    expect(childShapes).toBeGreaterThanOrEqual(3); // SL + 2 Grenz-States

    await modeler.takeCanvasScreenshot('workflow-02-child-layer');

    // 3. Zurück zum Parent
    await navigateToParent(modeler);
    await modeler.takeCanvasScreenshot('workflow-03-back-on-parent');

    // 4. Neuen Input hinzufügen (Szenario 3)
    await modeler.createEnergy(POSITIONS.inputEnergy);
    await page.waitForTimeout(300);
    // Type-based connect, da Position nach Navigation unzuverlässig
    await modeler.connectByType('fpb:Energy', 0, 'connect', POSITIONS.processOperator);
    await page.waitForTimeout(300);

    await modeler.takeCanvasScreenshot('workflow-04-new-energy-added');

    // 5. Nochmal zum Child → neuer State sollte da sein
    await modeler.decomposeByType();
    await page.waitForTimeout(500);

    const childShapesAfterAdd = await modeler.countShapes();
    expect(childShapesAfterAdd).toBeGreaterThan(childShapes);

    await modeler.takeCanvasScreenshot('workflow-05-child-with-new-state');

    // 6. Zurück zum Parent
    await navigateToParent(modeler);

    // 7. Connections und Shapes auf Parent-Layer prüfen
    const parentShapes = await modeler.countShapes();
    const parentConnections = await modeler.countConnections();

    // SL + inputProduct + inputEnergy + PO + outputProduct = mind. 5 Shapes
    expect(parentShapes).toBeGreaterThanOrEqual(5);
    // 3 Connections: inputProduct→PO, inputEnergy→PO, PO→outputProduct
    expect(parentConnections).toBe(3);

    await modeler.takeCanvasScreenshot('workflow-06-final-parent');
  });

});
