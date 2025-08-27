import { is } from '../../help/utils';

/**
 * Calculates the node logic for tree expansion based on the selected process
 * @param {Object} selectedProcess - The currently selected process
 * @returns {Object} Object containing openNodes array and activeKey
 */
export const getNodeLogic = (selectedProcess) => {
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
};

/**
 * Creates a tree structure for processes with the given parent
 * @param {Object} parent - The parent process
 * @param {Array} processes - Array of all processes
 * @returns {Array} Array of tree nodes
 */
export const createTreeStructure = (parent, processes) => {
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
                nodes: createTreeStructure(process, processes)
            });
        }
    });
    return nodes;
};

/**
 * Creates the tree data structure for the process overview
 * @param {Array} processes - Array of all processes
 * @returns {Array} Array of tree data for TreeMenu component
 */
export const createTreeData = (processes) => {
    const treeData = [];
    processes.forEach((process) => {
        if (is(process.businessObject.parent, 'fpb:Project')) {
            const superProcess = {
                key: process.id,
                label: process.businessObject.parent.name,
                process: process,
                nodes: createTreeStructure(process, processes)
            };
            treeData.push(superProcess);
        }
    });
    return treeData;
};