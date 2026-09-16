// tests/e2e/pages/ImportPage.js

/**
 * Page Object für den JSON-Import und den Zustand des Datenspeichers.
 *
 * Die Import-Tests arbeiten nicht über den Datei-Dialog, sondern feuern das
 * gleiche Event wie ImportModal und die API-Fassade (`FPBJS.import`). So lassen
 * sich gezielt fehlerhafte Modelle laden, ohne Dateien anzufassen.
 */
export class ImportPage {

  constructor(page) {
    this.page = page;
    // Import läuft über setTimeout (UI_INITIALIZATION_DELAY = 2000 ms) und
    // wechselt danach auf den Einstiegsprozess.
    this.importDelay = 3200;
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForFunction(() => window.fpbjs && window.fpbjs.get);
    await this.page.waitForSelector('.djs-palette [data-group=tools]', { timeout: 20000 });
  }

  /**
   * Modell importieren und warten, bis der Wechsel auf den Einstiegsprozess durch ist
   */
  async import(data, delay) {
    await this.page.evaluate((d) => {
      window.fpbjs.get('eventBus').fire('FPBJS.import', { data: d });
    }, data);
    await this.page.waitForTimeout(delay || this.importDelay);
  }

  /**
   * Alle Datenobjekte aller Layer, so wie der Export sie sehen würde
   */
  async elements() {
    return this.page.evaluate(() => {
      window.fpbjs.get('eventBus').fire('dataStore.updateAll', {});
      const out = [];
      window.fpbjs.getProcesses().filter((p) => p && p.process).forEach((p) => {
        (p.elementDataInformation || []).forEach((e) => out.push({
          id: e.id,
          type: e.$type,
          name: e.name,
          incoming: (e.incoming || []).map((x) => (typeof x === 'string' ? x : x.id)),
          outgoing: (e.outgoing || []).map((x) => (typeof x === 'string' ? x : x.id)),
          inTandemWith: (e.inTandemWith || []).map((x) => (typeof x === 'string' ? 'STRING:' + x : x.id)),
          isAssignedTo: (e.isAssignedTo || []).map((x) => (typeof x === 'string' ? 'STRING:' + x : x.id)),
          sourceRef: typeof e.sourceRef === 'string' ? 'STRING:' + e.sourceRef : e.sourceRef && e.sourceRef.id,
          targetRef: typeof e.targetRef === 'string' ? 'STRING:' + e.targetRef : e.targetRef && e.targetRef.id,
          hatDiWaypoints: !!(e.di && e.di.waypoint && e.di.waypoint.length >= 2),
          waypoints: (window.fpbjs.get('elementRegistry').get(e.id) || {}).waypoints?.length || 0,
        }));
      });
      return out;
    });
  }

  async connections() {
    return (await this.elements()).filter((e) => /Flow|Usage/.test(e.type));
  }

  /** Alle Referenzen, die nach dem Import noch IDs statt Objekte sind */
  async unresolvedReferences() {
    const elements = await this.elements();
    const unresolved = [];
    elements.forEach((e) => {
      ['incoming', 'outgoing', 'inTandemWith', 'isAssignedTo'].forEach((key) => {
        e[key].filter((v) => String(v).startsWith('STRING:')).forEach((v) => unresolved.push(`${e.id}.${key} -> ${v}`));
      });
      ['sourceRef', 'targetRef'].forEach((key) => {
        if (String(e[key]).startsWith('STRING:')) unresolved.push(`${e.id}.${key} -> ${e[key]}`);
      });
    });
    return unresolved;
  }

  /** Prozesse im Datenspeicher, inklusive Projektdefinitionen */
  async dataStore() {
    return this.page.evaluate(() => {
      const entries = window.fpbjs.getProcesses();
      return {
        projektdefinitionen: entries.filter((e) => e && e.$type === 'fpb:Project').length,
        prozesse: entries.filter((e) => e && e.process).map((e) => e.process.id),
        prozessMitParent: entries.filter((e) => e && e.process).map((e) => ({
          id: e.process.id,
          parent: e.process.parent && (typeof e.process.parent === 'string' ? e.process.parent : e.process.parent.id || e.process.parent.$type),
        })),
      };
    });
  }

  /** Sichtbarer Text der Prozess-Baumansicht (Panel wird bei Bedarf aufgeklappt) */
  async layerPanelText() {
    return this.page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const button = document.querySelector('#openLayerButton');
      const content = () => document.querySelector('.layerPanel-ProcessOverview-Content');
      if (button && (!content() || !content().textContent.trim())) {
        button.click();
        await sleep(600);
      }
      return content() ? content().textContent.trim() : '';
    });
  }

  async rootProcessId() {
    return this.page.evaluate(() => window.fpbjs.get('canvas').getRootElement().id);
  }

  /** In den ersten dekomponierten Child-Layer wechseln */
  async switchToChildLayer() {
    return this.page.evaluate(async () => {
      const entry = window.fpbjs.getProcesses().filter((p) => p && p.process && p.process.isDecomposedProcessOperator)[0];
      if (!entry) return null;
      const childShape = entry.process.isDecomposedProcessOperator.decomposedView;
      window.fpbjs.get('modeling').switchProcess(childShape);
      await new Promise((r) => setTimeout(r, 300));
      return window.fpbjs.get('canvas').getRootElement().id;
    });
  }

  /** Aus dem aktuellen Child-Layer heraus komponieren */
  async compose() {
    return this.page.evaluate(async () => {
      const systemLimit = window.fpbjs.get('elementRegistry')
        .filter((e) => e.businessObject && e.businessObject.$type === 'fpb:SystemLimit')[0];
      try {
        window.fpbjs.get('modeling').composeProcess(systemLimit);
        await new Promise((r) => setTimeout(r, 300));
        return { ok: true };
      } catch (error) {
        return { ok: false, fehler: String(error.message).split('\n')[0] };
      }
    });
  }
}
