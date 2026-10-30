import OpenDialog from './OpenDialog';
import XMLMapper from '../xml/XMLMapper.js';
import { checkFile, parseModelText, readText } from './readModelFile';

/**
 * Opening, saving and exporting the model (016e D2, T8): one place for the
 * toolbar, the keys and hosts.
 *
 * open() shows the dialog "Open" (not in read-only mode).
 */
export default function Files(eventBus, injector, fpbjs, translate, config) {
  this._eventBus = eventBus;
  this._injector = injector;
  this._fpbjs = fpbjs;
  this._translate = translate;
  this._config = config || {};
  this._openDialog = null;

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
