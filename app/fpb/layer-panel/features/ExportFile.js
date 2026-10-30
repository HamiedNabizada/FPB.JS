import React, { memo } from 'react';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/**
 * Opens the dialog "Export" of the modeler (016e D2, fpbFiles); also in
 * read-only mode. The toolbar stays React until phase E.
 */
const ExportFile = memo(({ modeler }) => (
    <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-export-file">
        Export
    </Tooltip>}>
        <Button
            id="exportButton"
            variant="secondary-outline"
            aria-label="Export"
            onClick={() => modeler.get('fpbFiles').export()}
        >
            <FontAwesomeIcon icon="file-export" size="lg" />
        </Button>
    </OverlayTrigger>
));

export default ExportFile;
