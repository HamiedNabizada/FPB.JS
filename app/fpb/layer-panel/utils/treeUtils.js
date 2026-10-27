import { is } from '../../help/utils';
import { layerName } from '../../layers/tree';

/**
 * Display name of a process, cut after `maxLength` characters; the same
 * name the layers tree and the breadcrumbs show (layers/tree.js).
 */
export const getProcessDisplayName = (process, maxLength = 25) => layerName(process, maxLength);

/**
 * Creates tree data structure for React Arborist
 * @param {Array} processes - Array of all processes
 * @returns {Array} Array of tree data for Arborist component
 */
export const createArboristTreeData = (processes) => {
    // Create a map of processes by ID for faster lookup
    const processMap = new Map();
    processes.forEach(process => {
        processMap.set(process.id, process);
    });

    const buildChildrenForProcess = (parentProcess, allProcesses) => {
        const children = [];

        if (parentProcess.businessObject.consistsOfProcesses) {
            parentProcess.businessObject.consistsOfProcesses.forEach(childProcess => {
                const child = {
                    id: childProcess.id,
                    name: getProcessDisplayName(childProcess),
                    process: childProcess,
                    children: buildChildrenForProcess(childProcess, allProcesses)
                };
                children.push(child);
            });
        }
        return children;
    };

    const rootNodes = [];
    processes.forEach((process) => {
        // Check if this is a root process (parent is Project)
        if (is(process.businessObject.parent, 'fpb:Project')) {
            const rootNode = {
                id: process.id,
                name: getProcessDisplayName(process),
                process: process,
                children: buildChildrenForProcess(process, processes)
            };
            rootNodes.push(rootNode);
        }
    });

    return rootNodes;
};

/**
 * Gets the path of process IDs that need to be opened to show the selected process
 * @param {Object} selectedProcess - The currently selected process
 * @param {Array} processes - Array of all processes
 * @returns {Array} Array of process IDs that should be open
 */
export const getPathToProcess = (selectedProcess, processes) => {
    if (!selectedProcess) return [];
    
    const path = [];
    let current = selectedProcess;
    
    // Gehe den Baum nach oben bis zum Root
    while (current && !is(current.businessObject.parent, 'fpb:Project')) {
        // Finde den Parent-Prozess
        const parent = processes.find(p => p === current.businessObject.parent);
        if (parent) {
            path.unshift(parent.id); // Am Anfang hinzufügen (Root zuerst)
            current = parent;
        } else {
            break;
        }
    }
    
    // Root-Prozess auch hinzufügen
    if (current && is(current.businessObject.parent, 'fpb:Project')) {
        path.unshift(current.id);
    }
    
    return path;
};