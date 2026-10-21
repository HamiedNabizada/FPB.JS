import React, { useEffect, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useThemeAttributes } from '../layer-panel/hooks/useThemeAttributes';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { collectProcessShapes } from '../help/processShapes';
import { collectEntries } from '../search/SearchIndex';
import { goToElement } from '../help/navigation';

/**
 * "AML file" in the options (feature 028): everything the kept AutomationML
 * file holds besides the open process view, which FPB.js carries through to
 * the AML export: other hierarchies, libraries, external references, and the
 * elements with more than FPD, each one step away. Also the switch for the
 * marks of those elements on the canvas (off by default).
 *
 * Shown only when the AML module is there and a file is kept.
 */
export default function AmlOverview({ modeler }) {
  const themeAttributes = useThemeAttributes(modeler);
  const amlSupport = modeler.get('amlSupport', false);
  const amlMarkers = modeler.get('amlMarkers', false);
  const [overview, setOverview] = useState(() => (amlSupport ? amlSupport.getOverview() : null));
  const [source, setSource] = useState(() => (amlSupport ? amlSupport.getSource() : null));
  const [markers, setMarkers] = useState(() => (amlMarkers ? amlMarkers.isEnabled() : false));
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!amlSupport) {
      return undefined;
    }
    const eventBus = modeler.get('eventBus');
    const update = () => {
      setOverview(amlSupport.getOverview());
      setSource(amlSupport.getSource());
    };
    const updateMarkers = (event) => setMarkers(event.enabled);
    eventBus.on(['aml.sourceChanged', 'aml.indexChanged'], update);
    eventBus.on('aml.markersChanged', updateMarkers);
    return () => {
      eventBus.off(['aml.sourceChanged', 'aml.indexChanged'], update);
      eventBus.off('aml.markersChanged', updateMarkers);
    };
  }, [modeler, amlSupport]);

  if (!amlSupport || !source) {
    return null;
  }

  const label = 'AML file';
  const goTo = (id) => {
    const entries = collectEntries(collectProcessShapes(modeler.getProjectDefinition()));
    const root = modeler.get('canvas').getRootElement();
    const entry = entries.find((e) => e.id === id && e.process === root) || entries.find((e) => e.id === id);
    if (!entry) {
      return;
    }
    setShow(false);
    goToElement({
      canvas: modeler.get('canvas'),
      modeling: modeler.get('modeling'),
      elementRegistry: modeler.get('elementRegistry'),
      selection: modeler.get('selection')
    }, entry.process, entry.id);
  };

  return (
    <div className="aml-overview">
      <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-aml-overview">{label}</Tooltip>}>
        <Button id="amlOverviewButton" variant="secondary-outline" aria-label={label} onClick={() => setShow(true)}>
          <FontAwesomeIcon icon="file-code" size="lg" />
        </Button>
      </OverlayTrigger>

      <Modal show={show} onHide={() => setShow(false)} centered size="lg" className="aml-overview-modal" {...themeAttributes}>
        <Modal.Header closeButton closeLabel="Close AML file overview">
          <Modal.Title>AML file: {source.fileName}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted">
            FPB.js shows the process view {source.hierarchyName ? <b>{source.hierarchyName}</b> : '(none yet)'}.
            Everything else in the file stays as it is and is written back on the AML export.
          </p>
          {!overview && <p className="aml-overview-loading">Reading the file…</p>}
          {overview && (
            <>
              <h6>Elements with more from the file</h6>
              {overview.elements.length ? (
                <>
                  <Table size="sm" className="aml-overview-elements">
                    <tbody>
                      {overview.elements.map((e) => (
                        <tr key={e.id}>
                          <td>{e.name}</td>
                          <td className="small text-muted">{describeCounts(e)}</td>
                          <td className="text-end">
                            <Button size="sm" variant="outline-secondary" onClick={() => goTo(e.id)} aria-label={'Show ' + e.name}>Show</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {amlMarkers && (
                    <Form.Check
                      type="switch"
                      id="amlMarkersSwitch"
                      label="Mark these elements on the canvas"
                      checked={markers}
                      onChange={(event) => amlMarkers.setEnabled(event.target.checked)}
                    />
                  )}
                </>
              ) : (
                <p className="small">No element of the process view carries more than FPD.</p>
              )}

              <h6 className="mt-3">Hierarchies</h6>
              <Table size="sm" className="aml-overview-hierarchies">
                <tbody>
                  {overview.hierarchies.map((h) => (
                    <tr key={h.id || h.name}>
                      <td>{h.name}</td>
                      <td className="small text-muted">
                        {h.open ? 'process view, open in FPB.js' : h.fpd ? 'process view' : 'other content'}
                      </td>
                      <td className="small text-muted text-end">{h.elements} {h.elements === 1 ? 'element' : 'elements'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <h6 className="mt-3">Libraries</h6>
              <Table size="sm" className="aml-overview-libraries">
                <tbody>
                  {overview.libraries.map((l, i) => (
                    <tr key={i}>
                      <td>{l.name}</td>
                      <td className="small text-muted">{l.kind}{l.fpd ? ', FPD' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {overview.externalReferences.length > 0 && (
                <>
                  <h6 className="mt-3">External references</h6>
                  <Table size="sm" className="aml-overview-references">
                    <tbody>
                      {overview.externalReferences.map((r, i) => (
                        <tr key={i}>
                          <td>{r.alias}</td>
                          <td className="small text-muted">{r.path}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
            </>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}

function describeCounts(e) {
  const parts = [];
  if (e.attributes) {
    parts.push(e.attributes + (e.attributes === 1 ? ' attribute' : ' attributes'));
  }
  if (e.interfaces) {
    parts.push(e.interfaces + (e.interfaces === 1 ? ' interface' : ' interfaces'));
  }
  if (e.links) {
    parts.push(e.links + (e.links === 1 ? ' link' : ' links'));
  }
  return parts.join(', ');
}
