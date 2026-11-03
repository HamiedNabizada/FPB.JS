/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks';

import { useService } from '../context';
import { usePanelReadOnly } from '../hooks';
import { FpbTextField } from '../entries/FpbTextField';
import { parseValue, formatValue } from '../values';
import { asList } from './model';

/** "1," and 1 are the same value: the field keeps what the user types */
const sameValue = (a, b) => parseValue(a) === parseValue(b);

/** One actual value: value, unit and the cross */
function ActualValueRow(props) {
  const { element, index, n, value, onValue, onUnit, onRemove } = props;
  const translate = useService('translate');
  const debounce = useService('debounceInput');
  const readOnly = usePanelReadOnly();
  return (
    <div class="fpb-actual-value">
      <FpbTextField
        element={element}
        id={'characteristic-' + index + '-actual-' + n + '-value'}
        label={translate('Value')}
        debounce={debounce}
        equals={sameValue}
        getValue={() => formatValue(value && value.value)}
        setValue={onValue}
      />
      <FpbTextField
        element={element}
        id={'characteristic-' + index + '-actual-' + n + '-unit'}
        label={translate('Unit')}
        debounce={debounce}
        getValue={() => (value && value.unit) || ''}
        setValue={onUnit}
      />
      {!readOnly && (
        <button
          type="button"
          class="fpb-icon-button"
          aria-label={translate('Remove actual value') + ' ' + (n + 1)}
          title={translate('Remove actual value') + ' ' + (n + 1)}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * Actual values of a characteristic as a list (016c decision 9), each with
 * value (number or text, Blatt 2 Abschn. 5.2) and unit. Blatt 2 wants a
 * location and time stamp per value; format v1 has no room for it (020a).
 *
 * "Add" shows an empty last row; its first input creates the actual value
 * with it, in one undo step (withField creates what is missing), and a row
 * left empty leaves nothing in the file (016g B1). The row is the last of the
 * same list, so it keeps its fields and focus when it becomes a value; it
 * goes with another element or characteristic. Emptied again with the
 * keyboard (Backspace, the undo of the field), the last value leaves the
 * model and its row stays as the row of "Add" (final review of 016g, I2).
 */
export function ActualValuesEditor(props) {
  const { element, characteristic, index, setField, onRemove } = props;
  const translate = useService('translate');
  const readOnly = usePanelReadOnly();
  const values = asList((characteristic.descriptiveElement || {}).actualValues);
  // the position of the row of "Add", or null
  const [draftAt, setDraftAt] = useState(null);

  useEffect(() => setDraftAt(null), [element, index]);
  // the row became a value; or values went (undo) and it moves up to the end
  useEffect(() => {
    if (draftAt !== null && values.length !== draftAt) {
      setDraftAt(values.length > draftAt ? null : values.length);
    }
  }, [values.length, draftAt]);

  // read in the drawing itself: one frame with the row and its new value
  // would show an empty row too many
  const showDraft = draftAt !== null && !readOnly && values.length <= draftAt;
  const rows = showDraft ? values.length + 1 : values.length;
  const blank = (v) => v === undefined || v === null || v === '';
  // a value at `n`; in the row of "Add" only a text that says something
  const write = (n, key, text, value) => {
    if (n >= values.length) {
      if (text) {
        setField(['descriptiveElement', 'actualValues', n, key], value);
      }
      return;
    }
    const current = values[n] || {};
    const other = key === 'value' ? current.unit : current.value;
    if (!text && blank(other) && n === values.length - 1) {
      setDraftAt(n);
      onRemove(n);
      return;
    }
    setField(['descriptiveElement', 'actualValues', n, key], value);
  };

  return (
    <div class="fpb-actual-values">
      <div class="fpb-actual-values-head">
        <span class="fpb-limits-title">{translate('Actual values')}</span>
        {!readOnly && (
          <button type="button" class="fpb-field-button" aria-label={translate('Add actual value')} onClick={() => setDraftAt(values.length)}>
            {translate('Add')}
          </button>
        )}
      </div>
      {Array.from({ length: rows }, (unused, n) => (
        <ActualValueRow
          key={n}
          element={element}
          index={index}
          n={n}
          value={values[n] || null}
          onValue={(text) => write(n, 'value', text, parseValue(text))}
          onUnit={(text) => write(n, 'unit', text, text || '')}
          onRemove={() => (n < values.length ? onRemove(n) : setDraftAt(null))}
        />
      ))}
    </div>
  );
}
