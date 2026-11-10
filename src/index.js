// FpbJS Library Entry Point
// This entry point provides both server-side and browser compatibility

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// Event mapping: clean external API names → internal diagram-js event names
const EVENT_MAP = {
  'changed':          'commandStack.changed',
  'element.added':    ['shape.added', 'connection.added'],
  'element.removed':  ['shape.removed', 'connection.removed'],
  'element.changed':  'element.changed',
  'selection.changed': 'selection.changed',
  'process.switched':  'layerPanel.processSwitched',
};

// Placeholders from 1.x that only throw, in Node and in the browser alike.
// They go in 3.0 (032a V10); the real classes come from getClasses().
const placeholder = (name) => `${name} is a placeholder that goes in 3.0: create the modeler with createFpbModeler() in a browser environment, or take the class from getClasses().`;

class FpbModelerStub {
  constructor() {
    throw new Error(placeholder('FpbModeler'));
  }
}

class PropertiesPanelStub {
  constructor() {
    throw new Error(placeholder('PropertiesPanel'));
  }
}

class LayerOverviewStub {
  constructor() {
    throw new Error(placeholder('LayerOverview'));
  }
}

/** @deprecated since 2.1, removed in 3.0: use createFpbModeler() or getClasses() */
export const FpbModeler = FpbModelerStub;
/** @deprecated since 2.1, removed in 3.0: use createFpbModeler() or getClasses() */
export const PropertiesPanel = PropertiesPanelStub;
/** @deprecated since 2.1, removed in 3.0: use createFpbModeler() or getClasses() */
export const LayerOverview = LayerOverviewStub;

import { collectProcessShapes, findProcessShape, findLayerOf, layerHasElement } from './processShapes';
import { RULES } from '../app/fpb/validation/ModelChecker';
import { serializeModel } from '../app/fpb/export/serializeModel';
import { translateMessage } from '../app/fpb/i18n/language';
import { createImportError } from '../app/fpb/importer/ImportErrors';

// Automatic layout works on plain JSON, so it is available without a browser.
export { layoutImportData, needsLayout } from '../app/fpb/layout/AutoLayout';

/** @deprecated since 2.1, removed in 3.0: getClasses().defaultConfig is the built-in config */
export const defaultConfig = {};

// 2.0 (016b T8): the properties panel has no config; an old one is answered once
let propertiesConfigWarned = false;
function warnPropertiesConfig() {
  if (!propertiesConfigWarned) {
    propertiesConfigWarned = true;
    console.warn('FPB.js 2.0: the option propertiesConfig is no longer used. A properties panel appears when propertiesContainer is passed; for the New model button use showNewModel.');
  }
}

