import { useState, useEffect, useCallback } from 'react';
import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

/**
 * Custom hook for managing process state and events
 * @param {Object} modeler - The modeler instance
 * @returns {Object} Process management state and functions
 */
export const useProcessManagement = (modeler) => {
    const [selectedProcess, setSelectedProcess] = useState(null);
    const [processes, setProcesses] = useState([]);

    useEffect(() => {
        const handleNewProcess = (e) => {
            setProcesses(prevProcesses => {
                const newProcesses = [...prevProcesses];
                collectionAdd(newProcesses, e.newProcess);
                return newProcesses;
            });
            setSelectedProcess(e.newProcess);
        };

        const handleProcessDeleted = (e) => {
            setProcesses(prevProcesses => {
                const newProcesses = [...prevProcesses];
                collectionRemove(newProcesses, e.deletedProcess);
                return newProcesses;
            });
        };

        const handleProcessSwitched = (e) => {
            setSelectedProcess(e.selectedProcess);
        };

        modeler.on('layerPanel.newProcess', handleNewProcess);
        modeler.on('layerPanel.processDeleted', handleProcessDeleted);
        modeler.on('layerPanel.processSwitched', handleProcessSwitched);

        return () => {
            modeler.off('layerPanel.newProcess', handleNewProcess);
            modeler.off('layerPanel.processDeleted', handleProcessDeleted);
            modeler.off('layerPanel.processSwitched', handleProcessSwitched);
        };
    }, [modeler]);

    const switchProcess = useCallback((process) => {
        const modeling = modeler.get('modeling');
        if (selectedProcess && process.id === selectedProcess.id) {
            return;
        }
        modeling.switchProcess(process);
    }, [modeler, selectedProcess]);

    return {
        selectedProcess,
        processes,
        switchProcess
    };
};