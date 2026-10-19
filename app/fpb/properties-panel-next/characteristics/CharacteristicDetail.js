/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { useService } from '../context';
import { usePanelReadOnly } from '../hooks';
import { FpbTextField } from '../entries/FpbTextField';
import { parseValue, formatValue } from '../values';
import { asList } from './model';

/** "1," and 1 are the same value: the field keeps what the user types */
const sameValue = (a, b) => parseValue(a) === parseValue(b);

const read = (object, path) => path.reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), object);

/** Fields of the detail area, grouped as in VDI 3682 Blatt 2 Bild 5 to 7 */
const SECTIONS = [
  ['Category', [
    ['categoryShortName', 'Short name', ['category', 'shortName']],
    ['categoryLongName', 'Long name', ['category', 'longName']],
    ['categoryVersion', 'Version', ['category', 'versionNumber']],
    ['categoryRevision', 'Revision', ['category', 'revisionNumber']],
    ['categoryIdent', 'Unique ID', ['category', 'uniqueIdent'], { readOnly: true }]
  ]],
  ['Descriptive element', [
    ['valueDetermination', 'Value determination process', ['descriptiveElement', 'valueDeterminationProcess']],
    ['representivity', 'Representivity', ['descriptiveElement', 'representivity']],
    ['setpoint', 'Setpoint', ['descriptiveElement', 'setpointValue', 'value'], { value: true }],
    ['setpointUnit', 'Setpoint unit', ['descriptiveElement', 'setpointValue', 'unit']],
    ['actual', 'Actual value', ['descriptiveElement', 'actualValues', 0, 'value'], { value: true }],
    ['actualUnit', 'Actual value unit', ['descriptiveElement', 'actualValues', 0, 'unit']]
  ]],
  ['Relational element', [
    ['view', 'View', ['relationalElement', 'view']],
    ['model', 'Model', ['relationalElement', 'model']],
    ['regulations', 'Regulations for relational generation', ['relationalElement', 'regulationsForRelationalGeneration']]
  ]]
];

/**
 * Detail area of one characteristic. Keyed by its element and its index in
 * the group, so a pending (debounced) input still writes into the
 * characteristic it was typed in when another one or another element is
 * chosen (Review Focus 2).
 */
export function CharacteristicDetail(props) {
  const { element, characteristic, index, setField, onRemove } = props;
  const translate = useService('translate');
  const debounce = useService('debounceInput');
  const readOnly = usePanelReadOnly();
  const name = (characteristic.category && characteristic.category.shortName) || ('C_' + (index + 1));

  return (
    <div class="fpb-characteristic-detail" data-index={index}>
      <div class="fpb-characteristic-title">{name}</div>
      {SECTIONS.map(([title, fields]) => (
        <div class="fpb-characteristic-section">
          <div class="fpb-characteristic-section-title">{translate(title)}</div>
          {fields.map(([key, label, path, options = {}]) => (
            <FpbTextField
              element={element}
              id={'characteristic-' + index + '-' + key}
              label={translate(label)}
              debounce={debounce}
              readOnly={options.readOnly}
              equals={options.value ? sameValue : undefined}
              getValue={() => (options.value ? formatValue(read(characteristic, path)) : read(characteristic, path) || '')}
              setValue={(text) => setField(path, options.value ? parseValue(text) : (text || ''))}
            />
          ))}
          {title === 'Descriptive element' && <MoreValues characteristic={characteristic} translate={translate} />}
        </div>
      ))}
      {!readOnly && (
        <button type="button" class="fpb-field-button fpb-remove-characteristic" onClick={onRemove}>
          {translate('Remove characteristic')}
        </button>
      )}
    </div>
  );
}

/** The default limit older versions created for every characteristic */
const isEmptyDefault = (limit) => !limit.limitType && Number(limit.from || 0) === 0 && Number(limit.to || 0) === 0;

/**
 * Validity limits and the actual values after the first, shown but not
 * edited (016 E6, 016b V3; editing comes with the format after the GMA
 * committee, 020a).
 */
function MoreValues(props) {
  const { characteristic, translate } = props;
  const descriptive = characteristic.descriptiveElement || {};
  const limits = asList(descriptive.validityLimits).filter((limit) => !isEmptyDefault(limit));
  const more = asList(descriptive.actualValues).slice(1);

  return (
    <div class="fpb-characteristic-more">
      <div class="bio-properties-panel-label">{translate('Validity limits')}</div>
      {limits.length ? (
        <ul class="fpb-characteristic-limits">
          {limits.map((limit) => (
            <li>{(limit.limitType || translate('limit')) + ': ' + formatValue(limit.from) + ' ' + translate('to') + ' ' + formatValue(limit.to)}</li>
          ))}
        </ul>
      ) : (
        <p class="fpb-characteristic-none">{translate('None')}</p>
      )}
      {more.length > 0 && (
        <div>
          <div class="bio-properties-panel-label">{translate('Further actual values')}</div>
          <ul class="fpb-characteristic-more-actuals">
            {more.map((value) => <li>{formatValue(value.value) + (value.unit ? ' ' + value.unit : '')}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
