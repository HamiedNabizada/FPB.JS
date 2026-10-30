import OpenDialog from './OpenDialog';
import ExportDialog from './ExportDialog';
import XMLMapper from '../xml/XMLMapper.js';
import { checkFile, parseModelText, readText } from './readModelFile';
import { exportContent } from './exports';
import { defaultFileName, validateFileName } from './fileName';
import { downloadFile } from './fileAccess';

/**
 * Opening, saving and exporting the model (016e D2, T8): one place for the
 * toolbar, the keys and hosts.
 *
 * open() shows the dialog "Open" (not in read-only mode), export() the
 * dialog "Export". With the option `exportEvent` (true or a name) an export
 * can go to the host as an event instead of a download.
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

  const self = this;

  // the model the user only looks at stays: an open dialog goes
  eventBus.on('readOnly.changed', function (event) {
    if (event.readOnly && self._openDialog) {
      self._openDialog.close();
    }
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
 * Hands a read file to the importer. JSON and XML go through FPBJS.import at
 * once, and an exception of a listener reaches the caller; AML through the
 * AML module, whose errors go to the message stack.
 *
 * @param {Object} parsed from readFile
 * @param {{ fileName: string, hierarchyId?: string }} options
 */
Files.prototype._importParsed = function (parsed, options = {}) {
  if (parsed.kind === 'aml') {
    const translate = this._translate;
    return this._amlSupport().importAml(parsed.text, {
      fileName: options.fileName,
      hierarchyId: options.hierarchyId
    }).catch((error) => {
      this._injector.get('fpbNotifications').show({
        key: 'import.error',
        type: 'error',
        title: translate('Import Error'),
        message: translate('Import failed'),
        details: translate('The AutomationML file could not be imported: {message}', { message: error.message })
      });
    });
  }
  this._eventBus.fire('FPBJS.import', { data: parsed.data });
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
