/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { useService } from '../context';
import { usePanelReadOnly } from '../hooks';
import { FpbTextField } from '../entries/FpbTextField';
import { formatValue } from '../values';
import { readLimits, withRegionBound, withoutLimit, parseLimit } from './limits';

const sameLimit = (a, b) => parseLimit(a).value === parseLimit(b).value;

const REGION_LABELS = [
  ['acceptance', 'Acceptance region'],
  ['permitted', 'Permitted rejection region']
];

/**
 * Validity limits of the setpoint, by the regions of VDI 3682 Blatt 2
 * Abschn. 5.2 (016c decision 8): two regions with a lower and an upper limit;
 * limits of other types, as older files have them, are shown as text with a
 * remove button. `update(fn)` writes the list `fn` makes from the current one.
 */
export function LimitsEditor(props) {
  const { element, characteristic, index, update } = props;
  const translate = useService('translate');
  const debounce = useService('debounceInput');
  const fpbFactory = useService('fpbFactory');
  const readOnly = usePanelReadOnly();
  const descriptive = characteristic.descriptiveElement || {};
  const limits = readLimits(descriptive.validityLimits);
  const create = (type, attrs) => fpbFactory.create(type, attrs);

  const bound = (region, which, label) => (
    <FpbTextField
      element={element}
      id={'characteristic-' + index + '-' + region + '-' + which}
      label={translate(label)}
      debounce={debounce}
      equals={sameLimit}
      validate={(text) => {
        const { error } = parseLimit(text);
        return error ? translate(error) : null;
      }}
      getValue={() => formatValue(limits[region] ? limits[region][which] : undefined)}
      setValue={(text) => update((list) => withRegionBound(list, region, which, parseLimit(text).value, create))}
    />
  );

  return (
    <div class="fpb-limits">
      <div class="fpb-limits-title">{translate('Validity limits of the setpoint')}</div>
      {REGION_LABELS.map(([region, label]) => (
        <div class="fpb-limit-region" role="group" aria-label={translate(label)} key={region}>
          <div class="fpb-limit-region-title">{translate(label)}</div>
          <div class="fpb-limit-bounds">
            {bound(region, 'from', 'Lower limit')}
            {bound(region, 'to', 'Upper limit')}
          </div>
        </div>
      ))}
      <p class="fpb-limits-note">{translate('Outside the permitted rejection region the value is not permissible.')}</p>
      {limits.others.map((other) => (
        <div class="fpb-other-limit" key={'other-' + other.index}>
          <span>
            {(other.limitType || translate('Limit')) + ': ' + formatValue(other.from) + ' ' + translate('to') + ' ' + formatValue(other.to)}
          </span>
          {!readOnly && (
            <button type="button" class="fpb-link-button" onClick={() => update((list) => withoutLimit(list, other.index))}>
              {translate('Remove limit')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