// Main factory function that dynamically loads modules only in browser
export async function createFpbModeler(options = {}) {
  if (!isBrowser) {
    throw new Error('createFpbModeler requires a browser environment with DOM support');
  }

  // Dynamic imports that only execute in browser
  const [
    { default: FpbModeler },
    { default: PropertiesPanel },
    { default: LayerOverview },
    { default: XMLMapper },
    configModule
  ] = await Promise.all([
    import('../app/fpb/FpbModeler'),
    import('../app/fpb/properties-panel'),
    import('../app/fpb/toolbar'),
    import('../app/fpb/xml/XMLMapper'),
    import('../app/config.json')
  ]);

  const {
    container,
    propertiesContainer,
    layerContainer,
    config = configModule.default || configModule,
    propertiesConfig,
    showNewModel = false,
    readOnly = false,
    ...modelingOptions
  } = options;

  if (propertiesConfig !== undefined) {
    warnPropertiesConfig();
  }

  if (!container) {
    throw new Error('Container element is required');
  }

  // Create the main modeler
  const modeler = new FpbModeler({
    container,
    configFile: config,
    ...modelingOptions
  });

  // before the panels are built, so no field is editable for a moment
  const readOnlyMode = modeler.get('readOnly');
  readOnlyMode.set(readOnly);

  // Set up properties panel if container provided
  let propertiesPanel = null;
  if (propertiesContainer) {
    propertiesPanel = new PropertiesPanel({
      container: propertiesContainer,
      modeler
    });
  }

  // the toolbar (016f E1), still called layer overview towards hosts
  let layerOverview = null;
  if (layerContainer) {
    layerOverview = new LayerOverview({
      container: layerContainer,
      modeler,
      showNewModel
    });
  }

  // a theme the host sets reaches the panels as well (016c T5); a host may
  // leave the theme module out (016g E1)
  const theme = modeler.get('fpbTheme', false);
  if (theme) {
    theme.addContainer(propertiesContainer);
    theme.addContainer(layerContainer);
  }
  // lang on the panels as on the canvas (016h T8); a host's own translate
  // may leave the language module out
  const i18n = modeler.get('fpbI18n', false);
  if (i18n) {
    i18n.addContainer(propertiesContainer);
    i18n.addContainer(layerContainer);
  }

  // Get DI services for facade methods
  const eventBus = modeler.get('eventBus');
  const canvas = modeler.get('canvas');
  const selection = modeler.get('selection');
  const elementRegistry = modeler.get('elementRegistry');
  const modeling = modeler.get('modeling');
  const xmlMapper = new XMLMapper();
  const listeners = createListenerRegistry();
  const importer = modeler.get('jsonImporter', false);

  function removeListener(event, callback) {
    const listener = listeners.unwrap(event, callback);
    if (!listener) {
      return;
    }
    const mapped = EVENT_MAP[event];
    if (Array.isArray(mapped)) {
      mapped.forEach(e => eventBus.off(e, listener));
    } else {
      eventBus.off(mapped || event, listener);
    }
  }

  /** The findings of a model check run now, as plain data */
  function checkNow() {
    const validation = modeler.get('fpbValidation', false);
    const translate = modeler.get('translate');
    return validation ? validation.run().map((issue) => plainFinding(issue, translate)) : [];
  }

  /**
   * Start an import with `start` (which fires FPBJS.import) and wait for its
   * run (032a V1): { warnings, findings } once the model is on the canvas.
   */
  function runImport(start) {
    const before = importer ? importer.getLastRun() : 0;
    start();
    const run = importer ? importer.getLastRun() : before;
    if (run === before) {
      return Promise.reject(createImportError({ message: 'No importer took the import', code: 'NOT_STARTED' }));
    }
    return importer.whenSettled(run).then(({ warnings }) => ({ warnings, findings: checkNow() }));
  }

  /**
   * A file that cannot be read (broken XML or AML, no AML module) never
   * reaches the importer, so no import.error says so. A host of 2.0 that
   * ignores the promise and listens to import.error heard nothing, and the
   * promise is quiet (2.1.1). An FpbImportError comes from the importer,
   * which reported it already.
   */
  function reportUnread(promise) {
    return promise.catch((error) => {
      if (!error || error.name !== 'FpbImportError') {
        const translate = modeler.get('translate');
        eventBus.fire('import.error', {
          message: translate('Import failed'),
          details: translate('An error occurred during import: {message}', { message: (error && error.message) || String(error) })
        });
      }
      throw error;
    });
  }

  // Fit viewport by default
  canvas.zoom('fit-viewport');

  return {
    // Backward-compatible properties
    modeler,
    propertiesPanel,
    layerOverview,

    // --- Event API ---

    /** Returns a function that removes the listener again (032a V3) */
    on(event, callback) {
      // The event bus stops an event at the first listener that returns a
      // value; a host callback such as `() => dirty = true` would silently
      // cut off the modeler's own listeners. Hosts only observe.
      const listener = listeners.wrap(event, callback);
      const mapped = EVENT_MAP[event];
      if (Array.isArray(mapped)) {
        mapped.forEach(e => eventBus.on(e, listener));
      } else {
        eventBus.on(mapped || event, listener);
      }
      return () => removeListener(event, callback);
    },

    off(event, callback) {
      removeListener(event, callback);
    },

    fire(event, data) {
      return eventBus.fire(event, data);
    },

    // --- Import/Export API ---

    /**
     * Resolves when the model is on the canvas, with { warnings, findings };
     * rejects with an FpbImportError (code, details) when the content is
     * refused or a newer import replaced the model first (032a V1).
     */
    importJSON(json) {
      return quiet(runImport(() => eventBus.fire('FPBJS.import', { data: json })));
    },

    /** Start over with an empty model (also clears the browser backup, if on) */
    newModel() {
      modeler.newModel();
    },

    /**
     * True if the model has changes that are in no file (032a V5): false after
     * an import, New model and markSaved, true after an edit or a restored
     * backup. 'model.dirtyChanged' ({ dirty }) says when it flips.
     */
    isDirty() {
      const changes = modeler.get('fpbChanges', false);
      return changes ? changes.isDirty() : false;
    },

    /**
     * The host saved the model: it counts as saved, for the browser backup
     * too. Pass the data of toJSON() that was saved, so edits made while it
     * was written stay unsaved; without it the model as it is now counts.
     */
    markSaved(saved) {
      const changes = modeler.get('fpbChanges', false);
      if (changes) {
        changes.markSaved(saved);
      }
    },

    /** Like importJSON, for a VDI 3682 XML text */
    importXML(xmlString) {
      return quiet(reportUnread(xmlMapper.convertFromXML(xmlString))
        .then((json) => runImport(() => eventBus.fire('FPBJS.import', { data: json }))));
    },

    /**
     * The model as plain data, the same as the JSON download: references
     * are ids, so the result can go to JSON.stringify, postMessage or
     * importJSON. (It used to be the live object graph, which has cycles.)
     */
    toJSON() {
      eventBus.fire('dataStore.updateAll', {});
      return JSON.parse(serializeModel(modeler.getProcesses(), { indent: 0 }));
    },

    async toXML() {
      eventBus.fire('dataStore.updateAll', {});
      return xmlMapper.convertToXML(modeler.getProcesses());
    },

    // --- AutomationML (feature 028) ---

    /**
     * The FPD process views (InstanceHierarchies) of an AML text, as
     * [{ id, name }]; empty when the file has no FPD content.
     */
    getAMLHierarchies(text) {
      return requireAml(modeler).then((aml) => aml.inspect(text));
    },

    /**
     * Import an AML text. Everything in the file beyond the process view is
     * kept and written back by toAML(). `instanceHierarchy` picks the process
     * view by its key, the CAEX ID or '#n' for a view without one (default: the first); a file without FPD content opens an
     * empty model and toAML() adds the process to that file.
     */
    importAML(text, options = {}) {
      // resolves once the model is on the canvas, with the findings and the
      // report of the importer (032a V1); `warnings` stay the mapper's
      return quiet(reportUnread(requireAml(modeler)).then((aml) => {
        // the add-on loads its engine first and fires the import after that
        const before = importer ? importer.getLastRun() : 0;
        return reportUnread(aml.importAml(text, {
          fileName: options.fileName,
          hierarchyId: options.instanceHierarchy
        })).then((result) => {
          const run = importer ? importer.getLastRun() : before;
          if (!result.hierarchy || run === before) {
            // no FPD content: an empty model, nothing went through the importer
            return { ...result, findings: [], report: [] };
          }
          return importer.whenSettled(run)
            .then(({ warnings }) => ({ ...result, findings: checkNow(), report: warnings }));
        });
      }));
    },

    /**
     * The model as AML text. After importAML the model is written into the
     * imported file and everything else in it stays; otherwise a new file is
     * written. The result is kept for the next toAML().
     */
    async toAML() {
      const result = await (await requireAml(modeler)).exportAml();
      return result.text;
    },

    toSVG() {
      return new Promise((resolve, reject) => {
        modeler.saveSVG({}, (err, svg) => {
          if (err) {
            reject(err);
          } else {
            resolve(svg);
          }
        });
      });
    },

    async toPNG(options = {}) {
      const { exportPNG } = await import('../app/fpb/export/PngExporter');
      const svg = await this.toSVG();
      return exportPNG(svg, options);
    },

    async toPDF(options = {}) {
      const { exportPDF, exportMultiLayerPDF } = await import('../app/fpb/export/PdfExporter');
      const { exportPNG } = await import('../app/fpb/export/PngExporter');
      const { allLayers = false, ...hostOptions } = options;
      // title and subject in the language in effect, unless the host names them
      const translate = modeler.get('translate');
      const pdfOptions = Object.assign({
        title: translate('FPB Diagram'),
        subject: translate('VDI 3682 Formalized Process Description')
      }, hostOptions);

      if (allLayers) {
        const { renderLayers } = await import('../app/fpb/export/renderLayers');
        const processShapes = collectProcessShapes(modeler.getProjectDefinition());

        // Same walk as the download dialog: keeps the undo history and always
        // returns to the layer the user is on.
        const rendered = await renderLayers(modeler, processShapes, async () => exportPNG(await this.toSVG(), options));
        const layers = rendered.map((layer) => ({ name: layer.name, pngDataUrl: layer.image }));
        return exportMultiLayerPDF(layers, pdfOptions);
      } else {
        const svg = await this.toSVG();
        const png = await exportPNG(svg, options);
        return exportPDF(png, pdfOptions);
      }
    },

    // --- Model check (016f E3) ---

    /**
     * The findings of the model check as plain data, for a host that lists
     * them itself: { rule, severity, message, elementId, processId }, with
     * the id of the layer (process) the finding belongs to.
     */
    getFindings() {
      const validation = modeler.get('fpbValidation', false);
      // the message in the language in effect (016h T15)
      const translate = modeler.get('translate');
      return validation ? validation.getIssues().map((issue) => plainFinding(issue, translate)) : [];
    },

    /** The ids of the catalog rules the model check of FPB.js checks */
    getCheckedRules() {
      return Object.keys(RULES).sort();
    },

    /** Show or hide the markers of the model check on the elements */
    setValidationMarkers(show) {
      const validation = modeler.get('fpbValidation', false);
      if (validation) {
        validation.setShowMarkers(!!show);
      }
    },

    // --- Convenience Methods ---

    zoom(level) {
      canvas.zoom(level);
    },

    getZoom() {
      // diagram-js reads the level through zoom() without arguments
      return canvas.zoom();
    },

    /**
     * Select an element by id. `options.process` names its layer and switches
     * there first; without it the shown layer is kept when the element is on
     * it, else the first layer that has it is shown (016f E3). When
     * `options.scroll` is true the viewport moves to the element. The
     * keyboard focus stays where it is. Returns true if the element was found
     * and selected; false leaves layer and selection as they were.
     */
    select(elementId, options = {}) {
      const project = modeler.getProjectDefinition();
      let layer = null;
      if (options.process !== undefined && options.process !== null) {
        layer = project ? findProcessShape(project, options.process) : null;
        if (!layer || !layerHasElement(layer, elementId)) return false;
      } else if (!elementRegistry.get(elementId) && project) {
        layer = findLayerOf(project, elementId);
      }
      if (layer && layer !== canvas.getRootElement()) {
        modeling.switchProcess(layer);
      }
      const element = elementRegistry.get(elementId);
      if (!element) return false;
      selection.select(element);
      if (options.scroll && typeof canvas.scrollToElement === 'function') {
        try { canvas.scrollToElement(element); } catch (_) { /* ignore */ }
      }
      return true;
    },

    getSelected() {
      return selection.get();
    },

    /**
     * The links of the host's AML file the deletion of an element removes, per
     * layer; the delete question names them (016f E4). null clears the list.
     */
    setAmlLinks(links) {
      const amlLinks = modeler.get('fpbAmlLinks', false);
      if (amlLinks) {
        amlLinks.set(links);
      }
    },

    /** The id of the layer (process) on the canvas, null without a model */
    getCurrentProcess() {
      const project = modeler.getProjectDefinition();
      const root = canvas.getRootElement();
      return project && collectProcessShapes(project).indexOf(root) !== -1 ? root.id : null;
    },

    getProcesses() {
      return modeler.getProcesses();
    },

    switchProcess(id) {
      // getProcess() returns the business object, switching needs the shape.
      const shape = findProcessShape(modeler.getProjectDefinition(), id);
      if (shape) {
        modeling.switchProcess(shape);
      }
    },

    // --- Read-only mode ---

    /**
     * Look, don't touch: the user can zoom, pan, switch layers, search, check
     * and export, but not change the model. The API itself stays writable
     * (importJSON, switchProcess, modeling). Fires 'readOnly.changed'.
     */
    setReadOnly(flag) {
      readOnlyMode.set(!!flag);
    },

    isReadOnly() {
      return readOnlyMode.isEnabled();
    },

    /**
     * Light or dark for the containers of this modeler ('light' | 'dark'):
     * from then on the host decides and the toggle is hidden. 'system' hands
     * it back to the user's choice, else the system setting, followed from
     * then on. Fires 'theme.changed' with { theme, mode }.
     */
    setTheme(themeName) {
      if (theme) {
        theme.set(themeName);
      }
    },

    /** The language in effect: 'en' or 'de' (016h V9) */
    getLanguage() {
      return i18n ? i18n.get() : 'en';
    },

    /**
     * English or German ('en', 'de', also 'de-DE' and the like; anything else
     * gives English and a warning). From then on the host decides and the
     * language button is hidden. The interface switches at once; fires
     * 'i18n.changed' with { language }. Returns the language in effect.
     */
    setLanguage(language) {
      return i18n ? i18n.set(language) : 'en';
    },

    // --- DI Access ---

    /** A service; with `strict` false, null instead of an error when it is not there */
    get(serviceName, strict) {
      return modeler.get(serviceName, strict);
    },

    // --- Lifecycle ---

    destroy() {
      if (propertiesPanel && typeof propertiesPanel.destroy === 'function') {
        propertiesPanel.destroy();
      }
      if (layerOverview && typeof layerOverview.destroy === 'function') {
        layerOverview.destroy();
      }
      if (modeler && typeof modeler.destroy === 'function') {
        modeler.destroy();
      }
    }
  };
}

