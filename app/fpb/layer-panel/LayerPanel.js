import React, { useState, useEffect, useCallback, memo } from 'react';
import Button from 'react-bootstrap/Button';

import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Collapse from 'react-collapse';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import TreeMenu from 'react-simple-tree-menu'

import Import from './features/Import';
import DownloadOptions from './features/DownloadOptions';
import InfoModal from './components/InfoModal';

import { is } from '../help/utils';

import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';


// Icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import './LayerPanel.css'

const LayerPanel = ({ modeler, config }) => {
    const [selectedProcess, setSelectedProcess] = useState(null);
    const [processes, setProcesses] = useState([]);
    const [isOpenedLayerPanel, setIsOpenedLayerPanel] = useState(false);
    const [isOpenedOptions, setIsOpenedOptions] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);

    useEffect(() => {
        modeler.on('layerPanel.newProcess', (e) => {
            setProcesses(prevProcesses => {
                const newProcesses = [...prevProcesses];
                collectionAdd(newProcesses, e.newProcess);
                return newProcesses;
            });
            setSelectedProcess(e.newProcess);
        });

        modeler.on('layerPanel.processDeleted', (e) => {
            setProcesses(prevProcesses => {
                const newProcesses = [...prevProcesses];
                collectionRemove(newProcesses, e.deletedProcess);
                return newProcesses;
            });
        });

        modeler.on('layerPanel.processSwitched', (e) => {
            setSelectedProcess(e.selectedProcess);
        });

        return () => {
            modeler.off('layerPanel.newProcess');
            modeler.off('layerPanel.processDeleted');
            modeler.off('layerPanel.processSwitched');
        };
    }, [modeler]);


    const [selectedElements, setSelectedElements] = useState([]);

    useEffect(() => {
        const handleSelectionChanged = (e) => {
            setSelectedElements(e.newSelection);
        };

        modeler.on('selection.changed', handleSelectionChanged);

        return () => {
            modeler.off('selection.changed', handleSelectionChanged);
        };
    }, [modeler]);

    const switchProcess = useCallback((process) => {
        const modeling = modeler.get('modeling');
        if (selectedProcess && process.id === selectedProcess.id) {
            return;
        }
        modeling.switchProcess(process);
    }, [modeler, selectedProcess]);

    const getNodeLogic = useCallback(() => {
        if (!selectedProcess) return { openNodes: [], activeKey: null };

        let tmp = selectedProcess;
        let structure = [];
        while (!(is(tmp, 'fpb:Project'))) {
            structure.unshift(tmp.id);
            tmp = tmp.businessObject.parent;
        }
        let openNodes = [];
        let entry = structure[0];
        openNodes.push(entry);
        for (let i = 1; i < structure.length; i++) {
            entry += '/' + structure[i];
            openNodes.push(entry);
        }
        return {
            openNodes: openNodes,
            activeKey: openNodes[openNodes.length - 1]
        };
    }, [selectedProcess]);

    const createTreeStructure = useCallback((parent) => {
        let nodes = [];
        processes.forEach((process) => {
            if (process.businessObject.parent === parent) {
                let name;
                if (process.businessObject.isDecomposedProcessOperator != null) {
                    if (process.businessObject.isDecomposedProcessOperator.name) {
                        name = process.businessObject.isDecomposedProcessOperator.name;
                        if (name.length > 10) {
                            name = name.substring(0, 10) + "...";
                        }
                    } else {
                        name = 'unnamed';
                    }
                }
                nodes.push({
                    key: process.id,
                    label: name,
                    process: process,
                    nodes: createTreeStructure(process)
                });
            }
        });
        return nodes;
    }, [processes]);

    const renderLayerOverview = useCallback(() => {
        if (processes.length > 0) {
            const treeData = [];
            let superProcess;
            processes.forEach((process) => {
                if (is(process.businessObject.parent, 'fpb:Project')) {
                    superProcess = {
                        key: process.id,
                        label: process.businessObject.parent.name,
                        process: process,
                        nodes: createTreeStructure(process)
                    };
                    collectionAdd(treeData, superProcess);
                }
            });
            const nodeLogic = getNodeLogic();
            return (
                <TreeMenu 
                    data={treeData}
                    debounceTime={125}
                    hasSearch
                    initialOpenNodes={nodeLogic.openNodes}
                    activeKey={nodeLogic.activeKey}
                    onClickItem={(e) => {
                        switchProcess(e.process);
                    }}
                    resetOpenNodesOnDataUpdate={false}>
                </TreeMenu>
            );
        }
        return <div></div>;
    }, [processes, createTreeStructure, getNodeLogic, switchProcess]);

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
                            {renderLayerOverview()}
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