import { serializeModel } from '../export/serializeModel.js';

import { buildAmlIndex, buildAmlOverview } from './amlIndex.js';
import { isAmlText } from './detect.js';

/**
 * AutomationML import and export (feature 028).
 *
 * An AML file may hold more than the FPD process: other hierarchies,
 * libraries, attributes and links of its own. FPB.js works on its JSON model,
 * so on import this service keeps the text of the file and the FPD hierarchy
 * it came from (the source). The AML export writes the current model into
 * that text (UpdateInPlace of the mapper) and keeps everything else; without a
 * source it writes a new file. The source lasts until the next import or New
 * model, and goes into the browser backup (Autosave) with the model.
 *
 * The engine and the mapper are loaded on first use (a chunk of their own in
 * the web app).
 *
 * Events: `aml.sourceChanged` { source } when the kept file changes,
 * `aml.indexChanged` { index, overview } when the foreign content per element
 * and the overview of the file are known, `aml.importNotes` { notes } with the
 * notes of an AML import for the import report.
 */
export default function AmlSupport(eventBus, fpbjs) {
  this._eventBus = eventBus;
  this._fpbjs = fpbjs;
  this._source = null;
  this._index = null;
  this._overview = null;
  this._pendingSource = null;
  // index and overview an import has built already, for the source it brings
  this._prebuilt = null;
  // the kept file before the running import, put back if the import fails
  this._beforeImport = null;

  const self = this;

  // Every import replaces the model: an AML import (or a restored backup)
  // brings its source along, any other import drops the kept file
  eventBus.on('FPBJS.import', 2000, function (event) {
    const source = event && event.amlSource ? event.amlSource : null;
    const prebuilt = self._prebuilt && self._prebuilt.source === source ? self._prebuilt : null;
    self._prebuilt = null;
    self._beforeImport = {
      source: self._source,
      built: self._index ? { index: self._index, overview: self._overview } : null
    };
    self._setSource(source, prebuilt);
  });

  // The importer refuses invalid content while FPBJS.import runs and keeps
  // the model it had: that model keeps its file too
  eventBus.on('import.error', function () {
    const before = self._beforeImport;
    if (before) {
      self._beforeImport = null;
      self._setSource(before.source, before.built);
    }
  });

  // after the importer: an import that got this far went through
  eventBus.on('FPBJS.import', 1, function () {
    self._beforeImport = null;
  });

  eventBus.on('model.new', function () {
    self._setSource(self._pendingSource);
    self._pendingSource = null;
  });
}

AmlSupport.$inject = ['eventBus', 'fpbjs'];

/** Loads engine and mapper once */
AmlSupport.prototype._load = function () {
  if (!this._loading) {
    this._loading = Promise.all([
      import(/* webpackChunkName: "aml" */ 'amlengine-js'),
      import(/* webpackChunkName: "aml" */ './mapper/CaexToFpbJson.js'),
      import(/* webpackChunkName: "aml" */ './mapper/FpbJsonToCaex.js')
    ]).then(([engine, toJson, toCaex]) => ({ engine, toJson, toCaex }));
    // a failed load may be retried
    this._loading.catch(() => {
      this._loading = null;
    });
  }
  return this._loading;
};

/** Is an AML file kept for the next AML export? */
AmlSupport.prototype.hasSource = function () {
  return !!this._source;
};

/**
 * The kept file: `{ text, fileName, hierarchyId, hierarchyName }` or null.
 * `hierarchyId` is null for a file without FPD content (the export adds one).
 */
AmlSupport.prototype.getSource = function () {
  return this._source;
};

/**
 * Foreign content per FPB element id of the kept file, or null while it is
 * not known: `Map<id, { attributes, interfaces, links }>`.
 */
AmlSupport.prototype.getIndex = function () {
  return this._index;
};

/** The foreign content of one element, or null */
AmlSupport.prototype.getForeignContent = function (elementId) {
  return this._index ? this._index.get(elementId) || null : null;
};

/**
 * Everything in the kept file, or null while it is not known: hierarchies,
 * libraries, external references and the elements with foreign content
 * (see buildAmlOverview), with the file name.
 */
AmlSupport.prototype.getOverview = function () {
  return this._overview;
};

AmlSupport.prototype._setSource = function (source, prebuilt = null) {
  this._source = source || null;
  this._index = null;
  this._overview = null;
  this._eventBus.fire('aml.sourceChanged', { source: this._source });
  if (!this._source) {
    return;
  }
  if (prebuilt) {
    this._useIndex(prebuilt);
    return;
  }
  const indexed = this._source;
  this._buildIndex(indexed).then((built) => {
    if (this._source === indexed) {
      this._useIndex(built);
    }
  }).catch(() => {
    // the index is a help; import and export work without it
  });
};

AmlSupport.prototype._useIndex = function ({ index, overview }) {
  this._index = index;
  this._overview = overview;
  this._eventBus.fire('aml.indexChanged', { index, overview });
};

AmlSupport.prototype._buildIndex = function (source) {
  return this._load().then(({ engine, toJson }) => {
    const doc = engine.CAEXDocument.loadFromString(source.text);
    const found = toJson.findFpdInstanceHierarchies(doc);
    const ih = source.hierarchyId ? found.find((h) => h.id === source.hierarchyId) || null : null;
    return describe(doc, ih, found, source);
  });
};

/**
 * Read an AML text: its FPD hierarchies (`[{ id, name }]`). Rejects when the
 * text is no AML file.
 */
AmlSupport.prototype.inspect = function (text) {
  return this._load().then(({ engine, toJson }) => {
    const doc = parse(engine, text);
    return toJson.findFpdInstanceHierarchies(doc).map((ih) => ({ id: ih.id, name: ih.name }));
  });
};

