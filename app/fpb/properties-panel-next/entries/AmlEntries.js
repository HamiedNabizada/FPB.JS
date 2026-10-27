/** @jsx h */
import { h, Fragment } from '@bpmn-io/properties-panel/preact';

import { useService } from '../context';

/**
 * What the kept AML file says about the element (028 E6, E9): where it stands
 * in the file, its class and roles, its flows and links, and what goes beyond
 * FPD. Read only; FPB.js carries it through to the AML export. Taken over
 * from the AML section of the React panel, which phase B3 removed.
 */
const FLOW_LABELS = {
  'fpb:Flow': 'Flow',
  'fpb:ParallelFlow': 'Parallel flow',
  'fpb:AlternativeFlow': 'Alternative flow',
  'fpb:Usage': 'Usage'
};

export function AmlEntries() {
  return [{ id: 'amlDetails', component: AmlDetails }];
}

/** Class paths may break after / @ _, not in the middle of a name */
function breakable(text) {
  return String(text || '').split(/(?<=[/@_])/).map((part, i) => <Fragment key={i}>{i > 0 && <wbr />}{part}</Fragment>);
}

function Row(props) {
  return (
    <tr class={props.class}>
      <th scope="row">{props.label}</th>
      <td>{props.children}</td>
    </tr>
  );
}

function AmlDetails(props) {
  const { element, id } = props;
  const amlSupport = useService('amlSupport', false);
  const translate = useService('translate');
  const source = amlSupport && amlSupport.getSource();

  if (!source) {
    return null;
  }
  if (!amlSupport.getIndex()) {
    return (
      <div class="bio-properties-panel-entry" data-entry-id={id}>
        <p class="fpb-characteristic-none">{translate('Reading the AML file…')}</p>
      </div>
    );
  }

  const entry = amlSupport.getForeignContent(element.id);
  if (!entry) {
    return (
      <div class="bio-properties-panel-entry" data-entry-id={id}>
        <p class="fpb-characteristic-none pp-aml-new">
          {translate('Not in the AML file yet. The AML export adds it to {file}.', { file: source.fileName })}
        </p>
      </div>
    );
  }

  return (
    <div class="bio-properties-panel-entry" data-entry-id={id}>
      <table class="fpb-aml-table">
        <tbody>
          <Row label={translate('File')}>{source.fileName}</Row>
          <Row label={translate('Path')}>{entry.path.join(' › ')}</Row>
          {entry.copies.map((copy, i) => <Row key={'c' + i} label={translate('Copy')}>{copy.join(' › ')}</Row>)}
          <Row label={translate('ID')}>{entry.amlId}</Row>
          <Row label={translate('Class')}>{breakable(entry.systemUnitClass)}</Row>
          {entry.roles.length > 0 && (
            <Row label={translate('Roles')}>{entry.roles.map((r) => <div key={r}>{breakable(r)}</div>)}</Row>
          )}
          {entry.flows.map((f, i) => (
            <Row key={'f' + i} label={translate(FLOW_LABELS[f.type] || 'Flow')} class="pp-aml-flow">
              {(f.direction === 'in' ? '← ' : '→ ') + f.partner}
            </Row>
          ))}
          {entry.links.map((l, i) => (
            <Row key={'l' + i} label={translate('Link')} class="pp-aml-link">
              {'↔ ' + l.partner}
              <div class="fpb-aml-subtle">{l.link}{l.hierarchy ? ' ' + translate('in') + ' ' + l.hierarchy : ''}</div>
            </Row>
          ))}
          {entry.attributes.map((a, i) => (
            <Row key={'a' + i} label={translate('Attribute')}>{a.path} = {a.value}{a.unit ? ' ' + a.unit : ''}</Row>
          ))}
          {entry.interfaces.map((f, i) => (
            <Row key={'i' + i} label={translate('Interface')}>
              {f.name}
              {f.class && <div class="fpb-aml-subtle">{breakable(f.class)}</div>}
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}
