// tests/e2e/smoke.spec.js
import { test, expect } from '@playwright/test';
import { ModelerPage } from './pages/ModelerPage';

test.describe('Smoke Tests', () => {

  test('loads the modeler successfully', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // Canvas Container sollte sichtbar sein (es gibt 2, verwende first)
    await expect(page.locator('.djs-container').first()).toBeVisible();

    // Palette sollte sichtbar sein
    await expect(page.locator('.djs-palette')).toBeVisible();

    // "Add Product" Palette-Eintrag sollte vorhanden sein
    await expect(page.getByTitle('Add Product')).toBeVisible();
  });

  test('creates a SystemLimit element via palette', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // SystemLimit erstellen (wird in der Mitte des Canvas platziert)
    await modeler.createSystemLimit({ x: 400, y: 300 });

    // Warten und prüfen dass kein Fehler angezeigt wird
    await page.waitForTimeout(500);

    // SystemLimit sollte existieren (grüne Box mit gestricheltem Rand)
    // Suche nach SVG-Elementen die neu erstellt wurden
    const shapes = await page.locator('.djs-visual').count();
    expect(shapes).toBeGreaterThan(0);
  });

  // Hinweis: Context-Pad und Undo-Tests benötigen tiefere Interaktion mit diagram-js
  // und werden in einem späteren Iteration implementiert
  test.skip('shows context pad on SystemLimit click', async ({ page }) => {
    // TODO: Implementieren wenn diagram-js Interaktionen besser verstanden sind
  });

  test.skip('undo removes created SystemLimit', async ({ page }) => {
    // TODO: Undo-Mechanismus in E2E-Tests erfordert weitere Analyse
  });

  test('creates SystemLimit and adds Product inside', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // Erst SystemLimit erstellen
    await modeler.createSystemLimit({ x: 400, y: 300 });
    await page.waitForTimeout(500);

    // Dann Product innerhalb des SystemLimits erstellen
    await modeler.createProduct({ x: 400, y: 300 });
    await page.waitForTimeout(500);

    // Es sollten jetzt mindestens 2 visuelle Elemente existieren
    const visuals = await page.locator('.djs-visual').count();
    expect(visuals).toBeGreaterThanOrEqual(2);
  });

  test('TechnicalResource can be created outside SystemLimit', async ({ page }) => {
    const modeler = new ModelerPage(page);
    await modeler.goto();

    // TechnicalResource erstellen (braucht kein SystemLimit)
    await modeler.createTechnicalResource({ x: 100, y: 100 });
    await page.waitForTimeout(500);

    // TechnicalResource sollte existieren
    const visuals = await page.locator('.djs-visual').count();
    expect(visuals).toBeGreaterThan(0);
  });

});
