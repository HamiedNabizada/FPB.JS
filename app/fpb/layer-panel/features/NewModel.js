import React, { memo, useState } from 'react';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import ConfirmationModal from '../components/ConfirmationModal';

/**
 * Starts over with an empty model. With the browser backup on, this is also
 * how the backup is cleared.
 *
 * Asks first when something would be lost: with the backup on, only if the
 * model has changes that are in no file; without it, whenever there is a model.
 */
const NewModel = memo(({ modeler }) => {
    const [asking, setAsking] = useState(false);
    const label = 'New model';

    const wouldLoseWork = () => {
        const autosave = modeler.get('autosave', false);
        if (autosave && autosave.isEnabled()) {
            autosave.flush();
            return autosave.isDirty();
        }
        return modeler.getProcesses().length > 0;
    };

    const start = () => {
        setAsking(false);
        modeler.newModel();
    };

    return (
        <div className="new-model">
            <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-new-model">
                {label}
            </Tooltip>}>
                <Button
                    id="newModelButton"
                    variant="secondary-outline"
                    aria-label={label}
                    onClick={() => (wouldLoseWork() ? setAsking(true) : start())}
                >
                    <FontAwesomeIcon icon="file-circle-plus" size="lg" />
                </Button>
            </OverlayTrigger>
            <ConfirmationModal
                show={asking}
                onConfirm={start}
                onCancel={() => setAsking(false)}
                title="Start a new model?"
                message="The current model will be removed from the editor."
                details="Changes that you have not downloaded are lost."
            />
        </div>
    );
});

export default NewModel;
