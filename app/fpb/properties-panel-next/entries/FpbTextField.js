/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useCallback, useContext, useEffect, useRef, useState } from '@bpmn-io/properties-panel/preact/hooks';
import { useDebounce, useError, useShowEntryEvent } from '@bpmn-io/properties-panel';

import { usePanelReadOnly } from '../hooks';
import { FindingsContext } from '../findingsContext';

const text = (value) => (value === undefined || value === null ? '' : String(value));
const sameText = (a, b) => a === b;
const run = (job) => job();

/**
 * Text field in the markup of @bpmn-io/properties-panel, with what its
 * TextFieldEntry lacks: `readonly` instead of `disabled` in read-only mode
 * (027: the text stays selectable), no write when the check fails (the
 * library calls setValue even then), a finding of the model check at the
 * field, and room for buttons next to the input (`children`).
 *
 * A pending input belongs to the element it was typed for: the write is bound
 * when typing, not when the debounce fires, and leaving the field writes at
 * once (the library's field does that on blur as well). `equals` tells which
 * texts mean the same value, so the field keeps "1," while 1 is stored.
 */
export function FpbTextField(props) {
  const { element, id, label, debounce, getValue, setValue, validate, equals = sameText, readOnly: always, children } = props;
  const panelReadOnly = usePanelReadOnly();
  const readOnly = !!always || panelReadOnly;
  const value = text(getValue(element));

  const [localValue, setLocalValue] = useState(value);
  const [localError, setLocalError] = useState(null);
  const globalError = useError(id);
  const finding = useContext(FindingsContext)[id];
  const ref = useShowEntryEvent(id);

  // another element always shows its own value; the same one keeps the
  // typed text while it means the stored value
  const shown = useRef(element);
  useEffect(() => {
    const switched = shown.current !== element;
    shown.current = element;
    setLocalValue((local) => (switched || !equals(local, value) ? value : local));
    if (switched) {
      setLocalError(null);
    }
  }, [element, value]); // eslint-disable-line react-hooks/exhaustive-deps

  // stable, so a re-render neither flushes nor drops a pending write
  const debounced = useDebounce(useCallback(run, []), debounce);

  const writeLater = (next) => {
    const target = element;
    debounced(() => {
      const error = validate ? validate(next) || null : null;
      if (shown.current === target) {
        setLocalError(error);
      }
      if (!error && next !== value) {
        setValue(next);
      }
    });
  };

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
                writeLater(event.target.value);
              }
            }}
            onBlur={() => debounced.flush && debounced.flush()}
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
