import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

/**
 * Switches between the colours of VDI 3682 and a scheme for colour vision
 * deficiency (see app/fpb/core/colorScheme.js).
 *
 * The choice belongs to the viewer, not to the model: it is remembered in this
 * browser and nothing of it is exported.
 */
const ColorSchemeToggle = ({ modeler }) => {
  const service = modeler.get('colorSchemeService');
  const [scheme, setSchemeState] = useState(() => service.get());

  useEffect(() => {
    const handleChanged = (event) => setSchemeState(event.scheme);
    modeler.on('colorScheme.changed', handleChanged);
    return () => modeler.off('colorScheme.changed', handleChanged);
  }, [modeler]);

  const accessible = scheme === 'accessible';
  const tooltipText = accessible
    ? 'Back to the colours of VDI 3682'
    : 'Colours for colour vision deficiency';

  return (
    <OverlayTrigger
      trigger={['hover', 'focus']}
      placement="auto"
      flip={true}
      overlay={<Tooltip id="tooltip-colors">{tooltipText}</Tooltip>}
    >
      <Button
        id="colorSchemeButton"
        onClick={() => setSchemeState(service.set(accessible ? 'standard' : 'accessible'))}
        variant="secondary-outline"
        aria-label={tooltipText}
        aria-pressed={accessible}
      >
        <FontAwesomeIcon icon={accessible ? 'eye' : 'eye-low-vision'} size="lg" />
      </Button>
    </OverlayTrigger>
  );
};

export default ColorSchemeToggle;
