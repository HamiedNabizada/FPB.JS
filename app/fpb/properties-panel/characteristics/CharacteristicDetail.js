/** @jsx h */
import { markText } from '../../i18n/markText';

import { h } from '@bpmn-io/properties-panel/preact';
import { useLayoutState } from '@bpmn-io/properties-panel';

import { useService } from '../context';
import { usePanelReadOnly } from '../hooks';
import { FpbTextField } from '../entries/FpbTextField';
import { parseValue, formatValue } from '../values';
import { LimitsEditor } from './LimitsEditor';
import { ActualValuesEditor } from './ActualValuesEditor';

/** The three parts of Blatt 2 as tabs (016c decision 7) */
const TABS = [
  { id: 'category', label: markText('Category'), section: 'Category' },
  { id: 'descriptive', label: markText('Descriptive'), section: 'Descriptive element' },
  { id: 'relational', label: markText('Relational'), section: 'Relational element' }
];

/** "1," and 1 are the same value: the field keeps what the user types */
const sameValue = (a, b) => parseValue(a) === parseValue(b);

const read = (object, path) => path.reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), object);

/** Fields of the detail area, grouped as in VDI 3682 Blatt 2 Bild 5 to 7 */
const SECTIONS = [
  ['Category', [
    ['categoryShortName', markText('Short name'), ['category', 'shortName']],
    ['categoryLongName', markText('Long name'), ['category', 'longName']],
    ['categoryVersion', markText('Version'), ['category', 'versionNumber']],
    ['categoryRevision', markText('Revision'), ['category', 'revisionNumber']],
    ['categoryIdent', markText('Unique ID'), ['category', 'uniqueIdent'], { readOnly: true }]
  ]],
  ['Descriptive element', [
    ['valueDetermination', markText('Value determination process'), ['descriptiveElement', 'valueDeterminationProcess']],
    ['representivity', markText('Representivity'), ['descriptiveElement', 'representivity']],
    ['setpoint', markText('Setpoint'), ['descriptiveElement', 'setpointValue', 'value'], { value: true }],
    ['setpointUnit', markText('Setpoint unit'), ['descriptiveElement', 'setpointValue', 'unit']]
  ]],
  ['Relational element', [
    ['view', markText('View'), ['relationalElement', 'view']],
    ['model', markText('Model'), ['relationalElement', 'model']],
    ['regulations', markText('Regulations for relational generation'), ['relationalElement', 'regulationsForRelationalGeneration']]
  ]]
];

/**
 * Detail area of one characteristic. Keyed by its element and its index in
 * the group, so a pending (debounced) input still writes into the
 * characteristic it was typed in when another one or another element is
 * chosen (Review Focus 2).
 */
export function CharacteristicDetail(props) {
  const { element, characteristic, index, setField, updateLimits, removeActual, onRemove } = props;
  const translate = useService('translate');
  const debounce = useService('debounceInput');
  const readOnly = usePanelReadOnly();
  // the chosen part stays for the next characteristic (016c T10)
  const [tab, setTab] = useLayoutState(['characteristics', 'tab'], 'descriptive');
  const active = TABS.find((t) => t.id === tab) || TABS[1];
  const section = SECTIONS.find(([title]) => title === active.section);

  const onKeyDown = (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      const next = TABS[(TABS.indexOf(active) + step + TABS.length) % TABS.length];
      setTab(next.id);
      // the focus goes with the chosen tab (the old one leaves the tab order)
      const button = event.currentTarget.querySelector('#characteristic-tab-' + next.id);
      if (button) {
        button.focus();
      }
      event.preventDefault();
    }
  };

  return (
    <div class="fpb-characteristic-detail" data-index={index}>
      <div class="fpb-characteristic-tabs" role="tablist" aria-label={translate('Parts of the characteristic')} onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={'characteristic-tab-' + t.id}
            aria-controls={'characteristic-panel-' + index}
            class="fpb-characteristic-tab"
            aria-selected={t === active ? 'true' : 'false'}
            tabIndex={t === active ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {translate(t.label)}
          </button>
        ))}
      </div>
      {[section].map(([title, fields]) => (
        <div class="fpb-characteristic-section" role="tabpanel" id={'characteristic-panel-' + index} aria-labelledby={'characteristic-tab-' + active.id}>
          {fields.map(([key, label, path, options = {}]) => [
            <FpbTextField
              element={element}
              id={'characteristic-' + index + '-' + key}
              label={translate(label)}
              debounce={debounce}
              readOnly={options.readOnly}
              equals={options.value ? sameValue : undefined}
              getValue={() => (options.value ? formatValue(read(characteristic, path)) : read(characteristic, path) || '')}
              setValue={(text) => setField(path, options.value ? parseValue(text) : (text || ''))}
            />,
            // Blatt 2: the setpoint "with its validity limits"
            key === 'setpointUnit' && updateLimits && (
              <LimitsEditor element={element} characteristic={characteristic} index={index} update={updateLimits} />
            ),
            key === 'setpointUnit' && removeActual && (
              <ActualValuesEditor element={element} characteristic={characteristic} index={index}
                setField={setField} onRemove={removeActual} />
            )
          ])}
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
