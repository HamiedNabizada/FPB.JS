/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { is } from '../help/utils';
import { IdentificationEntries } from './entries/IdentificationEntries';
import { FpbTextField, isFpbTextFieldEdited } from './entries/FpbTextField';
import { useService } from './context';
import { CharacteristicsGroup } from './characteristics/CharacteristicsGroup';
import { ConnectionEntries } from './entries/ConnectionEntries';
import { ProjectEntries } from './entries/ProjectEntries';
import { ProcessEntries } from './entries/ProcessEntries';

/**
 * Groups of the properties panel for an element, in display order. Group
 * titles go through translate (016b T11); the characteristics group draws its
 * own head and translates its title there.
 */
export function getGroups(element, translate = (text) => text) {
  const groups = [];

  if (is(element, 'fpb:Process')) {
    groups.push({ id: 'project', label: translate('Project'), shouldOpen: true, entries: ProjectEntries() });
    groups.push({ id: 'process', label: translate('Process'), shouldOpen: true, entries: ProcessEntries(element) });
  }

  if (is(element, 'fpb:Object')) {
    groups.push({
      id: 'identification',
      label: translate('Identification'),
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
      label: translate('System limit'),
      shouldOpen: true,
      entries: [
        { id: 'systemLimitName', component: SystemLimitName, isEdited: isFpbTextFieldEdited }
      ]
    });
  }

  if (element.waypoints) {
    groups.push({
      id: 'connection',
      label: translate('Connection'),
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
