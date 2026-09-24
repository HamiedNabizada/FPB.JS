import { TextFieldEntry, isTextFieldEntryEdited } from '@bpmn-io/properties-panel';

import { cloneModdle } from '../../help/moddleClone';
import { useService } from '../context';

/**
 * Identification of an FPB object (VDI 3682): short name, long name, version,
 * revision and the read-only unique id.
 *
 * The short name is the name on the canvas and goes through updateLabel, so
 * the name follows into the other layers. The other fields change a copy of
 * the identification: handing the same object back to updateProperties would
 * leave undo nothing to return to.
 */
export function IdentificationEntries(element) {
  return [
    { id: 'shortName', component: ShortName, isEdited: isTextFieldEntryEdited },
    { id: 'longName', component: IdentificationField, property: 'longName', label: 'Long name', isEdited: isTextFieldEntryEdited },
    { id: 'versionNumber', component: IdentificationField, property: 'versionNumber', label: 'Version', isEdited: isTextFieldEntryEdited },
    { id: 'revisionNumber', component: IdentificationField, property: 'revisionNumber', label: 'Revision', isEdited: isTextFieldEntryEdited },
    { id: 'uniqueIdent', component: UniqueIdent }
  ];
}

function identificationOf(element) {
  return element.businessObject.get('identification');
}

function ShortName(props) {
  const { element, id } = props;
  const modeling = useService('modeling');
  const debounce = useService('debounceInput');

  return TextFieldEntry({
    element,
    id,
    label: 'Name',
    debounce,
    getValue: (el) => {
      const identification = identificationOf(el);
      return (identification && identification.shortName) || '';
    },
    setValue: (value) => modeling.updateLabel(element, value || '')
  });
}

function IdentificationField(props) {
  const { element, id, property, label } = props;
  const modeling = useService('modeling');
  const fpbFactory = useService('fpbFactory');
  const debounce = useService('debounceInput');

  return TextFieldEntry({
    element,
    id,
    label,
    debounce,
    getValue: (el) => {
      const identification = identificationOf(el);
      return (identification && identification[property]) || '';
    },
    setValue: (value) => {
      const identification = cloneModdle(fpbFactory, identificationOf(element));
      identification[property] = value || '';
      modeling.updateProperties(element, { identification });
    }
  });
}

function UniqueIdent(props) {
  const { element, id } = props;
  // read-only, but the entry expects a debounce function all the same
  const debounce = useService('debounceInput');

  return TextFieldEntry({
    element,
    id,
    label: 'Unique ID',
    debounce,
    disabled: true,
    getValue: (el) => {
      const identification = identificationOf(el);
      return (identification && identification.uniqueIdent) || el.id;
    },
    setValue: () => {}
  });
}
