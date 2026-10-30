import { isCmd, isKey, isShift } from 'diagram-js/lib/features/keyboard/KeyboardUtil';

import OpenDialog from './OpenDialog';
import ExportDialog from './ExportDialog';
import XMLMapper from '../xml/XMLMapper.js';
import { serializeModel } from '../export/serializeModel.js';
import { checkFile, parseModelText, readText } from './readModelFile';
import { exportContent } from './exports';
import { defaultFileName, validateFileName } from './fileName';
import { canWriteFiles, downloadFile, pickFileToOpen, pickFileToSave, writeFile } from './fileAccess';

/**
 * Opening, saving and exporting the model (016e D2, T8): one place for the
 * toolbar, the keys and hosts.
 *
 * open() shows the dialog "Open" (not in read-only mode), export() the
 * dialog "Export". With the option `exportEvent` (true or a name) an export
 * can go to the host as an event instead of a download.
 *
 * save() writes the whole model with its layout (V9): in Chrome and Edge
 * into the file of the model, which the user chose when opening or at the
 * first save, else as a download. A model from an AML file goes into that
 * file, everything else in it stays; one from an XML file is saved as JSON.
 * saveAs() always asks for a new place. The file is remembered until the
 * next import, New model or reload; a failed import keeps the file of the
 * model on screen. The option `files: false` turns off the keys.
 */
export default function Files(eventBus, injector, fpbjs, translate, config) {
  this._eventBus = eventBus;
  this._injector = injector;
  this._fpbjs = fpbjs;
  this._translate = translate;
  this._config = config || {};
  this._openDialog = null;
  this._exportDialog = null;
  // the choices of the export dialog, kept until the page is reloaded; the
  // file name only once typed, else the name of the project
  this._exportChoices = { format: 'json', scope: 'model', layout: true, to: 'file', fileName: null };
  // the file of the model on screen: { name, format: 'json'|'aml', handle }
  this._target = null;
  // the file an import of our own brings, taken when the import starts
  this._incoming = null;
  // the file before the running import, put back if the import fails
  this._before = undefined;
  this._saving = false;
  // the browser refused its pickers once: downloads from then on
  this._noPickers = false;

  const self = this;

  // the model the user only looks at stays: an open dialog goes
  eventBus.on('readOnly.changed', function (event) {
    if (event.readOnly && self._openDialog) {
      self._openDialog.close();
    }
  });

  // before the importer, which may refuse the content at once
  eventBus.on('FPBJS.import', 2000, function () {
    self._before = self._target;
    self._target = self._incoming;
    self._incoming = null;
  });

  eventBus.on('import.done', function () {
    self._before = undefined;
  });

  eventBus.on('import.error', function () {
    if (self._before !== undefined) {
      self._target = self._before;
      self._before = undefined;
    }
  });

  // also an AML file without FPD content: it opens as a new model
  eventBus.on('model.new', function () {
    self._target = self._incoming;
    self._incoming = null;
    self._before = undefined;
  });
}

Files.$inject = ['eventBus', 'injector', 'fpbjs', 'translate', 'config'];

/** Shows the dialog "Open"; one at a time, none in read-only mode */
Files.prototype.open = function () {
  if (this._isReadOnly()) {
    return null;
  }
  if (this._openDialog) {
    return this._openDialog;
  }
  const handle = this._injector.get('fpbDialogs').open(OpenDialog, {
    files: this,
    translate: this._translate,
    aml: !!this._amlSupport()
  }, { className: 'fpb-open-dialog' });
  this._openDialog = handle;
  handle.closed.then(() => {
    if (this._openDialog === handle) {
      this._openDialog = null;
    }
  });
  return handle;
};

/** An error for a file that is not even read, or null; texts translated */
Files.prototype.checkFile = function (file) {
  const problem = checkFile(file, { aml: !!this._amlSupport() });
  return problem && this._translated(problem);
};

/**
 * Reads and recognises a file. Rejects with `{ message, details }`,
 * translated, as the dialog shows it.
 */
