// tests/e2e/smoke.spec.js
import { test, expect } from '@playwright/test';
import { ModelerPage } from './pages/ModelerPage';

test.describe('Smoke Tests', () => {

  test('loads the modeler successfully', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // Canvas sollte sichtbar sein
    await expect(page.locator('#modeler-container')).toBeVisible();

    // SVG sollte gerendert sein
    await expect(page.locator('svg.djs-svg')).toBeVisible();

    // Palette sollte sichtbar sein
    await expect(page.locator('.djs-palette')).toBeVisible();
  });

  test('creates a Product element via palette drag', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // Zähle Elemente vorher
    const countBefore = await page.locator('.djs-shape').count();

    // Product erstellen
    await modeler.createProduct({ x: 300, y: 200 });

    // Es sollten mehr Shapes vorhanden sein
    const countAfter = await page.locator('.djs-shape').count();
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test('shows context pad on element click', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // Product erstellen
    await modeler.createProduct({ x: 300, y: 200 });

    // Auf das erstellte Element klicken (letztes .djs-shape)
    await page.locator('.djs-shape').last().click();

    // Context Pad sollte erscheinen
    await expect(page.locator('.djs-context-pad')).toBeVisible();
  });

  test('undo removes created element', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // Zähle Shapes vorher
    const countBefore = await page.locator('.djs-shape').count();

    // Element erstellen
    await modeler.createProduct({ x: 300, y: 200 });

    // Zähle nachher
    const countAfter = await page.locator('.djs-shape').count();
    expect(countAfter).toBeGreaterThan(countBefore);

    // Undo
    await modeler.undo();

    // Sollte wieder wie vorher sein
    const countUndo = await page.locator('.djs-shape').count();
    expect(countUndo).toBe(countBefore);
  });

  test('creates multiple element types', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // Verschiedene Elemente erstellen
    await modeler.createProduct({ x: 150, y: 150 });
    await modeler.createEnergy({ x: 250, y: 150 });
    await modeler.createInformation({ x: 350, y: 150 });
    await modeler.createProcessOperator({ x: 250, y: 250 });
    await modeler.createTechnicalResource({ x: 250, y: 350 });

    // Screenshot für visuelle Verifikation
    await modeler.takeCanvasScreenshot('multiple-elements');

    // Mindestens 5 neue Shapes sollten vorhanden sein
    // (Plus SystemLimit das beim Start erstellt wird)
    const shapes = await page.locator('.djs-shape').count();
    expect(shapes).toBeGreaterThanOrEqual(6);
  });

  test('deletes element via context pad', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // Element erstellen
    await modeler.createProduct({ x: 300, y: 200 });
    const countAfterCreate = await page.locator('.djs-shape').count();

    // Element anklicken und löschen
    await page.locator('.djs-shape').last().click();
    await page.locator('.djs-context-pad [data-action="delete"]').click();

    // Element sollte weg sein
    const countAfterDelete = await page.locator('.djs-shape').count();
    expect(countAfterDelete).toBeLessThan(countAfterCreate);
  });

});
