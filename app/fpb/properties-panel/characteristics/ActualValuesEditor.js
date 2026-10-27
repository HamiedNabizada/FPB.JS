/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { useService } from '../context';
import { usePanelReadOnly } from '../hooks';
import { FpbTextField } from '../entries/FpbTextField';
import { parseValue, formatValue } from '../values';
import { asList } from './model';

/** "1," and 1 are the same value: the field keeps what the user types */
const sameValue = (a, b) => parseValue(a) === parseValue(b);

/**
 * Actual values of a characteristic as a list (016c decision 9), each with
 * value (number or text, Blatt 2 Abschn. 5.2) and unit. Blatt 2 wants a
 * location and time stamp per value; format v1 has no room for it (020a).
 */
export function ActualValuesEditor(props) {
  const { element, characteristic, index, setField, onAdd, onRemove } = props;
  const translate = useService('translate');
  const debounce = useService('debounceInput');
  const readOnly = usePanelReadOnly();
  const values = asList((characteristic.descriptiveElement || {}).actualValues);

  return (
    <div class="fpb-actual-values">
      <div class="fpb-actual-values-head">
        <span class="fpb-limits-title">{translate('Actual values')}</span>
        {!readOnly && (
          <button type="button" class="fpb-field-button" aria-label={translate('Add actual value')} onClick={onAdd}>
            {translate('Add')}
          </button>
        )}
      </div>
      {values.map((value, n) => (
        <div class="fpb-actual-value" key={n}>
          <FpbTextField
            element={element}
            id={'characteristic-' + index + '-actual-' + n + '-value'}
            label={translate('Value')}
            debounce={debounce}
            equals={sameValue}
            getValue={() => formatValue(value && value.value)}
            setValue={(text) => setField(['descriptiveElement', 'actualValues', n, 'value'], parseValue(text))}
          />
          <FpbTextField
            element={element}
            id={'characteristic-' + index + '-actual-' + n + '-unit'}
            label={translate('Unit')}
            debounce={debounce}
            getValue={() => (value && value.unit) || ''}
            setValue={(text) => setField(['descriptiveElement', 'actualValues', n, 'unit'], text || '')}
          />
          {!readOnly && (
            <button
              type="button"
              class="fpb-icon-button"
              aria-label={translate('Remove actual value') + ' ' + (n + 1)}
              title={translate('Remove actual value') + ' ' + (n + 1)}
              onClick={() => onRemove(n)}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
