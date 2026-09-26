import React, { useEffect, useState } from 'react';
import Accordion from 'react-bootstrap/Accordion';
import Table from 'react-bootstrap/Table';

/**
 * What the kept AML file holds for an element beyond FPD (feature 028,
 * decision E6): attributes, interfaces and links from elsewhere in the file.
 * Read only: FPB.js carries it through to the AML export unchanged.
 */

/** The foreign content of `elementId`, following the index as it is built */
export function useAmlContent(modeler, elementId) {
  const amlSupport = modeler.get('amlSupport', false);
  const read = () => (amlSupport && elementId ? amlSupport.getForeignContent(elementId) : null);
  const [content, setContent] = useState(read);

  useEffect(() => {
    if (!amlSupport) {
      return undefined;
    }
    const eventBus = modeler.get('eventBus');
    const update = () => setContent(read());
    update();
    eventBus.on('aml.indexChanged', update);
    eventBus.on('aml.sourceChanged', update);
    return () => {
      eventBus.off('aml.indexChanged', update);
      eventBus.off('aml.sourceChanged', update);
    };
  }, [modeler, elementId]); // eslint-disable-line react-hooks/exhaustive-deps

  return content;
}

const isEmpty = (content) => !content ||
  (!content.attributes.length && !content.interfaces.length && !content.links.length);

/** Accordion item "AML (read only)", nothing when the element has no foreign content */
export default function AmlContentItem({ modeler, elementId }) {
  const content = useAmlContent(modeler, elementId);
  if (isEmpty(content)) {
    return null;
  }

  return (
    <Accordion.Item eventKey="pp_aml" className="pp-aml">
      <Accordion.Header>
        <b>AML (read only)</b>
      </Accordion.Header>
      <Accordion.Body>
        <p className="small text-muted mb-2">
          From the AutomationML file. FPB.js keeps it and writes it back on the AML export.
        </p>
        <Table size="sm" className="pp-aml-table">
          <tbody>
            {content.attributes.map((a, i) => (
              <tr key={'a' + i}>
                <th scope="row">Attribute</th>
                <td>{a.path}</td>
                <td>{a.value}{a.unit ? ' ' + a.unit : ''}</td>
              </tr>
            ))}
            {content.interfaces.map((f, i) => (
              <tr key={'i' + i}>
                <th scope="row">Interface</th>
                <td>{f.name}</td>
                <td>{f.class}</td>
              </tr>
            ))}
            {content.links.map((l, i) => (
              <tr key={'l' + i}>
                <th scope="row">Link</th>
                <td>{l.link}</td>
                <td>{'→ ' + l.partner}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Accordion.Body>
    </Accordion.Item>
  );
}
