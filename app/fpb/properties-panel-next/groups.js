import { TextFieldEntry, isTextFieldEntryEdited } from '@bpmn-io/properties-panel';

import { is } from '../help/utils';
import { IdentificationEntries } from './entries/IdentificationEntries';
import { useService } from './context';

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
  }

  if (is(element, 'fpb:SystemLimit')) {
    groups.push({
      id: 'systemLimit',
      label: 'System limit',
      shouldOpen: true,
      entries: [
        { id: 'systemLimitName', component: SystemLimitName, isEdited: isTextFieldEntryEdited }
      ]
    });
  }

  return groups;
}

function SystemLimitName(props) {
  const { element, id } = props;
  const modeling = useService('modeling');
  const debounce = useService('debounceInput');

  return TextFieldEntry({
    element,
    id,
    label: 'Name',
    debounce,
    getValue: (el) => el.businessObject.name || '',
    setValue: (value) => modeling.updateLabel(element, value || '')
  });
}
