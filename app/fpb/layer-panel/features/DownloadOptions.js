import React, { memo } from 'react';
import DownloadModal from '../components/DownloadModal';

const DownloadOptions = memo(({ modeler, processes, selectedProcess, selectedElements }) => {
    return (
        <div className="downloadButton">
            <DownloadModal 
                modeler={modeler}
                processes={processes}
                selectedProcess={selectedProcess}
                selectedElements={selectedElements}
            />
        </div>
    );
});

export default DownloadOptions;