import React, { Component } from 'react';
import Button from 'react-bootstrap/Button';

import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Collapse from 'react-collapse';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import TreeMenu from 'react-simple-tree-menu'

import Import from './features/Import';

import DownloadOptions from './features/DownloadOptions'

import { is } from '../help/utils';

import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

// Icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faFolderOpen, faEllipsisV } from '@fortawesome/free-solid-svg-icons';

import './LayerPanel.css'



export default class LayerPanel extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedProcess: null,
            processes: [],
            isOpenedLayerPanel: false,
            isOpenedOptions: false
        };
    };
    componentDidMount() {
        const {
            modeler,
            config
        } = this.props;
        modeler.on('layerPanel.newProcess', (e) => {
            const {
                selectedProcess,
                processes
            } = this.state;
            collectionAdd(processes, e.newProcess);
            this.setState({
                selectedProcess: e.newProcess,
                processes: processes
            })
        });

        modeler.on('layerPanel.processDeleted', (e) => {
            const {
                processes
            } = this.state;
            collectionRemove(processes, e.deletedProcess);
            this.setState({
                processes: processes
            })
        });

        modeler.on('layerPanel.processSwitched', (e) => {
            this.setState({
                selectedProcess: e.selectedProcess
            })
        });

    };


    render() {
        const {
            modeler,
            config
        } = this.props;

        const {
            selectedProcess,
            processes,
            isOpenedLayerPanel,
            isOpenedOptions
        } = this.state;


        var selectedElements;
        modeler.on('selection.changed', (e) => {
            selectedElements = e.newSelection;
        });

        var nodeLogic = {
            openNodes: [],
            activeKey: null,
        }

        function switchProcess(process) {
            const modeling = modeler.get('modeling');
            if (process.id === selectedProcess.id) {
                return;
            }
            modeling.switchProcess(process);
        }

        function getNodeLogic() {
            let tmp = selectedProcess;
            let structure = [];
            while (!(is(tmp, 'fpb:Project'))) {
                structure.unshift(tmp.id)
                tmp = tmp.businessObject.parent;

            }
            let openNodes = []
            let entry = structure[0];
            openNodes.push(entry)
            for (let i = 1; i < structure.length; i++) {
                entry += '/' + structure[i]
                openNodes.push(entry)
            }
            nodeLogic.openNodes = openNodes;
            nodeLogic.activeKey = openNodes[openNodes.length - 1];

        }

        function createTreeStructure(parent) {
            let nodes = [];
            processes.forEach((process) => {
                if (process.businessObject.parent == parent) {
                    let name;
                    if (process.businessObject.isDecomposedProcessOperator != null) {
                        if (process.businessObject.isDecomposedProcessOperator.name) {
                            name = process.businessObject.isDecomposedProcessOperator.name;
                            if (name.length > 10) {
                                name = name.substring(0, 10) + "...";
                            }

                        } else {
                            name = 'unnamed'
                        }
                    }
                    nodes.push({
                        key: process.id,
                        label: name,
                        process: process,
                        nodes: createTreeStructure(process)
                    })
                }
            })
            return nodes;
        }


        function renderLayerOverview() {
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
                        }
                        collectionAdd(treeData, superProcess);
                    }
                })
                getNodeLogic();
                return (<TreeMenu data={treeData}
                    debounceTime={125}
                    hasSearch
                    initialOpenNodes={nodeLogic.openNodes}
                    activeKey={nodeLogic.activeKey}
                    onClickItem={(e) => {
                        switchProcess(e.process)
                    }}
                    resetOpenNodesOnDataUpdate={false}>
                </TreeMenu>)
            }
            return (<div></div>)
        };
        let tooltipsOptions = 'Show Options';
        if(isOpenedOptions){
            tooltipsOptions = 'Hide Options';
        }
        let isOpenedLayerButton = <FontAwesomeIcon icon={faFolder} size="lg" />
        let tooltipsTextLayer = 'Open Process Overview';
        if (isOpenedLayerPanel) {
            isOpenedLayerButton = <FontAwesomeIcon icon={faFolderOpen} size="lg" />
            tooltipsTextLayer = 'Close Process Overview';
        };


        return (
            <div className="layerPanel">
                <OverlayTrigger placement="auto" overlay={<Tooltip id={`tooltip-uniqueId1`}>
                    {tooltipsOptions}
                </Tooltip>}>
                    <Button onClick={() => this.setState({ isOpenedOptions: !isOpenedOptions })} variant="secondary-outline"><FontAwesomeIcon icon={faEllipsisV} size="lg" /></Button>
                </OverlayTrigger>
                <Collapse isOpened={isOpenedOptions}>
                        <Import modeler={modeler} />
                        <DownloadOptions modeler={modeler} processes={processes} selectedProcess={selectedProcess} selectedElements={selectedElements} />       
                </Collapse>
                {processes.length > 1 && <div>
                    <div className="layerPanel-ProcessOverview-Config">
                        <OverlayTrigger placement="auto" overlay={<Tooltip id={`tooltip-uniqueId`}>
                            {tooltipsTextLayer}
                        </Tooltip>}>
                            <Button id="openLayerButton" variant="secondary-outline" onClick={() => this.setState({ isOpenedLayerPanel: !isOpenedLayerPanel })}>{isOpenedLayerButton}</Button>
                        </OverlayTrigger>
                    </div>
                    <Collapse isOpened={isOpenedLayerPanel}>
                        <div className="layerPanel-ProcessOverview-Content" >
                            {renderLayerOverview()}
                        </div>
                    </Collapse>
                </div>
                }
            </div>
        );
    }
};