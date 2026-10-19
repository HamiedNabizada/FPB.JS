/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { useService } from '../context';
import { FpbTextField, isFpbTextFieldEdited } from './FpbTextField';

/**
 * Name and namespace of the project (016b V5), through fpb.updateProject.
 * Neither may be empty: the importer refuses a file without them.
 */
export function ProjectEntries() {
  return [
    { id: 'projectName', component: ProjectField, property: 'name', label: 'Name', required: 'The project needs a name.', isEdited: isFpbTextFieldEdited },
    { id: 'projectNamespace', component: ProjectField, property: 'targetNamespace', label: 'Namespace', required: 'The project needs a namespace.', isEdited: isFpbTextFieldEdited }
  ];
}

function ProjectField(props) {
  const { element, id, property, label, required } = props;
  const fpbjs = useService('fpbjs');
  const modeling = useService('modeling');
  const debounce = useService('debounceInput');
  const translate = useService('translate');

  return (
    <FpbTextField
      element={element}
      id={id}
      label={translate(label)}
      debounce={debounce}
      getValue={() => (fpbjs.getProjectDefinition() || {})[property] || ''}
      validate={(value) => (value && value.trim() ? null : translate(required))}
      setValue={(value) => modeling.updateProject({ [property]: value })}
    />
  );
}
