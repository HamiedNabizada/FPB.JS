import React, { useEffect, useRef } from 'react';
import { mountLayersTree, unmountLayersTree } from '../../layers/LayersTree';

/**
 * Holds the layers tree (Preact, 016d T4) in the React card of the toolbar
 * until the toolbar itself leaves React (phases D and E).
 */
const LayersTreeHost = ({ modeler }) => {
    const containerRef = useRef(null);
    useEffect(() => {
        const container = containerRef.current;
        mountLayersTree(container, modeler);
        return () => unmountLayersTree(container);
    }, [modeler]);
    return <div ref={containerRef} />;
};

export default LayersTreeHost;
