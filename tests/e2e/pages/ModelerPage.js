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
      canvas: '.djs-container',
      svg: '.djs-container svg',
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
    // Warten auf die Palette (wird schneller geladen als SVG)
    await this.page.waitForSelector(this.selectors.palette, {
      state: 'visible',
      timeout: 30000,
    });
    // Kurz warten bis der Canvas vollständig gerendert ist
    await this.page.waitForTimeout(1000);
  }

  // ============================================
  // Element Creation
  // ============================================

  async createSystemLimit(position) {
    await this.clickPaletteAndPlace('Add System Limit', position);
  }

  async createProduct(position) {
    await this.clickPaletteAndPlace('Add Product', position);
  }

  async createEnergy(position) {
    await this.clickPaletteAndPlace('Add Energy', position);
  }

  async createInformation(position) {
    await this.clickPaletteAndPlace('Add Information', position);
  }

  async createProcessOperator(position) {
    await this.clickPaletteAndPlace('Add Process Operator', position);
  }

  async createTechnicalResource(position) {
    await this.clickPaletteAndPlace('Add Technical Resource', position);
  }

  async clickPaletteAndPlace(label, position) {
    // Klicke auf den Palette-Eintrag per Text
    const paletteEntry = this.page.getByTitle(label);
    await paletteEntry.click();

    // Klicke auf den Canvas an der gewünschten Position
    const canvas = this.page.locator(this.selectors.canvas).first();
    await canvas.click({ position });

    // Warten bis Element erstellt
    await this.page.waitForTimeout(300);
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
  // Canvas Position Click
  // ============================================

  /**
   * Klickt auf eine Position im Canvas (z.B. um ein Element zu selektieren)
   */
  async clickCanvasAt(position) {
    const canvas = this.page.locator(this.selectors.canvas).first();
    await canvas.click({ position });
    await this.page.waitForTimeout(300);
  }

  // ============================================
  // Context Pad
  // ============================================

  /**
   * Klickt auf ein Element an einer Canvas-Position und wartet auf Context-Pad
   */
  async openContextPadAt(position) {
    await this.clickCanvasAt(position);
    await this.page.waitForSelector(this.selectors.contextPad, {
      state: 'visible',
      timeout: 5000,
    });
  }

  async openContextPad(elementName) {
    await this.clickElement(elementName);
    await this.page.waitForSelector(this.selectors.contextPad, {
      state: 'visible',
      timeout: 5000,
    });
  }

  async clickContextPadAction(action) {
    const button = this.page.locator(
      `${this.selectors.contextPad} .entry[data-action="${action}"]`
    );
    await button.click();
  }

  async deleteElement(elementName) {
    await this.openContextPad(elementName);
    await this.clickContextPadAction('delete');
    await this.page.waitForTimeout(200);
  }

  // ============================================
  // Connections
  // ============================================

  /**
   * Verbindet zwei Elemente über Context-Pad:
   * 1. Klick auf Quell-Element → Context-Pad öffnet
   * 2. Klick auf Connection-Button im Context-Pad
   * 3. Klick auf Ziel-Element → Verbindung erstellt
   *
   * @param {Object} sourcePos - Position des Quell-Elements {x, y}
   * @param {string} connectionType - 'connect' | 'connect_parallel' | 'connect_alternative' | 'connect_usage'
   * @param {Object} targetPos - Position des Ziel-Elements {x, y}
   */
  async connectElements(sourcePos, connectionType, targetPos) {
    // 1. Quell-Element anklicken → Context-Pad erscheint
    await this.openContextPadAt(sourcePos);

    // 2. Connection-Button im Context-Pad klicken
    await this.clickContextPadAction(connectionType);
    await this.page.waitForTimeout(200);

    // 3. Ziel-Element anklicken → Verbindung wird erstellt
    await this.clickCanvasAt(targetPos);
    await this.page.waitForTimeout(500);
  }

  /**
   * Erstellt eine Flow-Verbindung (Standard)
   */
  async connectWithFlow(sourcePos, targetPos) {
    await this.connectElements(sourcePos, 'connect', targetPos);
  }

  /**
   * Erstellt eine Usage-Verbindung
   */
  async connectWithUsage(sourcePos, targetPos) {
    await this.connectElements(sourcePos, 'connect_usage', targetPos);
  }

  /**
   * Verbindet ein Element (type-based) mit einem Ziel (position-based).
   * Nützlich wenn die Quell-Position unzuverlässig ist.
   *
   * @param {string} sourceType - z.B. 'fpb:Energy'
   * @param {number} sourceIndex - 0-basiert
   * @param {string} connectionType - 'connect' | 'connect_usage'
   * @param {Object} targetPos - Position des Ziel-Elements {x, y}
   */
  async connectByType(sourceType, sourceIndex, connectionType, targetPos) {
    await this.openContextPadByType(sourceType, sourceIndex);
    await this.clickContextPadAction(connectionType);
    await this.page.waitForTimeout(200);
    await this.clickCanvasAt(targetPos);
    await this.page.waitForTimeout(500);
  }

  // ============================================
  // Decompose / Compose (Layer-Navigation)
  // ============================================

  /**
   * Dekomponiert einen ProcessOperator via Context-Pad
   */
  async decomposeAt(position) {
    await this.openContextPadAt(position);
    await this.clickContextPadAction('decompose');
    await this.page.waitForTimeout(1000);
  }

  /**
   * Compose (zurück zum Parent-Layer) via Context-Pad auf SystemLimit
   */
  async composeAt(position) {
    await this.openContextPadAt(position);
    await this.clickContextPadAction('compose');
    await this.page.waitForTimeout(1000);
  }

  /**
   * Compose zurück zum Parent-Layer via SystemLimit (type-based).
   * Zuverlässiger als position-based, da SystemLimit-IDs UUIDs sind.
   */
  async composeToParent() {
    await this.clickByType('fpb:SystemLimit');
    await this.page.waitForSelector(this.selectors.contextPad, {
      state: 'visible',
      timeout: 5000,
    });
    await this.clickContextPadAction('compose');
    await this.page.waitForTimeout(1000);
  }

  /**
   * Dekomponiert den n-ten ProcessOperator via interner API (type-based).
   */
  async decomposeByType(index = 0) {
    await this.clickByType('fpb:ProcessOperator', index);
    await this.page.waitForSelector(this.selectors.contextPad, {
      state: 'visible',
      timeout: 5000,
    });
    await this.clickContextPadAction('decompose');
    await this.page.waitForTimeout(1000);
  }

  // ============================================
  // Confirmation Modal
  // ============================================

  /**
   * Wartet auf den Bestätigungsdialog und bestätigt
   */
  async confirmModal() {
    await this.page.waitForSelector('.modal.show', { timeout: 5000 });
    await this.page.locator('.modal.show .btn-danger').click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Wartet auf den Bestätigungsdialog und bricht ab
   */
  async cancelModal() {
    await this.page.waitForSelector('.modal.show', { timeout: 5000 });
    await this.page.locator('.modal.show .btn-secondary').click();
    await this.page.waitForTimeout(500);
  }

  /**
   * Prüft ob ein Modal sichtbar ist
   */
  async isModalVisible() {
    return await this.page.locator('.modal.show').isVisible();
  }

  /**
   * Liest den Modal-Titel
   */
  async getModalTitle() {
    return await this.page.locator('.modal.show .modal-title').textContent();
  }

  // ============================================
  // Layer Panel
  // ============================================

  /**
   * Öffnet das Layer-Panel (falls geschlossen)
   */
  async openLayerPanel() {
    const panel = this.page.locator('.layerPanel');
    if (!await panel.isVisible()) {
      await this.page.locator('#openLayerButton').click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Wechselt zum Layer mit dem angegebenen Namen
   */
  async switchToLayer(layerName) {
    await this.openLayerPanel();
    await this.page.locator('.arborist-node-content').filter({ hasText: layerName }).click();
    await this.page.waitForTimeout(1000);
  }

  // ============================================
  // Delete via Context-Pad (Position-based)
  // ============================================

  /**
   * Löscht ein Element an einer Canvas-Position via Context-Pad
   */
  async deleteAt(position) {
    await this.openContextPadAt(position);
    await this.clickContextPadAction('delete');
    await this.page.waitForTimeout(500);
  }

  /**
   * Löscht das n-te Element eines bestimmten Typs via Context-Pad
   * @param {string} type - z.B. 'fpb:Product', 'fpb:ProcessOperator'
   * @param {number} index - 0-basiert
   */
  async deleteByType(type, index = 0) {
    await this.clickByType(type, index);
    await this.page.waitForSelector(this.selectors.contextPad, {
      state: 'visible',
      timeout: 5000,
    });
    await this.clickContextPadAction('delete');
    await this.page.waitForTimeout(500);
  }

  // ============================================
  // Element Access by Type (DOM-based)
  // ============================================

  /**
   * Klickt auf das n-te Element eines bestimmten Typs.
   * Nutzt interne Selection-API für zuverlässiges Selektieren + Context-Pad.
   */
  async clickByType(type, index = 0) {
    // Element finden und per Selection-API selektieren
    const found = await this.page.evaluate(({ type, index }) => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      const allElements = [];

      function collectElements(parent) {
        if (parent.children) {
          for (const child of parent.children) {
            allElements.push(child);
            collectElements(child);
          }
        }
      }
      collectElements(root);

      const matching = allElements.filter(e => e.type === type);
      const element = matching[index];
      if (!element) return false;

      // Selection-API nutzen → triggert selection.changed → Context-Pad erscheint
      const selection = window.fpbjs.get('selection');
      selection.select(element);

      // EventBus directClick simulieren für Context-Pad
      const eventBus = window.fpbjs.get('eventBus');
      eventBus.fire('element.click', { element });

      return true;
    }, { type, index });

    if (!found) {
      throw new Error(`Element of type ${type} at index ${index} not found`);
    }

    await this.page.waitForTimeout(300);
  }

  /**
   * Öffnet Context-Pad für das n-te Element eines Typs
   */
  async openContextPadByType(type, index = 0) {
    await this.clickByType(type, index);
    await this.page.waitForSelector(this.selectors.contextPad, {
      state: 'visible',
      timeout: 5000,
    });
  }

  /**
   * Gibt Context-Pad Actions für das n-te Element eines Typs zurück
   */
  async getContextPadActionsByType(type, index = 0) {
    await this.openContextPadByType(type, index);
    return await this._readContextPadActions();
  }

  // ============================================
  // Context-Pad Inspection
  // ============================================

  /**
   * Gibt alle verfügbaren Context-Pad Actions zurück (position-based)
   */
  async getContextPadActions(position) {
    await this.openContextPadAt(position);
    return await this._readContextPadActions();
  }

  /**
   * Liest die aktuell sichtbaren Context-Pad Actions
   */
  async _readContextPadActions() {
    const entries = await this.page.locator(`${this.selectors.contextPad} .entry`).all();
    const actions = [];
    for (const entry of entries) {
      const action = await entry.getAttribute('data-action');
      if (action) actions.push(action);
    }
    return actions;
  }

  // ============================================
  // Connection Access by Index (via internal API)
  // ============================================

  /**
   * Klickt auf die n-te Connection auf dem aktuellen Layer.
   * Sucht rekursiv in allen Kindern (Connections können in SystemLimit sein).
   */
  async clickConnectionByIndex(index = 0) {
    const found = await this.page.evaluate((idx) => {
      const canvas = window.fpbjs.get('canvas');
      const root = canvas.getRootElement();
      const connections = [];

      function collectConnections(parent) {
        if (parent.children) {
          for (const child of parent.children) {
            if (child.waypoints) {
              connections.push(child);
            }
            collectConnections(child);
          }
        }
      }
      collectConnections(root);

      const conn = connections[idx];
      if (!conn) return false;

      const selection = window.fpbjs.get('selection');
      selection.select(conn);

      const eventBus = window.fpbjs.get('eventBus');
      eventBus.fire('element.click', { element: conn });

      return true;
    }, index);

    if (!found) {
      throw new Error(`Connection at index ${index} not found`);
    }

    await this.page.waitForTimeout(300);
  }

  /**
   * Löscht die n-te Connection via Context-Pad
   */
  async deleteConnectionByIndex(index = 0) {
    await this.clickConnectionByIndex(index);
    await this.page.waitForSelector(this.selectors.contextPad, {
      state: 'visible',
      timeout: 5000,
    });
    await this.clickContextPadAction('delete');
    await this.page.waitForTimeout(500);
  }

  // ============================================
  // Element Counting
  // ============================================

  async countShapes() {
    return await this.page.locator('.djs-element.djs-shape').count();
  }

  async countConnections() {
    return await this.page.locator('.djs-connection').count();
  }

  // ============================================
  // Label Editing
  // ============================================

  /**
   * Doppelklickt auf eine Position und gibt einen neuen Namen ein
   */
  async renameElementAt(position, newName) {
    const canvas = this.page.locator(this.selectors.canvas).first();
    await canvas.dblclick({ position });
    await this.page.waitForTimeout(300);

    // Direct-Editing textarea/input finden
    const editBox = this.page.locator('.djs-direct-editing-content');
    await editBox.waitFor({ state: 'visible', timeout: 3000 });
    await editBox.fill(newName);

    // Bestätigen via Klick außerhalb
    await canvas.click({ position: { x: 10, y: 10 } });
    await this.page.waitForTimeout(300);
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
    const canvas = this.page.locator(this.selectors.canvas).first();
    await canvas.screenshot({
      path: `tests/e2e/screenshots/${name}.png`,
    });
  }

}

export default ModelerPage;
