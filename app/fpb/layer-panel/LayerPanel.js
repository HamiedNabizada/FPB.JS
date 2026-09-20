import React, { useState, useEffect, memo } from 'react';
import Button from 'react-bootstrap/Button';

import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Collapse from 'react-collapse';

import Import from './features/Import';
import DownloadOptions from './features/DownloadOptions';
import InfoModal from './components/InfoModal';
import ConfirmationModal from './components/ConfirmationModal';
import ProcessTreeView from './components/ProcessTreeView';
import { describeCounts } from '../validation/FpbValidation';
import ThemeToggle from './components/ThemeToggle';
import { useProcessManagement } from './hooks/useProcessManagement';
import { useSelectedElements } from './hooks/useSelectedElements';
import { useConfirmation } from './hooks/useConfirmation';


// Icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import './LayerPanel.css'

const LayerPanel = ({ modeler, config }) => {
    const [isOpenedLayerPanel, setIsOpenedLayerPanel] = useState(false);
    const [isOpenedOptions, setIsOpenedOptions] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);

    const { selectedProcess, processes, namesRevision, switchProcess } = useProcessManagement(modeler);
    const selectedElements = useSelectedElements(modeler);
    const { showConfirmation, confirmationData, handleConfirm, handleCancel } = useConfirmation(modeler);

    // Findings of the model check for the counter on its button
    const [checkCounts, setCheckCounts] = useState({ error: 0, warning: 0, info: 0 });
    useEffect(() => {
        const handleChecked = (e) => setCheckCounts(e.counts);
        modeler.on('fpbValidation.changed', handleChecked);
        return () => modeler.off('fpbValidation.changed', handleChecked);
    }, [modeler]);
    const shownFindings = checkCounts.error + checkCounts.warning;


    const tooltipsOptions = isOpenedOptions ? 'Hide Options' : 'Show Options';
    const isOpenedLayerButton = isOpenedLayerPanel ? 
        <FontAwesomeIcon icon="folder-open" size="lg" /> : 
        <FontAwesomeIcon icon="folder" size="lg" />;
    const tooltipsTextLayer = isOpenedLayerPanel ? 'Close Process Overview' : 'Open Process Overview';

    return (
        <div className="layerPanel">
            <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id={`tooltip-uniqueId1`}>
                {tooltipsOptions}
            </Tooltip>}>
                <Button 
                    onClick={() => setIsOpenedOptions(!isOpenedOptions)} 
                    variant="secondary-outline"
                    aria-label={tooltipsOptions}
                    aria-expanded={isOpenedOptions}
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
                <ThemeToggle />
            </Collapse>
            {processes.length > 1 && (
                <div>
                    <div className="layerPanel-ProcessOverview-Config">
                        <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id={`tooltip-uniqueId`}>
                            {tooltipsTextLayer}
                        </Tooltip>}>
                            <Button 
                                id="openLayerButton" 
                                variant="secondary-outline" 
                                onClick={() => setIsOpenedLayerPanel(!isOpenedLayerPanel)}
                                aria-label={tooltipsTextLayer}
                                aria-expanded={isOpenedLayerPanel}
                            >
                                {isOpenedLayerButton}
                            </Button>
                        </OverlayTrigger>
                    </div>
                    <Collapse isOpened={isOpenedLayerPanel}>
                        <div className="layerPanel-ProcessOverview-Content">
                            <ProcessTreeView 
                                processes={processes}
                                namesRevision={namesRevision}
                                selectedProcess={selectedProcess}
                                onProcessSwitch={switchProcess}
                            />
                        </div>
                    </Collapse>
                </div>
            )}
            
            <div className="mt-3">
                <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-check">
                    {`Model check (VDI 3682): ${describeCounts(checkCounts)}`}
                </Tooltip>}>
                    <Button
                        id="openValidationButton"
                        onClick={() => modeler.get('fpbValidation').togglePanel()}
                        aria-label={`Model check (VDI 3682): ${describeCounts(checkCounts)}`}
                        variant="secondary-outline"
                        style={{ position: 'relative' }}
                    >
                        <FontAwesomeIcon icon="list-check" size="lg" />
                        {shownFindings > 0 && (
                            <span className={checkCounts.error ? 'fpb-validation-count has-errors' : 'fpb-validation-count'}>
                                {shownFindings}
                            </span>
                        )}
                    </Button>
                </OverlayTrigger>
            </div>

            <div className="mt-3">
                <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-search">
                    Search all layers (Ctrl+F)
                </Tooltip>}>
                    <Button
                        id="openSearchButton"
                        onClick={() => modeler.get('fpbSearch').open()}
                        aria-label="Search all layers"
                        variant="secondary-outline"
                    >
                        <FontAwesomeIcon icon="magnifying-glass" size="lg" />
                    </Button>
                </OverlayTrigger>
            </div>

            <div className="mt-3">
                <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id="tooltip-info">
                    Show information and help
                </Tooltip>}>
                    <Button 
                        onClick={() => setShowInfoModal(true)} 
                        variant="secondary-outline"
                        aria-label="Show information and help"
                    >
                        <FontAwesomeIcon icon="info-circle" size="lg" />
                    </Button>
                </OverlayTrigger>
            </div>
            
            <InfoModal
                show={showInfoModal}
                onHide={() => setShowInfoModal(false)}
            />

            <ConfirmationModal
                show={showConfirmation}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                title={confirmationData?.title}
                message={confirmationData?.message}
                details={confirmationData?.details}
                isBlocked={confirmationData?.isBlocked}
            />
        </div>
    );
};

export default memo(LayerPanel);