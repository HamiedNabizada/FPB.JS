import React, { memo } from 'react';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import useReadOnly from '../../read-only/useReadOnly';
import { getCtrlKey } from '../../info/keyboardShortcuts';

/**
 * Opens the dialog "Open" of the modeler (016e D2, fpbFiles); the toolbar
 * stays React until phase E. Not in read-only mode.
 */
const OpenFile = memo(({ modeler }) => {
    const readOnly = useReadOnly(modeler);
    const label = readOnly ? 'Open (not in read-only mode)' : `Open (${getCtrlKey()}+O)`;

    return (
        <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-open-file">
            {label}
        </Tooltip>}>
            <Button
                id="openFileButton"
                variant="secondary-outline"
                aria-label={label}
                disabled={readOnly}
                onClick={() => modeler.get('fpbFiles').open()}
            >
                <FontAwesomeIcon icon="file-import" size="lg" />
            </Button>
        </OverlayTrigger>
    );
});

export default OpenFile;