/**
 * Import an AML text. With `hierarchyId` that FPD hierarchy, else the first;
 * a file without FPD content opens an empty model, and the AML export adds
 * the process to that file.
 *
 * @return {Promise<{ hierarchies: Array, hierarchy: object|null }>}
 */
AmlSupport.prototype.importAml = function (text, options = {}) {
  const fileName = options.fileName || 'model.aml';
  return this._load().then(({ engine, toJson }) => {
    const doc = parse(engine, text);
    const found = toJson.findFpdInstanceHierarchies(doc);
    const hierarchies = found.map((ih) => ({ id: ih.id, name: ih.name }));

    if (!found.length) {
      this._pendingSource = { text, fileName, hierarchyId: null, hierarchyName: null };
      this._fpbjs.newModel();
      this._eventBus.fire('import.report', {
        warnings: [{
          message: 'The AML file contains no FPD process. FPB.js starts with an empty model.',
          details: null,
          hint: 'Exporting as AML adds the process to this file and keeps everything else in it.'
        }]
      });
      return { hierarchies, hierarchy: null };
    }

    const ih = options.hierarchyId ? found.find((h) => h.id === options.hierarchyId) : found[0];
    if (!ih) {
      throw new Error('The AML file has no FPD hierarchy with the id ' + options.hierarchyId);
    }
    const result = toJson.convertCaexToFpbJson(doc, ih);
    const hierarchy = { id: ih.id, name: ih.name };
    const amlSource = { text, fileName, hierarchyId: hierarchy.id, hierarchyName: hierarchy.name };

    // the document is loaded already: index and overview now, and a note for
    // the import report where to find what the file carries beyond FPD
    this._prebuilt = { source: amlSource, ...describe(doc, ih, found, amlSource) };
    this._eventBus.fire('aml.importNotes', { notes: importNotes(this._prebuilt.overview) });

    this._eventBus.fire('FPBJS.import', {
      data: JSON.parse(result.value),
      amlSource
    });
    return { hierarchies, hierarchy, warnings: result.warnings };
  });
};

/**
 * The current model as AML. With a kept file the model is written into it
 * and everything else stays; without one a new file is written. The result
 * becomes the kept file, so the next export builds on it.
 *
 * @return {Promise<{ bytes: Uint8Array, text: string, fileName: string, warnings: string[], removedLinks: string[] }>}
 */
AmlSupport.prototype.exportAml = function () {
  this._eventBus.fire('dataStore.updateAll', {});
  const processes = this._fpbjs.getProcesses() || [];
  if (!processes.length) {
    return Promise.reject(new Error('The model is empty: there is no process to export.'));
  }
  const json = serializeModel(processes, { indent: 0 });
  const source = this._source;

  return this._load().then(({ engine, toJson, toCaex }) => {
    let result;
    let hierarchy = null;
    if (source) {
      const doc = parse(engine, source.text);
      const ih = source.hierarchyId ? findHierarchy(toJson, doc, source.hierarchyId) : null;
      result = toCaex.updateInPlace(doc, json, ih || undefined);
      // a file without FPD content has one now
      const target = ih || toJson.findFpdInstanceHierarchies(result.value).slice(-1)[0] || null;
      hierarchy = target ? { id: target.id, name: target.name } : null;
    } else {
      result = toCaex.convertFpbJsonToCaex(json);
      const target = toJson.findFpdInstanceHierarchies(result.value)[0] || null;
      hierarchy = target ? { id: target.id, name: target.name } : null;
    }

    const bytes = result.value.saveToStream(true);
    const text = new TextDecoder('utf-8').decode(bytes);
    const fileName = source ? source.fileName : 'fpb-export.aml';

    this._setSource({
      text,
      fileName,
      hierarchyId: hierarchy ? hierarchy.id : null,
      hierarchyName: hierarchy ? hierarchy.name : null
    });

    return {
      bytes,
      text,
      fileName,
      warnings: result.warnings,
      removedLinks: result.warnings.filter((w) => w.startsWith('Removed link '))
    };
  });
};

/** CAEXDocument of a text, or an error that says what is wrong */
function parse(engine, text) {
  // the engine reads any XML; only a CAEXFile is AML
  if (!isAmlText(text)) {
    throw new Error('The file is no AutomationML (CAEX) document.');
  }
  let doc = null;
  try {
    doc = engine.CAEXDocument.loadFromString(text);
  } catch (error) {
    throw new Error('The file could not be read as AutomationML: ' + (error && error.message || error));
  }
  if (!doc || !doc.caexFile) {
    throw new Error('The file is no AutomationML (CAEX) document.');
  }
  return doc;
}

/** Index and overview of a loaded document */
function describe(doc, ih, found, source) {
  const index = buildAmlIndex(doc, ih);
  const overview = Object.assign(buildAmlOverview(doc, ih, index, found), { fileName: source.fileName });
  return { index, overview };
}

/** Notes for the import report: which elements carry more than FPD */
function importNotes(overview) {
  const elements = overview.elements;
  if (!elements.length) {
    return [];
  }
  const names = elements.slice(0, 5).map((e) => e.name).join(', ') + (elements.length > 5 ? ', …' : '');
  return [{
    message: `${elements.length} ${elements.length === 1 ? 'element carries' : 'elements carry'} more from the AML file: ${names}.`,
    details: null,
    hint: 'Select one to see it under "AML (read only)" in the properties panel. "AML file" in the options lists everything the file holds.'
  }];
}

function findHierarchy(toJson, doc, id) {
  return toJson.findFpdInstanceHierarchies(doc).find((ih) => ih.id === id) || null;
}
