import React, { memo, useEffect, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/**
 * Offers the browser backup found at start. Nothing is loaded without the
 * user's choice, and nothing overwrites the backup until then.
 */
const AutosaveNotice = memo(({ modeler }) => {
    const autosave = modeler.get('autosave', false);
    const [pending, setPending] = useState(() => (autosave ? autosave.getPending() : null));

    useEffect(() => {
        if (!autosave) {
            return undefined;
        }
        const handleChanged = (e) => setPending(e.pending);
        modeler.on('autosave.changed', handleChanged);
        setPending(autosave.getPending());
        return () => modeler.off('autosave.changed', handleChanged);
    }, [modeler, autosave]);

    if (!pending) {
        return null;
    }

    const savedAt = pending.savedAt ? new Date(pending.savedAt).toLocaleString() : null;

    return (
        <Alert
            variant="info"
            className="position-fixed autosave-notice"
            // Top center: the panel toggles and buttons sit on the right
            style={{ top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 9998, minWidth: '320px', maxWidth: '480px' }}
        >
            <Alert.Heading as="h2" className="h6">
                <FontAwesomeIcon icon="clock-rotate-left" className="me-2" />
                Unsaved model found
            </Alert.Heading>
            <p className="mb-2">
                This browser still holds a model{savedAt ? ` from ${savedAt}` : ''} that was not downloaded.
            </p>
            <div className="d-flex justify-content-end gap-2">
                <Button variant="outline-secondary" size="sm" onClick={() => autosave.discard()}>
                    Discard
                </Button>
                <Button variant="primary" size="sm" onClick={() => autosave.restore()} autoFocus>
                    Restore
                </Button>
            </div>
        </Alert>
    );
});

export default AutosaveNotice;
