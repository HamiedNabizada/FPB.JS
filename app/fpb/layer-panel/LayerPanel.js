import React, { useState, memo } from 'react';
import Button from 'react-bootstrap/Button';

import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Collapse from 'react-collapse';

import Import from './features/Import';
import DownloadOptions from './features/DownloadOptions';
import InfoModal from './components/InfoModal';
import ProcessTreeView from './components/ProcessTreeView';
import { useProcessManagement } from './hooks/useProcessManagement';
import { useSelectedElements } from './hooks/useSelectedElements';


// Icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import './LayerPanel.css'

const LayerPanel = ({ modeler, config }) => {
    const [isOpenedLayerPanel, setIsOpenedLayerPanel] = useState(false);
    const [isOpenedOptions, setIsOpenedOptions] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);

    const { selectedProcess, processes, switchProcess } = useProcessManagement(modeler);
    const selectedElements = useSelectedElements(modeler);


    const tooltipsOptions = isOpenedOptions ? 'Hide Options' : 'Show Options';
    const isOpenedLayerButton = isOpenedLayerPanel ? 
        <FontAwesomeIcon icon="folder-open" size="lg" /> : 
        <FontAwesomeIcon icon="folder" size="lg" />;
    const tooltipsTextLayer = isOpenedLayerPanel ? 'Close Process Overview' : 'Open Process Overview';

    return (
        <div className="layerPanel">
            <OverlayTrigger placement="auto" flip={true} overlay={<Tooltip id={`tooltip-uniqueId1`}>
                {tooltipsOptions}
            </Tooltip>}>
                <Button 
                    onClick={() => setIsOpenedOptions(!isOpenedOptions)} 
                    variant="secondary-outline"
                >
                    <FontAwesomeIcon icon="ellipsis-vertical" size="lg" />
                </Button>
            </OverlayTrigger>
            <Collapse isOpened={isOpenedOptions}>
                <Import modeler={modeler} />
                <DownloadOptions 
                    modeler={modeler} 
                    processes={processes} 
                    selectedProcess={selectedProcess} 
                    selectedElements={selectedElements} 
                />
            </Collapse>
            {processes.length > 1 && (
                <div>
                    <div className="layerPanel-ProcessOverview-Config">
                        <OverlayTrigger placement="auto" flip={true} overlay={<Tooltip id={`tooltip-uniqueId`}>
                            {tooltipsTextLayer}
                        </Tooltip>}>
                            <Button 
                                id="openLayerButton" 
                                variant="secondary-outline" 
                                onClick={() => setIsOpenedLayerPanel(!isOpenedLayerPanel)}
                            >
                                {isOpenedLayerButton}
                            </Button>
                        </OverlayTrigger>
                    </div>
                    <Collapse isOpened={isOpenedLayerPanel}>
                        <div className="layerPanel-ProcessOverview-Content">
                            <ProcessTreeView 
                                processes={processes}
                                selectedProcess={selectedProcess}
                                onProcessSwitch={switchProcess}
                            />
                        </div>
                    </Collapse>
                </div>
            )}
            
            <div className="mt-3">
                <OverlayTrigger placement="auto" flip={true} overlay={<Tooltip id="tooltip-info">
                    Show information and help
                </Tooltip>}>
                    <Button 
                        onClick={() => setShowInfoModal(true)} 
                        variant="secondary-outline"
                    >
                        <FontAwesomeIcon icon="info-circle" size="lg" />
                    </Button>
                </OverlayTrigger>
            </div>
            
            <InfoModal 
                show={showInfoModal} 
                onHide={() => setShowInfoModal(false)} 
            />
        </div>
    );
};

export default memo(LayerPanel);