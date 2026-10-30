import React, { useEffect, useState } from 'react';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/**
 * The button "AML file" in the React toolbar (feature 028). The overview
 * itself is a dialog of the modeler (amlOverview, AmlOverviewDialog.js,
 * 016e D1); the toolbar becomes Preact in phase E.
 *
 * Shown only when the AML module is there and a file is kept.
 */
export default function AmlOverview({ modeler }) {
  const amlSupport = modeler.get('amlSupport', false);
  const [source, setSource] = useState(() => (amlSupport ? amlSupport.getSource() : null));

  useEffect(() => {
    if (!amlSupport) {
      return undefined;
    }
    const eventBus = modeler.get('eventBus');
    const update = () => setSource(amlSupport.getSource());
    eventBus.on('aml.sourceChanged', update);
    return () => eventBus.off('aml.sourceChanged', update);
  }, [modeler, amlSupport]);

  if (!amlSupport || !source) {
    return null;
  }

  const label = 'AML file';
  return (
    <div className="aml-overview">
      <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-aml-overview">{label}</Tooltip>}>
        <Button id="amlOverviewButton" variant="secondary-outline" aria-label={label} onClick={() => modeler.get('amlOverview').open()}>
          <FontAwesomeIcon icon="file-code" size="lg" />
        </Button>
      </OverlayTrigger>
    </div>
  );
}
