// tests/e2e/pages/ModelerPage.js

/**
 * Page Object für den FPB.JS Modeler
 * Kapselt alle Interaktionen mit der Modeler-Oberfläche
 */
export class ModelerPage {

  constructor(page) {
    this.page = page;

    // Selektoren für wichtige UI-Elemente
    this.selectors = {
      canvas: '#modeler-container .djs-container',
      svg: '#modeler-container svg.djs-svg',
      palette: '.djs-palette',
      contextPad: '.djs-context-pad',
      propertiesPanel: '#properties-container',
      layerPanel: '#layer-container',
    };
  }

  // ============================================
  // Navigation
  // ============================================

  async goto() {
    await this.page.goto('/');
    await this.page.waitForSelector(this.selectors.svg, {
      state: 'visible',
      timeout: 10000,
    });
    // Kurz warten bis alles gerendert ist
    await this.page.waitForTimeout(500);
  }

  // ============================================
  // Element Creation
  // ============================================

  async createProduct(position) {
    await this.dragFromPalette('create.fpb-product', position);
  }

  async createEnergy(position) {
    await this.dragFromPalette('create.fpb-energy', position);
  }

  async createInformation(position) {
    await this.dragFromPalette('create.fpb-information', position);
  }

  async createProcessOperator(position) {
    await this.dragFromPalette('create.fpb-processoperator', position);
  }

  async createTechnicalResource(position) {
    await this.dragFromPalette('create.fpb-technicalresource', position);
  }

  async dragFromPalette(action, position) {
    const paletteEntry = this.page.locator(
      `${this.selectors.palette} [data-action="${action}"]`
    );
    const canvas = this.page.locator(this.selectors.canvas);

    await paletteEntry.dragTo(canvas, {
      targetPosition: position,
    });

    // Warten bis Element erstellt
    await this.page.waitForTimeout(200);
  }

  // ============================================
  // Element Selection & Interaction
  // ============================================

  async clickElement(nameOrSelector) {
    const element = await this.findElement(nameOrSelector);
    await element.click();
  }

  async doubleClickElement(nameOrSelector) {
    const element = await this.findElement(nameOrSelector);
    await element.dblclick();
  }

  async findElement(nameOrSelector) {
    // Versuche zuerst nach Text zu finden
    let element = this.page.locator(
      `${this.selectors.svg} .djs-element:has-text("${nameOrSelector}")`
    );

    if (await element.count() === 0) {
      // Fallback: Direkter Selektor
      element = this.page.locator(nameOrSelector);
    }

    return element;
  }

  // ============================================
  // Context Pad
  // ============================================

  async openContextPad(elementName) {
    await this.clickElement(elementName);
    await this.page.waitForSelector(this.selectors.contextPad, {
      state: 'visible',
      timeout: 2000,
    });
  }

  async clickContextPadAction(action) {
    const button = this.page.locator(
      `${this.selectors.contextPad} [data-action="${action}"]`
    );
    await button.click();
  }

  async deleteElement(elementName) {
    await this.openContextPad(elementName);
    await this.clickContextPadAction('delete');
    await this.page.waitForTimeout(200);
  }

  // ============================================
  // Keyboard Actions
  // ============================================

  async undo() {
    await this.page.keyboard.press('Control+z');
    await this.page.waitForTimeout(100);
  }

  async redo() {
    await this.page.keyboard.press('Control+y');
    await this.page.waitForTimeout(100);
  }

  async deleteSelected() {
    await this.page.keyboard.press('Delete');
    await this.page.waitForTimeout(100);
  }

  // ============================================
  // Assertions
  // ============================================

  async expectElementExists(name) {
    const element = this.page.locator(
      `${this.selectors.svg} .djs-element:has-text("${name}")`
    );
    await expect(element).toBeVisible({ timeout: 2000 });
  }

  async expectElementNotExists(name) {
    const element = this.page.locator(
      `${this.selectors.svg} .djs-element:has-text("${name}")`
    );
    await expect(element).not.toBeVisible({ timeout: 2000 });
  }

  async expectContextPadVisible() {
    const pad = this.page.locator(this.selectors.contextPad);
    await expect(pad).toBeVisible();
  }

  async expectContextPadHidden() {
    const pad = this.page.locator(this.selectors.contextPad);
    await expect(pad).not.toBeVisible();
  }

  // ============================================
  // Screenshots & Visual
  // ============================================

  async takeScreenshot(name) {
    await this.page.screenshot({
      path: `tests/e2e/screenshots/${name}.png`,
      fullPage: false,
    });
  }

  async takeCanvasScreenshot(name) {
    const canvas = this.page.locator(this.selectors.canvas);
    await canvas.screenshot({
      path: `tests/e2e/screenshots/${name}.png`,
    });
  }

}

export default ModelerPage;
