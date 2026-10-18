/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useContext, useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks';
import { useDebounce, useError, useShowEntryEvent, useStaticCallback } from '@bpmn-io/properties-panel';

import { usePanelReadOnly } from '../hooks';
import { FindingsContext } from '../findingsContext';

const text = (value) => (value === undefined || value === null ? '' : String(value));

/**
 * Text field in the markup of @bpmn-io/properties-panel, with what its
 * TextFieldEntry lacks: `readonly` instead of `disabled` in read-only mode
 * (027: the text stays selectable), no write when the check fails (the
 * library calls setValue even then), a finding of the model check at the
 * field, and room for buttons next to the input (`children`).
 */
export function FpbTextField(props) {
  const { element, id, label, debounce, getValue, setValue, validate, readOnly: always, children } = props;
  const panelReadOnly = usePanelReadOnly();
  const readOnly = !!always || panelReadOnly;
  const value = text(getValue(element));

  const [localValue, setLocalValue] = useState(value);
  const [localError, setLocalError] = useState(null);
  const globalError = useError(id);
  const finding = useContext(FindingsContext)[id];
  const ref = useShowEntryEvent(id);

  useEffect(() => setLocalValue(value), [value]);

  const commit = useStaticCallback((next) => {
    const error = validate ? validate(next) || null : null;
    setLocalError(error);
    if (!error && next !== value) {
      setValue(next);
    }
  });
  const debounced = useDebounce(commit, debounce);

  const error = globalError || localError;
  const inputId = 'bio-properties-panel-' + id;

  return (
    <div class={'bio-properties-panel-entry' + (error ? ' has-error' : '')} data-entry-id={id}>
      <div class="bio-properties-panel-textfield">
        <label for={inputId} class="bio-properties-panel-label">{label}</label>
        <div class="fpb-textfield-row">
          <input
            ref={ref}
            id={inputId}
            name={id}
            type="text"
            spellCheck="false"
            autoComplete="off"
            class="bio-properties-panel-input"
            readOnly={readOnly}
            value={localValue}
            onInput={(event) => {
              setLocalValue(event.target.value);
              if (!readOnly) {
                debounced(event.target.value);
              }
            }}
          />
          {children}
        </div>
      </div>
      {error && <div class="bio-properties-panel-error">{error}</div>}
      {!error && finding && (
        <div class={'fpb-field-finding fpb-field-finding-' + finding.severity}>{finding.message}</div>
      )}
    </div>
  );
}

export function isFpbTextFieldEdited(node) {
  return !!(node && node.value);
}