Files.prototype.readFile = function (file) {
  const translate = this._translate;
  const amlSupport = this._amlSupport();
  return readText(file).then(
    (text) => parseModelText(text, {
      aml: amlSupport || undefined,
      convertXml: (xml) => new XMLMapper().convertFromXML(xml)
    }).catch((error) => {
      throw {
        message: translate('Invalid file format'),
        details: translate('The selected file could not be parsed: {message}', { message: error.message })
      };
    }),
    () => {
      throw {
        message: translate('File read error'),
        details: translate('Unable to read the selected file. Please try again with a different file.')
      };
    }
  );
};

/**
 * Lets the user choose a file to open in the picker of the browser, which
 * also gives FPB.js the file to save into later; null when cancelled. Only
 * where canWriteFiles(), else the file field of the dialog.
 *
 * @return {Promise<{ file: File, handle: FileSystemFileHandle }|null>}
 */
Files.prototype.pickToOpen = function () {
  const amlSupport = this._amlSupport();
  const accept = { 'application/json': ['.json'], 'application/xml': amlSupport ? ['.xml', '.aml'] : ['.xml'] };
  return pickFileToOpen([{ description: this._translate('FPB.js models'), accept }]).then((handle) => (
    handle ? handle.getFile().then((file) => ({ file, handle })) : null
  ), (error) => {
    this._noPickers = true;
    throw error;
  });
};

/** Can saving write into a file the user chose (Chrome and Edge)? */
Files.prototype.canWriteFiles = function () {
  return !this._noPickers && canWriteFiles();
};

/**
 * Hands a read file to the importer. JSON and XML go through FPBJS.import at
 * once, and an exception of a listener reaches the caller; AML through the
 * AML module, whose errors go to the message stack. The file becomes the
 * one to save into once the import starts: JSON and AML as they are, XML as
 * JSON of the same name.
 *
 * @param {Object} parsed from readFile
 * @param {{ fileName: string, hierarchyId?: string, handle?: FileSystemFileHandle }} options
 */
Files.prototype._importParsed = function (parsed, options = {}) {
  const fileName = options.fileName;
  this._incoming = parsed.kind === 'xml'
    ? { name: fileName.replace(/\.[^.]*$/, '') + '.json', format: 'json', handle: null }
    : { name: fileName, format: parsed.kind === 'aml' ? 'aml' : 'json', handle: options.handle || null };

  if (parsed.kind === 'aml') {
    const translate = this._translate;
    return this._amlSupport().importAml(parsed.text, {
      fileName,
      hierarchyId: options.hierarchyId
    }).catch((error) => {
      this._injector.get('fpbNotifications').show({
        key: 'import.error',
        type: 'error',
        title: translate('Import Error'),
        message: translate('Import failed'),
        details: translate('The AutomationML file could not be imported: {message}', { message: error.message })
      });
    }).then(() => {
      this._incoming = null;
    });
  }
  try {
    this._eventBus.fire('FPBJS.import', { data: parsed.data });
  } finally {
    // not taken when a listener before ours threw
    this._incoming = null;
  }
};

/** Saves the model, into its file where the browser allows (Ctrl+S) */
Files.prototype.save = function () {
  return this._save(false);
};

/** Saves the model under a new name; asks for the place (Ctrl+Shift+S) */
Files.prototype.saveAs = function () {
  return this._save(true);
};

/**
 * @param {boolean} asNew always ask for the place
 * @return {Promise<boolean>} true when the model was written or downloaded
 */
