import React, { useEffect, useState } from 'react';
import Accordion from 'react-bootstrap/Accordion';
import Table from 'react-bootstrap/Table';

import './AmlContent.css';

/**
 * What the kept AML file says about the selected element (feature 028,
 * decisions E6, E8): where it stands in the file, its class and roles, its
 * flows and links, and what goes beyond FPD (attributes, interfaces). Read
 * only: FPB.js carries it through to the AML export. Shown for every element
 * while an AML file is kept; folded unless the user opened it before.
 */

const OPEN_KEY = 'fpbjs.amlSection.open';
const FLOW_LABELS = {
  'fpb:Flow': 'Flow',
  'fpb:ParallelFlow': 'Parallel flow',
  'fpb:AlternativeFlow': 'Alternative flow',
  'fpb:Usage': 'Usage'
};

/** `{ source, ready, entry }` for `elementId`, following the kept file */
export function useAmlContent(modeler, elementId) {
  const amlSupport = modeler.get('amlSupport', false);
  const read = () => ({
    source: amlSupport ? amlSupport.getSource() : null,
    ready: !!(amlSupport && amlSupport.getIndex()),
    entry: amlSupport && elementId ? amlSupport.getForeignContent(elementId) : null
  });
  const [state, setState] = useState(read);

  useEffect(() => {
    if (!amlSupport) {
      return undefined;
    }
    const eventBus = modeler.get('eventBus');
    const update = () => setState(read());
    update();
    eventBus.on('aml.indexChanged', update);
    eventBus.on('aml.sourceChanged', update);
    return () => {
      eventBus.off('aml.indexChanged', update);
      eventBus.off('aml.sourceChanged', update);
    };
  }, [modeler, elementId]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

function readOpen() {
  try {
    return window.localStorage.getItem(OPEN_KEY) === 'true';
  } catch (error) {
    return false;
  }
}

/** Section "AML (read only)"; nothing without a kept AML file */
export default function AmlContentItem({ modeler, elementId }) {
  const { source, ready, entry } = useAmlContent(modeler, elementId);
  const [open, setOpen] = useState(readOpen);

  if (!source) {
    return null;
  }

  const toggle = (key) => {
    const next = key === 'pp_aml';
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, String(next));
    } catch (error) {
      // only a convenience
    }
  };

  return (
    <Accordion activeKey={open ? 'pp_aml' : null} onSelect={toggle} className="pp-aml">
      <Accordion.Item eventKey="pp_aml">
        <Accordion.Header>
          <b>AML (read only)</b>
        </Accordion.Header>
        <Accordion.Body>
          {!ready && <p className="small text-muted mb-0">Reading the AML file…</p>}
          {ready && !entry && (
            <p className="small mb-0 pp-aml-new">
              Not in the AML file yet. The AML export adds it to {source.fileName}.
            </p>
          )}
          {ready && entry && <AmlDetails entry={entry} source={source} />}
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}

function AmlDetails({ entry, source }) {
  return (
    <Table size="sm" className="pp-aml-table">
      <tbody>
        <Row label="File">{source.fileName}</Row>
        <Row label="Path">{entry.path.join(' › ')}</Row>
        {entry.copies.map((copy, i) => (
          <Row key={'c' + i} label="Copy">{copy.join(' › ')}</Row>
        ))}
        <Row label="ID">{entry.amlId}</Row>
        <Row label="Class">{breakable(entry.systemUnitClass)}</Row>
        {entry.roles.length > 0 && (
          <Row label="Roles">{entry.roles.map((r) => <div key={r}>{breakable(r)}</div>)}</Row>
        )}
        {entry.flows.map((f, i) => (
          <Row key={'f' + i} label={FLOW_LABELS[f.type] || 'Flow'} className="pp-aml-flow">
            {(f.direction === 'in' ? '← ' : '→ ') + f.partner}
          </Row>
        ))}
        {entry.links.map((l, i) => (
          <Row key={'l' + i} label="Link" className="pp-aml-link">
            {'↔ ' + l.partner}
            <div className="small text-muted">{l.link}{l.hierarchy ? ' in ' + l.hierarchy : ''}</div>
          </Row>
        ))}
        {entry.attributes.map((a, i) => (
          <Row key={'a' + i} label="Attribute">{a.path} = {a.value}{a.unit ? ' ' + a.unit : ''}</Row>
        ))}
        {entry.interfaces.map((f, i) => (
          <Row key={'i' + i} label="Interface">
            {f.name}
            {f.class && <div className="small text-muted">{breakable(f.class)}</div>}
          </Row>
        ))}
      </tbody>
    </Table>
  );
}

/** Class paths may break after / @ _, not in the middle of a name */
function breakable(text) {
  return String(text || '').split(/(?<=[/@_])/).map((part, i) => (
    <React.Fragment key={i}>{i > 0 && <wbr />}{part}</React.Fragment>
  ));
}

function Row({ label, children, className }) {
  return (
    <tr className={className}>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  );
}
