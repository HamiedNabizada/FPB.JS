import React, { memo } from 'react';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import useReadOnly from '../../read-only/useReadOnly';

/**
 * Starts over with an empty model. With the browser backup on, this is also
 * how the backup is cleared.
 *
 * Asks first when something would be lost: with the backup on, only if the
 * model has changes that are in no file; without it, whenever there is a model.
 * The question is a dialog of the modeler (016e).
 */
const NewModel = memo(({ modeler }) => {
    // read-only: the model the user only looks at stays
    const readOnly = useReadOnly(modeler);
    const label = readOnly ? 'New model (not in read-only mode)' : 'New model';

    const wouldLoseWork = () => {
        const autosave = modeler.get('autosave', false);
        if (autosave && autosave.isEnabled()) {
            autosave.flush();
            return autosave.isDirty();
        }
        return modeler.getProcesses().length > 0;
    };

    const start = () => modeler.newModel();

    const ask = () => modeler.get('fpbDialogs').confirm({
        title: 'Start a new model?',
        message: 'The current model will be removed from the editor.',
        details: 'Changes that you have not downloaded are lost.',
        confirmLabel: 'Start new model',
        danger: true
    }).then((confirmed) => {
        if (confirmed && !modeler.get('readOnly').isEnabled()) {
            start();
        }
    });

    return (
        <div className="new-model">
            <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-new-model">
                {label}
            </Tooltip>}>
                <Button
                    id="newModelButton"
                    variant="secondary-outline"
                    aria-label={label}
                    disabled={readOnly}
                    onClick={() => (wouldLoseWork() ? ask() : start())}
                >
                    <FontAwesomeIcon icon="file-circle-plus" size="lg" />
                </Button>
            </OverlayTrigger>
        </div>
    );
});

export default NewModel;
