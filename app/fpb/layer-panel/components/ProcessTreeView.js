import React, { memo, useMemo, useState } from 'react';
import { Tree } from 'react-arborist';
import Form from 'react-bootstrap/Form';
import { createArboristTreeData, getPathToProcess } from '../utils/treeUtils';

const ProcessTreeView = memo(({ processes, selectedProcess, onProcessSwitch }) => {
    if (processes.length === 0) {
        return <div></div>;
    }

    const [searchTerm, setSearchTerm] = useState('');
    
    const treeData = useMemo(() => createArboristTreeData(processes), [processes]);
    
    const initiallyOpenIds = useMemo(() => {
        if (!selectedProcess) return [];
        return getPathToProcess(selectedProcess, processes);
    }, [selectedProcess, processes]);
    
    const Node = ({ node, style, dragHandle }) => {
        const isSelected = selectedProcess && node.data.process?.id === selectedProcess.id;
        const hasChildren = node.children && node.children.length > 0;
        
        return (
            <div 
                style={style}
                className={`arborist-node ${isSelected ? 'arborist-node--selected' : ''}`}
            >
                {hasChildren && (
                    <span 
                        className="arborist-toggle"
                        onClick={(e) => {
                            e.stopPropagation();
                            node.toggle();
                        }}
                    >
                        {node.isOpen ? '−' : '+'}
                    </span>
                )}
                {!hasChildren && <span className="arborist-toggle"></span>}
                <span 
                    className="arborist-node-content"
                    onClick={() => {
                        if (node.data.process) {
                            onProcessSwitch(node.data.process);
                        }
                    }}
                >
                    {node.data.name}
                </span>
            </div>
        );
    };

    return (
        <div className="arborist-tree-container">
            <Form.Control
                type="text"
                placeholder="Search processes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="arborist-search"
                size="sm"
            />
            <Tree
                data={treeData}
                disableDrag={true}
                disableDrop={true}
                disableMultiSelection={true}
                openByDefault={false}
                initialOpenState={initiallyOpenIds.reduce((acc, id) => {
                    acc[id] = true;
                    return acc;
                }, {})}
                indent={20}
                rowHeight={36}
                searchTerm={searchTerm}
                searchMatch={(node, term) => 
                    node.data.name.toLowerCase().includes(term.toLowerCase())
                }
            >
                {Node}
            </Tree>
        </div>
    );
});

export default ProcessTreeView;