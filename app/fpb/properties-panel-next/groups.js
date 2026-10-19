/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { is } from '../help/utils';
import { IdentificationEntries } from './entries/IdentificationEntries';
import { FpbTextField, isFpbTextFieldEdited } from './entries/FpbTextField';
import { useService } from './context';
import { CharacteristicsGroup } from './characteristics/CharacteristicsGroup';
import { ConnectionEntries } from './entries/ConnectionEntries';

/**
 * Groups of the properties panel for an element, in display order.
 */
export function getGroups(element) {
  const groups = [];

  if (is(element, 'fpb:Object')) {
    groups.push({
      id: 'identification',
      label: 'Identification',
      shouldOpen: true,
      entries: IdentificationEntries(element)
    });
    groups.push({
      id: 'characteristics',
      label: 'Characteristics',
      component: CharacteristicsGroup
    });
  }

  if (is(element, 'fpb:SystemLimit')) {
    groups.push({
      id: 'systemLimit',
      label: 'System limit',
      shouldOpen: true,
      entries: [
        { id: 'systemLimitName', component: SystemLimitName, isEdited: isFpbTextFieldEdited }
      ]
    });
  }

  if (element.waypoints) {
    groups.push({
      id: 'connection',
      label: 'Connection',
      shouldOpen: true,
      entries: ConnectionEntries(element)
    });
  }

  return groups;
}

function SystemLimitName(props) {
  const { element, id } = props;
  const modeling = useService('modeling');
  const debounce = useService('debounceInput');
  const translate = useService('translate');

  return (
    <FpbTextField
      element={element}
      id={id}
      label={translate('Name')}
      debounce={debounce}
      getValue={(el) => el.businessObject.name || ''}
      setValue={(value) => modeling.updateLabel(element, value || '')}
    />
  );
}
