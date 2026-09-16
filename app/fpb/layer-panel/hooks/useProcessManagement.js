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
            // Dedup by id — multiple sources fire this event (DecomposeProcessOperator,
            // ComposeProcess, ShapeUpdater, importer). Re-loading the same AML or running
            // Update/Refresh would otherwise stack duplicate entries in the layer panel.
            const id = e.newProcess?.id ?? e.newProcess?.businessObject?.id;
            let isDuplicate = false;
            setProcesses(prevProcesses => {
                if (id && prevProcesses.some(p =>
                    (p?.id ?? p?.businessObject?.id) === id)) {
                    isDuplicate = true;
                    return prevProcesses;
                }
                const newProcesses = [...prevProcesses];
                collectionAdd(newProcesses, e.newProcess);
                return newProcesses;
            });
            // Only a genuinely NEW process moves the selection. A deduplicated
            // re-fire (import echo, refresh) must not yank the user back to
            // whatever layer the duplicate event happened to describe.
            if (!isDuplicate) {
                setSelectedProcess(e.newProcess);
            }
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

        // A new import replaces the model, so the panel must forget the old
        // layers instead of listing them next to the new ones.
        const handleReset = () => {
            setProcesses([]);
            setSelectedProcess(null);
        };

        modeler.on('layerPanel.reset', handleReset);
        modeler.on('layerPanel.newProcess', handleNewProcess);
        modeler.on('layerPanel.processDeleted', handleProcessDeleted);
        modeler.on('layerPanel.processSwitched', handleProcessSwitched);

        return () => {
            modeler.off('layerPanel.reset', handleReset);
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