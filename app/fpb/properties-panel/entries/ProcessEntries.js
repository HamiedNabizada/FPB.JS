/** @jsx h */
import { markText } from '../../i18n/markText';

import { h } from '@bpmn-io/properties-panel/preact';

import { is } from '../../help/utils';
import { getSystemLimit } from '../../help/helpUtils';
import { useService } from '../context';

/** What the layer holds, for the panel with nothing selected (016b V5) */
export function layerNumbers(process) {
  const top = (process.businessObject.elementsContainer || []).filter(Boolean);
  const systemLimit = getSystemLimit(process);
  const inner = systemLimit ? (systemLimit.businessObject.elementsContainer || []).filter(Boolean) : [];
  const all = top.concat(inner);
  const operators = all.filter((e) => is(e, 'fpb:ProcessOperator'));
  return {
    systemLimit: systemLimit ? (systemLimit.businessObject.name || '') : '',
    states: all.filter((e) => is(e, 'fpb:State')).length,
    operators: operators.length,
    resources: all.filter((e) => is(e, 'fpb:TechnicalResource')).length,
    decompositions: operators.filter((e) => e.businessObject.decomposedView).length
  };
}

const ROWS = [
  ['systemLimit', markText('System limit')],
  ['states', markText('States')],
  ['operators', markText('Process operators')],
  ['resources', markText('Technical resources')],
  ['decompositions', markText('Decomposed operators')]
];

export function ProcessEntries(process) {
  // `field`, not `key`: Preact takes `key` for itself
  const entries = ROWS.map(([field, label]) => ({ id: 'process-' + field, component: LayerNumber, field, label }));
  if (process.businessObject.parent && process.businessObject.isDecomposedProcessOperator) {
    entries.push({ id: 'process-parent', component: ParentLayer });
  }
  return entries;
}

function LayerNumber(props) {
  const { element, id, label, field } = props;
  const translate = useService('translate');
  const value = layerNumbers(element)[field];

  return (
    <div class="bio-properties-panel-entry" data-entry-id={id}>
      <div class="bio-properties-panel-label">{translate(label)}</div>
      <div class="fpb-fixed-value">{String(value)}</div>
    </div>
  );
}

function ParentLayer(props) {
  const { element, id } = props;
  const translate = useService('translate');
  const modeling = useService('modeling');

  return (
    <div class="bio-properties-panel-entry" data-entry-id={id}>
      <button type="button" class="fpb-field-button" onClick={() => modeling.switchProcess(element.businessObject.parent)}>
        {translate('Open parent layer')}
      </button>
    </div>
  );
}
