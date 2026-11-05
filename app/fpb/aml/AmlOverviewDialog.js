/** @jsx h */
import { describeAmlCounts } from './AmlMarkers';
import { h } from '@bpmn-io/properties-panel/preact';
import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks';

import DialogFrame from '../dialogs/DialogFrame';

/**
 * "AML file" (feature 028, 016e V7): everything the kept AutomationML file
 * holds besides the open process view, which FPB.js carries through to the
 * AML export: other hierarchies, libraries, external references, and the
 * elements with more than FPD, each one step away. Also the switch for the
 * marks of those elements on the canvas (off by default).
 */
export default function AmlOverviewDialog(props) {
  const { close, titleId, eventBus, amlSupport, amlMarkers, goTo, translate } = props;
  const [overview, setOverview] = useState(() => amlSupport.getOverview());
  const [source, setSource] = useState(() => amlSupport.getSource());
  const [markers, setMarkers] = useState(() => (amlMarkers ? amlMarkers.isEnabled() : false));

  useEffect(() => {
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
  }, []);

  const show = (id) => {
    close();
    goTo(id);
  };

  return (
    <DialogFrame
      title={source && source.fileName ? translate('AML file: {name}', { name: source.fileName }) : translate('AML file')}
      titleId={titleId}
      onClose={() => close()}
      closeLabel={translate('Close AML file overview')}
    >
      <p class="aml-overview-intro">
        {translate('FPB.js shows the process view')}{' '}
        {source && source.hierarchyName ? <b>{source.hierarchyName}</b> : translate('(none yet)')}.{' '}
        {translate('Everything else in the file stays as it is and is written back on the AML export.')}
      </p>
      {!overview && <p class="aml-overview-loading">{translate('Reading the file…')}</p>}
      {overview && [
        <h3 key="elements-title">{translate('Elements with more from the file')}</h3>,
        overview.elements.length
          ? [
            <table key="elements" class="aml-overview-table aml-overview-elements">
              <tbody>
                {overview.elements.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td class="aml-overview-muted">{describeCounts(e, translate)}</td>
                    <td class="aml-overview-end">
                      <button type="button" class="fpb-button fpb-button--small" aria-label={translate('Show {name}', { name: e.name || e.id })} onClick={() => show(e.id)}>
                        {translate('Show')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>,
            amlMarkers && (
              <label key="markers" class="aml-overview-switch">
                <input
                  type="checkbox"
                  role="switch"
                  id="amlMarkersSwitch"
                  checked={markers}
                  onChange={(event) => amlMarkers.setEnabled(event.target.checked)}
                />
                {translate('Mark these elements on the canvas')}
              </label>
            )
          ]
          : <p key="no-elements">{translate('No element of the process view carries more than FPD.')}</p>,

        <h3 key="hierarchies-title">{translate('Hierarchies')}</h3>,
        <table key="hierarchies" class="aml-overview-table aml-overview-hierarchies">
          <tbody>
            {overview.hierarchies.map((hierarchy) => (
              <tr key={hierarchy.id || hierarchy.name}>
                <td>{hierarchy.name}</td>
                <td class="aml-overview-muted">
                  {hierarchy.open
                    ? translate('process view, open in FPB.js')
                    : hierarchy.fpd ? translate('process view') : translate('other content')}
                </td>
                <td class="aml-overview-muted aml-overview-end">
                  {hierarchy.elements === 1 ? translate('1 element') : translate('{count} elements', { count: hierarchy.elements })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>,

        <h3 key="libraries-title">{translate('Libraries')}</h3>,
        <table key="libraries" class="aml-overview-table aml-overview-libraries">
          <tbody>
            {overview.libraries.map((library, index) => (
              <tr key={index}>
                <td>{library.name}</td>
                <td class="aml-overview-muted">{library.fpd ? translate('{kind}, FPD', { kind: translate(library.kind) }) : translate(library.kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>,

        overview.externalReferences.length > 0 && [
          <h3 key="references-title">{translate('External references')}</h3>,
          <table key="references" class="aml-overview-table aml-overview-references">
            <tbody>
              {overview.externalReferences.map((reference, index) => (
                <tr key={index}>
                  <td>{reference.alias}</td>
                  <td class="aml-overview-muted">{reference.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ]
      ]}
    </DialogFrame>
  );
}

function describeCounts(e, translate) {
  return describeAmlCounts(e.attributes, e.interfaces, e.links, translate);
}
