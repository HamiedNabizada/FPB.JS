/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useRef, useState } from '@bpmn-io/properties-panel/preact/hooks';

import DialogFrame from '../dialogs/DialogFrame';

/**
 * The dialog "Open" (016e V8): a drop area with "Choose file", the choice
 * of the process view of an AML file, a note for an AML file without FPD,
 * and the error of the chosen file. A file dropped anywhere on the card
 * counts. Open hands the file to the importer and closes; an exception while
 * handing it over stays in the dialog.
 *
 * In Chrome and Edge "Choose file" uses the picker of the browser: the file
 * chosen there is the one Ctrl+S saves into (V9).
 */
export default function OpenDialog(props) {
  const { files, translate, aml, close, titleId } = props;
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [hierarchyId, setHierarchyId] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  // the file chosen last wins, also when an earlier one reads longer
  const reading = useRef(0);

  const choose = (chosen, handle) => {
    if (!chosen) {
      return;
    }
    const token = ++reading.current;
    setParsed(null);
    setHierarchyId(null);
    const problem = files.checkFile(chosen);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setFile({ name: chosen.name, handle: handle || null });
    setError(null);
    files.readFile(chosen).then((result) => {
      if (token === reading.current) {
        setParsed(result);
        setHierarchyId(result.kind === 'aml' && result.hierarchies.length ? result.hierarchies[0].id : null);
      }
    }, (problem) => {
      if (token === reading.current) {
        setError(problem);
      }
    });
  };

  const submit = () => {
    if (!parsed) {
      return;
    }
    try {
      files._importParsed(parsed, { fileName: file.name, hierarchyId, handle: file.handle });
      close();
    } catch (exception) {
      setError({
        message: translate('Import failed'),
        details: translate('An error occurred during import: {message}', { message: exception.message })
      });
    }
  };

  const pick = () => {
    if (!files.canWriteFiles()) {
      input.current.click();
      return;
    }
    files.pickToOpen().then((picked) => {
      if (picked) {
        choose(picked.file, picked.handle);
      }
    }, () => {
      // the browser refused its picker: the file field instead
      input.current.click();
    });
  };

  // Without preventDefault the browser would open the dropped file itself
  const hasFiles = (event) => event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files');
  const onDragOver = (event) => {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };
  const onDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDragging(false);
    }
  };
  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (dropped) {
      choose(dropped);
    }
  };

  const hierarchies = parsed && parsed.kind === 'aml' ? parsed.hierarchies : null;
  const footer = [
    <button key="cancel" type="button" class="fpb-button fpb-button--quiet" data-answer="cancel" onClick={() => close()}>
      {translate('Cancel')}
    </button>,
    <button key="open" type="button" class="fpb-button fpb-button--primary" data-answer="open" disabled={!parsed} onClick={submit}>
      {translate('Open')}
    </button>
  ];

  return (
    <div class="fpb-open-target" onDragEnter={onDragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <DialogFrame title={translate('Open')} titleId={titleId} onClose={() => close()} closeLabel={translate('Close')} footer={footer}>
        <div class={dragging ? 'fpb-drop-zone is-dragover' : 'fpb-drop-zone'}>
          <span class="fpb-drop-zone-text">
            {file ? file.name : (aml
              ? translate('Drop an FPB.js JSON, XML or AutomationML (.aml) file here')
              : translate('Drop an FPB.js JSON or XML file here'))}
          </span>
          <button type="button" class="fpb-button fpb-choose-file" onClick={pick}>
            {translate('Choose file')}
          </button>
          <input
            ref={input}
            type="file"
            id="fpb-open-input"
            class="fpb-open-input"
            tabIndex={-1}
            aria-hidden="true"
            accept={aml ? '.json,.xml,.aml' : '.json,.xml'}
            onChange={(event) => {
              choose(event.target.files && event.target.files[0]);
              event.target.value = '';
            }}
          />
        </div>
        {hierarchies && hierarchies.length > 1 && (
          <fieldset class="aml-hierarchies">
            <legend>
              {translate('The file contains {count} process views. Which one should FPB.js open? The others stay unchanged in the file.', { count: String(hierarchies.length) })}
            </legend>
            {hierarchies.map((hierarchy) => (
              <label key={hierarchy.id} class="fpb-choice" for={'aml-hierarchy-' + hierarchy.id}>
                <input
                  type="radio"
                  id={'aml-hierarchy-' + hierarchy.id}
                  name="aml-hierarchy"
                  checked={hierarchyId === hierarchy.id}
                  onChange={() => setHierarchyId(hierarchy.id)}
                />
                <span>{hierarchy.name || hierarchy.id}</span>
              </label>
            ))}
          </fieldset>
        )}
        {hierarchies && !hierarchies.length && (
          <p class="aml-no-fpd">
            {translate('The file contains no FPD process. FPB.js starts with an empty model; exporting as AML adds the process to this file and keeps everything else in it.')}
          </p>
        )}
        {error && (
          <div class="fpb-open-error" role="alert">
            <div class="fpb-open-error-title">{error.message}</div>
            {error.details && (
              <details>
                <summary>{translate('Technical details')}</summary>
                <pre>{error.details}</pre>
              </details>
            )}
          </div>
        )}
      </DialogFrame>
    </div>
  );
}
