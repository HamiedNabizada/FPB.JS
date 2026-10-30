import React, { memo } from 'react';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { getCtrlKey } from '../../info/keyboardShortcuts';

/**
 * Saves the model (016e D2, fpbFiles.save): in Chrome and Edge into its
 * file, else as a download; also in read-only mode. The toolbar stays React
 * until phase E.
 */
const SaveFile = memo(({ modeler }) => {
    const label = `Save (${getCtrlKey()}+S)`;

    return (
        <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-save-file">
            {label}
        </Tooltip>}>
            <Button
                id="saveFileButton"
                variant="secondary-outline"
                aria-label={label}
                onClick={() => modeler.get('fpbFiles').save()}
            >
                <FontAwesomeIcon icon="floppy-disk" size="lg" />
            </Button>
        </OverlayTrigger>
    );
});

export default SaveFile;
