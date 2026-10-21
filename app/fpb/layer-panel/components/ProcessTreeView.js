import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Tree } from 'react-arborist';
import Form from 'react-bootstrap/Form';
import { createArboristTreeData, getPathToProcess } from '../utils/treeUtils';
import { getSystemLimit } from '../../help/helpUtils';
import { is } from '../../help/utils';

/** Process operators of a decomposition, for its row in Layers (016c decision 12) */
function operatorCount(process) {
    const bo = process && process.businessObject;
    if (!bo || !bo.isDecomposedProcessOperator) {
        return null;
    }
    const systemLimit = getSystemLimit(process);
    const inner = (systemLimit && systemLimit.businessObject.elementsContainer) || [];
    return inner.filter((element) => element && is(element, 'fpb:ProcessOperator')).length;
}

const ProcessTreeView = memo(({ processes, namesRevision, selectedProcess, onProcessSwitch }) => {
    const [searchTerm, setSearchTerm] = useState('');

    // namesRevision: names are read from business objects changed in place
    const treeData = useMemo(() => createArboristTreeData(processes), [processes, namesRevision]);

    const initiallyOpenIds = useMemo(() => {
        if (!selectedProcess) return [];
        return getPathToProcess(selectedProcess, processes);
    }, [selectedProcess, processes]);

    // initialOpenState only counts when the tree is first shown. A layer
    // reached or created while the tree is open stayed hidden under a closed
    // node: open the path to the current layer whenever it changes.
    const treeRef = useRef(null);
    useEffect(() => {
        const tree = treeRef.current;
        if (!tree) return;
        initiallyOpenIds.forEach((id) => tree.open(id));
    }, [initiallyOpenIds, treeData]);

    if (processes.length === 0) {
        return null;
    }

    const Node = ({ node, style, dragHandle }) => {
        const isSelected = selectedProcess && node.data.process?.id === selectedProcess.id;
const hasChildren = node.children && node.children.length > 0;
        const count = operatorCount(node.data.process);
        
        return (
            <div 
                style={style}
                className={`arborist-node ${isSelected ? 'arborist-node--selected' : ''}`}
            >
                {hasChildren && (
                    <span 
                        className="arborist-toggle"
                        role="button"
                        tabIndex={0}
                        aria-label={node.isOpen ? `Collapse ${node.data.name}` : `Expand ${node.data.name}`}
                        aria-expanded={node.isOpen}
                        onClick={(e) => {
                            e.stopPropagation();
                            node.toggle();
                        }}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
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
                    role="button"
                    tabIndex={0}
                    title={node.data.name}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => {
                        if (node.data.process) {
                            onProcessSwitch(node.data.process);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        if (node.data.process) {
                            onProcessSwitch(node.data.process);
                        }
                    }}
                >
                    {node.data.name}
                </span>
                {count !== null && (
                    <span className="arborist-node-count">{count === 1 ? '1 operator' : count + ' operators'}</span>
                )}
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
                ref={treeRef}
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