import React, { memo } from 'react';
import ImportModal from '../components/ImportModal';

const Import = memo(({ modeler }) => {
    return (
        <div className="importButton">
            <ImportModal modeler={modeler} />
        </div>
    );
});

export default Import;