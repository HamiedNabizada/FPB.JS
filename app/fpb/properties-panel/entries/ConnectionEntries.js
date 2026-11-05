/** @jsx h */
import { markText } from '../../i18n/markText';

import { h } from '@bpmn-io/properties-panel/preact';
import { SelectEntry } from '@bpmn-io/properties-panel';

import { is } from '../../help/utils';
import { useService } from '../context';
import { usePanelReadOnly } from '../hooks';
import { getTypeLabel } from '../header';
import { ReferenceEntry } from './ReferenceEntry';

const BRANCHES = ['fpb:ParallelFlow', 'fpb:AlternativeFlow'];
const isBranch = (element) => BRANCHES.some((type) => is(element, type));

/**
 * Type, source, target and partners of a connection (016b V4). Only a
 * branching changes its type, between parallel and alternative, for the
 * whole branching like the type menu on the canvas.
 */
export function ConnectionEntries(element) {
  const entries = [
    { id: 'connectionType', component: isBranch(element) ? BranchType : FixedType },
    { id: 'connectionSource', component: Reference, label: markText('Source'), side: 'source' },
    { id: 'connectionTarget', component: Reference, label: markText('Target'), side: 'target' }
  ];
  if (isBranch(element)) {
    entries.push({ id: 'connectionPartners', component: Partners });
  }
  return entries;
}

function BranchType(props) {
  const { element, id } = props;
  const translate = useService('translate');
  const commandStack = useService('commandStack');
  const readOnly = usePanelReadOnly();

  return SelectEntry({
    element,
    id,
    label: translate('Type'),
    disabled: readOnly,
    getValue: (el) => el.type,
    setValue: (newType) => commandStack.execute('fpb.changeType', { element, newType }),
    getOptions: () => [
      { value: 'fpb:ParallelFlow', label: translate('Parallel flow') },
      { value: 'fpb:AlternativeFlow', label: translate('Alternative flow') }
    ]
  });
}

function FixedType(props) {
  const { element, id } = props;
  const translate = useService('translate');

  return (
    <div class="bio-properties-panel-entry" data-entry-id={id}>
      <div class="bio-properties-panel-label">{translate('Type')}</div>
      <div class="fpb-fixed-value">{translate(getTypeLabel(element))}</div>
    </div>
  );
}

function Reference(props) {
  const { element, id, label, side } = props;
  return <ReferenceEntry id={id} label={label} targets={[element[side]]} />;
}

function Partners(props) {
  const { element, id } = props;
  const partners = (element.businessObject.inTandemWith || []).filter((partner) => partner && partner.id !== element.id);
  return <ReferenceEntry id={id} label={markText('Branching partners')} targets={partners} />;
}
