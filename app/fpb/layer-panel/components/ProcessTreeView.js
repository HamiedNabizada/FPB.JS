import React, { memo } from 'react';
import TreeMenu from 'react-simple-tree-menu';
import { createTreeData, getNodeLogic } from '../utils/treeUtils';

const ProcessTreeView = memo(({ processes, selectedProcess, onProcessSwitch }) => {
    if (processes.length === 0) {
        return <div></div>;
    }

    const treeData = createTreeData(processes);
    const nodeLogic = getNodeLogic(selectedProcess);

    return (
        <TreeMenu 
            data={treeData}
            debounceTime={125}
            hasSearch
            initialOpenNodes={nodeLogic.openNodes}
            activeKey={nodeLogic.activeKey}
            onClickItem={(e) => {
                onProcessSwitch(e.process);
            }}
            resetOpenNodesOnDataUpdate={false}>
        </TreeMenu>
    );
});

export default ProcessTreeView;