Files.prototype._save = function (asNew) {
  if (this._saving) {
    return Promise.resolve(false);
  }
  const translate = this._translate;

  // a label being typed on the canvas belongs to the model
  const directEditing = this._injector.get('directEditing', false);
  if (directEditing && directEditing.isActive()) {
    directEditing.complete();
  }
  this._eventBus.fire('dataStore.updateAll', {});

  if (!(this._fpbjs.getProcesses() || []).length) {
    this._notify({ key: 'files.saved', type: 'info', title: translate('The model is empty: there is nothing to save.') });
    return Promise.resolve(false);
  }

  const target = this._target || this._defaultTarget();
  this._saving = true;

  // the picker first: it needs the key press or click that asked for it,
  // and building the content takes time
  let chosen;
  if (this.canWriteFiles() && (asNew || !target.handle)) {
    chosen = pickFileToSave(target.name, this._saveTypes(target.format)).then((handle) => (
      handle ? { name: handle.name, format: this._formatOf(handle.name), handle } : null
    ), () => {
      // refused by the browser (a frame, a missing permission): a download
      this._noPickers = true;
      return Object.assign({}, target, { handle: null });
    });
  } else {
    chosen = Promise.resolve(this.canWriteFiles() ? target : Object.assign({}, target, { handle: null }));
  }

  return chosen.then((file) => {
    if (!file) {
      return false;
    }
    return this._saveContent(file.format).then((content) => {
      if (file.handle) {
        return writeFile(file.handle, content.data).then(() => {
          this._target = file;
          this._saved(file, translate('Saved to {name}', { name: file.name }));
          return true;
        });
      }
      downloadFile(content.data, file.name, content.mime);
      this._saved(file, translate('Downloaded {name}', { name: file.name }));
      return true;
    });
  }).catch((error) => {
    this._saveFailed(error, target);
    return false;
  }).then((result) => {
    this._saving = false;
    return result;
  });
};

/** The file of a model that came from no file */
Files.prototype._defaultTarget = function () {
  const amlSupport = this._amlSupport();
  const source = amlSupport && amlSupport.getSource();
  if (source) {
    return { name: source.fileName, format: 'aml', handle: null };
  }
  return { name: defaultFileName(this._fpbjs) + '.json', format: 'json', handle: null };
};

Files.prototype._formatOf = function (name) {
  return /\.aml$/i.test(name) && this._amlSupport() ? 'aml' : 'json';
};

/** The types of the save picker, the format of the model first */
Files.prototype._saveTypes = function (format) {
  const translate = this._translate;
  const json = { description: translate('FPB.js model (JSON)'), accept: { 'application/json': ['.json'] } };
  if (!this._amlSupport()) {
    return [json];
  }
  const aml = { description: translate('AutomationML'), accept: { 'application/xml': ['.aml'] } };
  return format === 'aml' ? [aml, json] : [json, aml];
};

/** The whole model with layout: JSON as the download writes it, or AML */
Files.prototype._saveContent = function (format) {
  if (format === 'aml') {
    return this._amlSupport().exportAml().then((result) => {
      if (result.removedLinks.length) {
        this._reportRemovedLinks(result.removedLinks);
      }
      return { data: result.bytes, mime: 'application/xml' };
    });
  }
  return Promise.resolve({ data: serializeModel(this._fpbjs.getProcesses()), mime: 'application/json' });
};

Files.prototype._saved = function (file, title) {
  this._notify({ key: 'files.saved', type: 'success', title });
  // the browser backup counts the model as saved
  this._eventBus.fire('model.downloaded', { format: file.format, fileName: file.name });
};

Files.prototype._saveFailed = function (error, target) {
  const translate = this._translate;
  if (error && error.name === 'NotAllowedError') {
    this._notify({
      key: 'files.error',
      type: 'warning',
      title: translate('FPB.js may not write to {name}', { name: target.name }),
      message: translate('Save the model under a new name instead.'),
      actions: [{ label: translate('Save as'), primary: true, run: () => this.saveAs() }]
    });
    return;
  }
  this._notify({
    key: 'files.error',
    type: 'error',
    title: translate('Saving failed'),
    message: (error && error.message) || String(error),
    details: error && error.stack ? String(error.stack) : undefined
  });
};

Files.prototype._notify = function (options) {
  this._injector.get('fpbNotifications').show(options);
};

/**
 * Ctrl/Cmd+S and Ctrl/Cmd+Shift+S. True when the key was taken.
 */
Files.prototype._handleKey = function (event) {
  if (this._config.files === false || !isCmd(event)) {
    return false;
  }
  if (isKey(['s', 'S'], event)) {
    if (isShift(event)) {
      this.saveAs();
    } else {
      this.save();
    }
    return true;
  }
  return false;
};

