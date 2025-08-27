import { useState, useEffect } from 'react';

/**
 * Custom hook for managing selected elements state
 * @param {Object} modeler - The modeler instance
 * @returns {Array} Array of selected elements
 */
export const useSelectedElements = (modeler) => {
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

    return selectedElements;
};