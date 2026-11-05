/** @jsx h */
import { markText } from '../../i18n/markText';

import { h } from '@bpmn-io/properties-panel/preact';

import { cloneModdle } from '../../help/moddleClone';
import { useService } from '../context';
import { FpbTextField, isFpbTextFieldEdited } from './FpbTextField';

/**
 * Identification of an FPB object (VDI 3682): short name, long name, version,
 * revision and the read-only unique id with a copy button (016 E5).
 *
 * The short name is the name on the canvas and goes through updateLabel, so
 * the name follows into the other layers. The other fields change a copy of
 * the identification: handing the same object back to updateProperties would
 * leave undo nothing to return to.
 */
export function IdentificationEntries(element) {
  return [
    { id: 'shortName', component: ShortName, isEdited: isFpbTextFieldEdited },
    { id: 'longName', component: IdentificationField, property: 'longName', label: markText('Long name'), isEdited: isFpbTextFieldEdited },
    { id: 'versionNumber', component: IdentificationField, property: 'versionNumber', label: markText('Version'), isEdited: isFpbTextFieldEdited },
    { id: 'revisionNumber', component: IdentificationField, property: 'revisionNumber', label: markText('Revision'), isEdited: isFpbTextFieldEdited },
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
  const translate = useService('translate');

  return (
    <FpbTextField
      element={element}
      id={id}
      label={translate('Name')}
      debounce={debounce}
      getValue={(el) => {
        const identification = identificationOf(el);
        return (identification && identification.shortName) || '';
      }}
      setValue={(value) => modeling.updateLabel(element, value || '')}
    />
  );
}

function IdentificationField(props) {
  const { element, id, property, label } = props;
  const modeling = useService('modeling');
  const fpbFactory = useService('fpbFactory');
  const debounce = useService('debounceInput');
  const translate = useService('translate');

  return (
    <FpbTextField
      element={element}
      id={id}
      label={translate(label)}
      debounce={debounce}
      getValue={(el) => {
        const identification = identificationOf(el);
        return (identification && identification[property]) || '';
      }}
      setValue={(value) => {
        const identification = cloneModdle(fpbFactory, identificationOf(element));
        identification[property] = value || '';
        modeling.updateProperties(element, { identification });
      }}
    />
  );
}

function UniqueIdent(props) {
  const { element, id } = props;
  const debounce = useService('debounceInput');
  const translate = useService('translate');
  const value = ((identificationOf(element) || {}).uniqueIdent) || element.id;
  const copy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value);
    }
  };

  return (
    <FpbTextField
      element={element}
      id={id}
      label={translate('Unique ID')}
      debounce={debounce}
      readOnly
      getValue={() => value}
      setValue={() => {}}
    >
      <button type="button" class="fpb-field-button" aria-label={translate('Copy unique ID')} title={translate('Copy unique ID')} onClick={copy}>
        {translate('Copy')}
      </button>
    </FpbTextField>
  );
}