/**
 * The keys of files also in a container of FPB.js outside the canvas, such
 * as the properties panel and the toolbar; otherwise the browser would save
 * the page. Returns a function that removes them.
 */
Files.prototype.bindKeys = function (element) {
  if (!element || this._config.files === false) {
    return function () {};
  }
  const self = this;
  const listener = function (event) {
    if (self._handleKey(event)) {
      event.preventDefault();
    }
  };
  element.addEventListener('keydown', listener);
  return function () {
    element.removeEventListener('keydown', listener);
  };
};

/** Shows the dialog "Export"; one at a time, also in read-only mode */
Files.prototype.export = function () {
  if (this._exportDialog) {
    return this._exportDialog;
  }
  const fpbjs = this._fpbjs;
  const amlSupport = this._amlSupport();
  const source = amlSupport ? amlSupport.getSource() : null;
  const hasSelection = this._injector.get('selection').get().length > 0;
  const choices = this._exportChoices;
  const initial = Object.assign({}, choices, {
    format: choices.format === 'aml' && !amlSupport ? 'json' : choices.format,
    scope: choices.scope === 'selection' && !hasSelection ? 'model' : choices.scope,
    fileName: choices.fileName === null ? defaultFileName(fpbjs) : choices.fileName
  });

  const handle = this._injector.get('fpbDialogs').open(ExportDialog, {
    files: this,
    translate: this._translate,
    initial,
    aml: !!amlSupport,
    amlSource: source ? source.fileName : null,
    eventName: this._exportEventName(),
    check: this._checkCounts(),
    hasSelection
  }, { className: 'fpb-export-dialog' });
  this._exportDialog = handle;
  handle.closed.then(() => {
    if (this._exportDialog === handle) {
      this._exportDialog = null;
    }
  });
  return handle;
};

Files.prototype._rememberExport = function (changes) {
  Object.assign(this._exportChoices, changes);
};

/**
 * Exports with the choices of the dialog: a download, or with exportEvent
 * the event to the host. The whole model with layout in a file counts as
 * saved (`model.downloaded`).
 */
Files.prototype._runExport = function (choices) {
  return exportContent(this._fpbjs, choices).then((result) => {
    const eventName = this._exportEventName();
    if (choices.to === 'event' && eventName) {
      this._eventBus.fire(eventName, { data: result.eventData, format: choices.format });
    } else {
      downloadFile(result.data, validateFileName(choices.fileName).sanitized + '.' + result.extension, result.mime);
      if (result.wholeModel) {
        this._eventBus.fire('model.downloaded', { format: choices.format });
      }
    }
    if (result.removedLinks && result.removedLinks.length) {
      this._reportRemovedLinks(result.removedLinks);
    }
  });
};

/** The links an AML export removed, because their element is gone */
Files.prototype._reportRemovedLinks = function (removed) {
  const translate = this._translate;
  this._injector.get('fpbNotifications').show({
    key: 'export.report',
    type: 'warning',
    title: translate('AML export: {count} {links} removed', {
      count: String(removed.length),
      links: removed.length === 1 ? translate('link') : translate('links')
    }),
    items: removed.map((message) => ({
      message,
      hint: translate('The element was deleted in FPB.js; the link pointed to it.')
    }))
  });
};

Files.prototype._exportEventName = function () {
  const option = this._config.exportEvent;
  if (option === true) {
    return 'fpbjs';
  }
  return typeof option === 'string' && option ? option : null;
};

/** Findings of the model check for the hint in the export dialog, or null */
Files.prototype._checkCounts = function () {
  const validation = this._injector.get('fpbValidation', false);
  try {
    const counts = validation && validation.run() && validation.getCounts();
    return counts && (counts.error > 0 || counts.warning > 0) ? counts : null;
  } catch (error) {
    return null;
  }
};

Files.prototype._amlSupport = function () {
  return this._injector.get('amlSupport', false);
};

Files.prototype._isReadOnly = function () {
  const readOnly = this._injector.get('readOnly', false);
  return !!(readOnly && readOnly.isEnabled());
};

Files.prototype._translated = function ({ message, details }) {
  return { message: this._translate(message), details: this._translate(details) };
};