/**
 * A promise a host may ignore, as with 2.0 where the imports returned nothing:
 * its rejection is handled here, so ignoring it logs no unhandled rejection;
 * whoever chains on it still gets the rejection.
 */
function quiet(promise) {
  promise.catch(() => {});
  return promise;
}

/** A finding of the model check without references to shapes */
function plainFinding(issue, translate) {
  return {
    rule: issue.rule,
    severity: issue.severity,
    message: translate ? translateMessage(translate, issue) : issue.message,
    elementId: issue.elementId || null,
    processId: (issue.process && issue.process.id) || null
  };
}

/**
 * The AML service, or a rejection that says how to get it: AML is an add-on
 * like the browser backup, off unless the host passes the module.
 */
function requireAml(modeler) {
  const aml = modeler.get('amlSupport', false);
  return aml
    ? Promise.resolve(aml)
    : Promise.reject(new Error('AutomationML is not enabled: create the modeler with the AML module in additionalModules (fpbjs/aml).'));
}

/**
 * Host callbacks wrapped so they never return a value to the event bus, with
 * the wrapper kept per event name and callback so off() finds it again.
 */
function createListenerRegistry() {
  const byEvent = new Map();

  return {
    wrap(event, callback) {
      if (!byEvent.has(event)) {
        byEvent.set(event, new Map());
      }
      const wrappers = byEvent.get(event);
      if (!wrappers.has(callback)) {
        wrappers.set(callback, function (e) {
          callback(e);
        });
      }
      return wrappers.get(callback);
    },

    unwrap(event, callback) {
      const wrappers = byEvent.get(event);
      const wrapper = wrappers && wrappers.get(callback);
      if (wrapper) {
        wrappers.delete(callback);
      }
      return wrapper;
    }
  };
}

// Convenience function for getting real classes in browser environment
export async function getClasses() {
  if (!isBrowser) {
    return { FpbModeler, PropertiesPanel, LayerOverview, defaultConfig };
  }

  const [
    { default: FpbModeler },
    { default: PropertiesPanel },
    { default: LayerOverview },
    configModule
  ] = await Promise.all([
    import('../app/fpb/FpbModeler'),
    import('../app/fpb/properties-panel'),
    import('../app/fpb/toolbar'),
    import('../app/config.json')
  ]);

  return {
    FpbModeler,
    PropertiesPanel,
    LayerOverview,
    defaultConfig: configModule.default || configModule
  };
}

// Default export
export default createFpbModeler;