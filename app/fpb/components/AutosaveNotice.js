import React, { memo, useEffect, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Top center: the panel toggles and buttons sit on the right
const POSITION = { top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 9998, minWidth: '340px', maxWidth: '560px' };

/**
 * Offers the browser backups of tabs that are gone (closed, reloaded,
 * crashed). Nothing is loaded without the user's choice. A backup is
 * restored into this tab unless this tab has unsaved work of its own; then
 * it opens in a new tab, so neither model is lost.
 *
 * Also says when the browser refuses to keep a backup.
 */
const AutosaveNotice = memo(({ modeler }) => {
    const autosave = modeler.get('autosave', false);
    const [pending, setPending] = useState(() => (autosave ? autosave.getPending() : []));
    const [dirty, setDirty] = useState(() => (autosave ? autosave.isDirty() : false));
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!autosave) {
            return undefined;
        }
        const handleChanged = (e) => {
            setPending(e.pending || []);
            setDirty(e.dirty);
        };
        const handleFailed = () => setFailed(true);
        modeler.on('autosave.changed', handleChanged);
        modeler.on('autosave.failed', handleFailed);
        setPending(autosave.getPending());
        return () => {
            modeler.off('autosave.changed', handleChanged);
            modeler.off('autosave.failed', handleFailed);
        };
    }, [modeler, autosave]);

    if (failed) {
        return (
            <Alert
                variant="warning"
                dismissible
                onClose={() => setFailed(false)}
                className="position-fixed autosave-failed"
                style={POSITION}
            >
                <FontAwesomeIcon icon="exclamation-triangle" className="me-2" />
                This browser could not keep a backup of your model. Download it to keep your changes safe.
            </Alert>
        );
    }

    if (!pending || pending.length === 0) {
        return null;
    }

    const heading = pending.length === 1 ? 'Unsaved model found' : `${pending.length} unsaved models found`;

    return (
        <Alert variant="info" className="position-fixed autosave-notice" style={POSITION}>
            <Alert.Heading as="h2" className="h6">
                <FontAwesomeIcon icon="clock-rotate-left" className="me-2" />
                {heading}
            </Alert.Heading>
            <p className="mb-2">
                {pending.length === 1
                    ? 'This browser still holds a model that was not downloaded.'
                    : 'This browser still holds models that were not downloaded.'}
            </p>
            <ul className="list-unstyled mb-0">
                {pending.map((backup) => {
                    const savedAt = backup.savedAt ? new Date(backup.savedAt).toLocaleString() : '';
                    return (
                        <li key={backup.id} className="d-flex align-items-center gap-2 mb-1 autosave-entry">
                            <span className="me-auto">
                                <b>{backup.title}</b>
                                {savedAt && <span className="text-muted small">{' '}{savedAt}</span>}
                            </span>
                            <Button
                                variant="outline-secondary"
                                size="sm"
                                aria-label={`Discard ${backup.title}`}
                                onClick={() => autosave.discard(backup.id)}
                            >
                                Discard
                            </Button>
                            {dirty ? (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    aria-label={`Open ${backup.title} in a new tab`}
                                    onClick={() => autosave.openInNewTab(backup.id)}
                                >
                                    Open in new tab
                                </Button>
                            ) : (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    aria-label={`Restore ${backup.title}`}
                                    onClick={() => autosave.restore(backup.id)}
                                >
                                    Restore
                                </Button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </Alert>
    );
});

export default AutosaveNotice;
