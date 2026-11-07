/** @jsx h */
import { describeErrorsAndWarnings } from '../validation/FpbValidation';
import { translateMessage } from '../i18n/language';
import { h } from '@bpmn-io/properties-panel/preact';
import { useState } from '@bpmn-io/properties-panel/preact/hooks';

import DialogFrame from '../dialogs/DialogFrame';
import { validateFileName } from './fileName';

const XML_PAPER = 'https://www.researchgate.net/publication/361951781_Vorschlag_fur_eine_XML-Reprasentation_der_Formalisierten_Prozessbeschreibung_nach_VDIVDE_3682';

const DATA_FORMATS = ['json', 'xml', 'aml'];
const EXTENSIONS = { json: 'json', xml: 'xml', aml: 'aml', svg: 'svg', png: 'png', pdf: 'pdf' };
const PICTURE_NAMES = { svg: 'SVG', png: 'PNG', pdf: 'PDF' };

/**
 * The dialog "Export" (016e V10): the formats, and only the options of the
 * chosen one (scope, layout, destination, file name), the hint of the model
 * check and one main action. The choices stay with fpbFiles until the page
 * is reloaded. A successful export closes the dialog, an error stays in it.
 */
export default function ExportDialog(props) {
  const { files, translate, close, titleId, initial, amlSource, aml, eventName, check, hasSelection, hasLayersBelow } = props;
  const [format, setFormat] = useState(initial.format);
  const [scope, setScope] = useState(initial.scope);
  const [layout, setLayout] = useState(initial.layout);
  const [to, setTo] = useState(initial.to);
  const [fileName, setFileName] = useState(initial.fileName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const remember = (changes) => files._rememberExport(changes);
  const choose = (setter, key) => (value) => {
    setter(value);
    remember({ [key]: value });
  };
  const chooseFormat = choose(setFormat, 'format');
  const chooseScope = choose(setScope, 'scope');
  const chooseLayout = choose(setLayout, 'layout');
  const chooseTo = choose(setTo, 'to');
  const chooseFileName = choose(setFileName, 'fileName');

  const isData = DATA_FORMATS.includes(format);
  const sendsEvent = !!eventName && isData && to === 'event';
  const nameCheck = validateFileName(fileName);

  const submit = () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    files._runExport({ format, scope, layout, to: sendsEvent ? 'event' : 'file', fileName }).then(() => {
      close();
    }, (exception) => {
      const message = (exception && exception.message) || translate('Unknown error');
      setError(PICTURE_NAMES[format]
        ? translate('{format} export failed: {message}', { format: PICTURE_NAMES[format], message })
        : translate('Export failed: {message}', { message }));
      setBusy(false);
    });
  };

  const formats = [
    { id: 'json', label: 'JSON' },
    {
      id: 'xml',
      label: translate('XML (VDI 3682, Beta)'),
      hint: (
        <span>
          {translate('Based on:')}{' '}
          <a href={XML_PAPER} target="_blank" rel="noopener noreferrer">
            {translate('Proposal for an XML representation of the formalised process description according to VDI/VDE 3682')}
          </a>
        </span>
      )
    },
    aml && { id: 'aml', label: translate('AutomationML (AML)') },
    { id: 'svg', label: 'SVG' },
    { id: 'png', label: 'PNG' },
    { id: 'pdf', label: 'PDF' }
  ].filter(Boolean);

  const scopeText = {
    xml: translate('XML always contains the whole model.'),
    aml: translate('AML always contains the whole model.'),
    svg: translate('The current layer.'),
    png: translate('The current layer.'),
    pdf: translate('All layers, one page each.')
  }[format];

  const radio = (name, id, label, checked, onChange, disabled) => (
    <label key={id} class={disabled ? 'fpb-choice is-disabled' : 'fpb-choice'} for={id}>
      <input type="radio" name={name} id={id} checked={checked} disabled={disabled} onChange={onChange} />
      <span>{label}</span>
    </label>
  );

  const footer = [
    <button key="cancel" type="button" class="fpb-button fpb-button--quiet" data-answer="cancel" onClick={() => close()}>
      {translate('Cancel')}
    </button>,
    <button key="export" type="button" class="fpb-button fpb-button--primary" data-answer="export" disabled={busy} onClick={submit}>
      {busy ? translate('Exporting…') : translate('Export')}
    </button>
  ];

  return (
    <DialogFrame title={translate('Export')} titleId={titleId} onClose={() => close()} closeLabel={translate('Close')} footer={footer}>
      {check && (
        <p class={check.error > 0 ? 'fpb-export-check is-error' : 'fpb-export-check is-warning'} role="status">
          {translate('Model check (VDI 3682): {counts}. The export runs anyway.', { counts: describeErrorsAndWarnings(check, translate) })}
        </p>
      )}
      <div class="fpb-export-columns">
        <fieldset class="fpb-export-formats">
          <legend>{translate('Format')}</legend>
          {formats.map((entry) => (
            <label key={entry.id} class="fpb-choice" for={'exportFormat-' + entry.id}>
              <input type="radio" name="exportFormat" id={'exportFormat-' + entry.id} checked={format === entry.id} onChange={() => chooseFormat(entry.id)} />
              <span class="fpb-choice-text">
                <span>{entry.label}</span>
                {entry.hint && <span class="fpb-choice-hint">{entry.hint}</span>}
              </span>
            </label>
          ))}
          {format === 'aml' && (
            <p class="fpb-export-note aml-target-hint">
              {amlSource
                ? translate('Writes the process into {file}; everything else in that file stays.', { file: amlSource })
                : translate('Writes a new AutomationML file with the FPD libraries.')}
            </p>
          )}
          {format !== 'aml' && amlSource && (
            <p class="fpb-export-note aml-kept-hint">
              {translate('Only an AML export keeps the rest of {file}.', { file: amlSource })}
            </p>
          )}
        </fieldset>

        <div class="fpb-export-options">
          {format === 'json' ? (
            <fieldset>
              <legend>{translate('Scope')}</legend>
              {radio('exportScope', 'exportScope-model', translate('Whole model'), scope === 'model', () => chooseScope('model'))}
              {radio('exportScope', 'exportScope-layer', translate('Current layer'), scope === 'layer', () => chooseScope('layer'))}
              {radio('exportScope', 'exportScope-selection', translate('Selected elements'), scope === 'selection', () => chooseScope('selection'), !hasSelection)}
              {scope === 'layer' && hasLayersBelow && (
                <p class="fpb-export-note fpb-export-layer-note">{translate('Opens as a model of its own, without the layers below.')}</p>
              )}
            </fieldset>
          ) : (
            <p class="fpb-export-scope">{scopeText}</p>
          )}

          {(format === 'json' || format === 'xml') && (
            <label class="fpb-choice fpb-export-layout" for="exportLayout">
              <input type="checkbox" id="exportLayout" checked={layout} onChange={(event) => chooseLayout(event.target.checked)} />
              <span>{translate('With layout (positions and sizes)')}</span>
            </label>
          )}

          {eventName && isData && (
            <fieldset>
              <legend>{translate('Destination')}</legend>
              {radio('exportTo', 'exportTo-file', translate('Download'), to !== 'event', () => chooseTo('file'))}
              {radio('exportTo', 'exportTo-event', translate('Send to the host'), to === 'event', () => chooseTo('event'))}
            </fieldset>
          )}

          {!sendsEvent && (
            <div class="fpb-field">
              <label for="exportFileName">{translate('File name')}</label>
              <div class="fpb-file-name">
                <input
                  type="text"
                  id="exportFileName"
                  value={fileName}
                  aria-invalid={nameCheck.valid ? 'false' : 'true'}
                  aria-describedby={nameCheck.valid ? 'exportFileNameHint' : 'exportFileNameError exportFileNameHint'}
                  onInput={(event) => chooseFileName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
                <span class="fpb-file-extension">.{EXTENSIONS[format]}</span>
              </div>
              {!nameCheck.valid && <p class="fpb-field-error" id="exportFileNameError">{translateMessage(translate, nameCheck.message)}</p>}
              <p class="fpb-field-hint" id="exportFileNameHint">{translate('Avoid special characters: < > : " / \\ | ? *')}</p>
            </div>
          )}
        </div>
      </div>
      {error && <div class="fpb-export-error" role="alert">{error}</div>}
    </DialogFrame>
  );
}
