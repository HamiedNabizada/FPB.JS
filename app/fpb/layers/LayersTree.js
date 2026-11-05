/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useEffect, useLayoutEffect, useRef, useState } from '@bpmn-io/properties-panel/preact/hooks';

import { getSystemLimit } from '../help/helpUtils';
import { is } from '../help/utils';
import { layerName, pathTo } from './tree';
import './LayersTree.css';

// names in the tree are cut after 25 characters, as before (016d T8)
const NAME_LENGTH = 25;

/** Process operators of a decomposition, for its row (016c decision 12) */
function operatorCount(process) {
  const bo = process && process.businessObject;
  if (!bo || !bo.isDecomposedProcessOperator) {
    return null;
  }
  const systemLimit = getSystemLimit(process);
  const inner = (systemLimit && systemLimit.businessObject.elementsContainer) || [];
  return inner.filter((element) => element && is(element, 'fpb:ProcessOperator')).length;
}

/** Re-render whenever the layers or the current one may have changed */
function useLayersRevision(eventBus) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision((value) => value + 1);
    eventBus.on('layers.changed', changed);
    return () => eventBus.off('layers.changed', changed);
  }, [eventBus]);
  return revision;
}

/** Nodes matching the search, with their ancestors; null keeps the whole tree */
function filterTree(nodes, term) {
  if (!term) {
    return null;
  }
  const keep = new Set();
  const visit = (node, ancestors) => {
    const match = layerName(node.process).toLowerCase().includes(term);
    let below = false;
    node.children.forEach((child) => {
      below = visit(child, ancestors.concat(node.id)) || below;
    });
    if (match || below) {
      keep.add(node.id);
      ancestors.forEach((id) => keep.add(id));
    }
    return match || below;
  };
  nodes.forEach((node) => visit(node, []));
  return keep;
}

/**
 * The layers of the model as a WAI-ARIA tree (016d V2): the current layer is
 * marked, the path to it is open, a decomposition counts its operators.
 * Arrows move and fold, Enter opens the layer, Home and End jump.
 */
export function LayersTree(props) {
  const { modeler } = props;
  const eventBus = modeler.get('eventBus');
  const layers = modeler.get('fpbLayers');
  const translate = modeler.get('translate');
  const revision = useLayersRevision(eventBus);

  const tree = layers.getTree();
  const current = layers.getCurrent();
  const currentId = current ? current.id : null;

  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(() => new Set(current ? pathTo(current).map((p) => p.id) : []));
  const [focusId, setFocusId] = useState(null);
  const pendingFocus = useRef(null);
  const listRef = useRef(null);

  // the path to the current layer is always open, also for a layer reached
  // or created while the tree is shown
  useEffect(() => {
    if (!current) {
      return;
    }
    setOpen((previous) => {
      const next = new Set(previous);
      pathTo(current).forEach((process) => next.add(process.id));
      return next;
    });
  }, [currentId, revision]);

  // at once after rendering, not after the next frame: a quick Enter after
  // an arrow must reach the item the arrow went to
  useLayoutEffect(() => {
    if (pendingFocus.current && listRef.current) {
      const item = listRef.current.querySelector('[data-id="' + pendingFocus.current + '"]');
      pendingFocus.current = null;
      if (item) {
        item.focus();
      }
    }
  });

  const search = term.trim().toLowerCase();
  const kept = filterTree(tree, search);
  const isOpen = (node) => (kept ? true : open.has(node.id));
  const shown = (node) => !kept || kept.has(node.id);
  // only the children the search leaves count: a match whose children are
  // all filtered out is a leaf (016g C1)
  const childrenOf = (node) => node.children.filter(shown);

  // the items as the user sees them, top to bottom, for the keyboard
  const flat = [];
  const flatten = (nodes, parent) => nodes.filter(shown).forEach((node) => {
    flat.push({ node, parent });
    if (childrenOf(node).length && isOpen(node)) {
      flatten(childrenOf(node), node);
    }
  });
  flatten(tree, null);

  const focusable = flat.some((entry) => entry.node.id === focusId) ? focusId
    : (flat.some((entry) => entry.node.id === currentId) ? currentId : (flat[0] && flat[0].node.id));

  const toggle = (id) => setOpen((previous) => {
    const next = new Set(previous);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });

  const moveTo = (id) => {
    if (!id) {
      return;
    }
    if (id === focusId && listRef.current) {
      // nothing to re-render: focus at once
      const item = listRef.current.querySelector('[data-id="' + id + '"]');
      if (item) {
        item.focus();
      }
      return;
    }
    pendingFocus.current = id;
    setFocusId(id);
  };

  const onKeyDown = (event) => {
    const item = event.target.closest && event.target.closest('[role="treeitem"]');
    if (!item) {
      return;
    }
    const index = flat.findIndex((entry) => entry.node.id === item.getAttribute('data-id'));
    if (index === -1) {
      return;
    }
    const { node, parent } = flat[index];
    const hasChildren = childrenOf(node).length > 0;
    switch (event.key) {
    case 'ArrowDown':
      moveTo(flat[index + 1] && flat[index + 1].node.id);
      break;
    case 'ArrowUp':
      moveTo(flat[index - 1] && flat[index - 1].node.id);
      break;
    case 'ArrowRight':
      if (hasChildren && !isOpen(node)) {
        toggle(node.id);
      } else if (hasChildren) {
        moveTo(flat[index + 1] && flat[index + 1].node.id);
      }
      break;
    case 'ArrowLeft':
      if (hasChildren && isOpen(node) && !kept) {
        toggle(node.id);
      } else if (parent) {
        moveTo(parent.id);
      }
      break;
    case 'Home':
      moveTo(flat[0].node.id);
      break;
    case 'End':
      moveTo(flat[flat.length - 1].node.id);
      break;
    case 'Enter':
    case ' ':
      layers.open(node.process);
      break;
    default:
      return;
    }
    // the canvas must not move its selection with the same keys
    event.preventDefault();
    event.stopPropagation();
  };

  const renderNode = (node, level) => {
    if (!shown(node)) {
      return null;
    }
    const name = layerName(node.process, Infinity, translate);
    const hasChildren = childrenOf(node).length > 0;
    const expanded = hasChildren && isOpen(node);
    const isCurrent = node.id === currentId;
    const count = operatorCount(node.process);
    return (
      <li
        key={node.id}
        role="treeitem"
        data-id={node.id}
        aria-label={name}
        aria-level={level}
        aria-expanded={hasChildren ? String(expanded) : undefined}
        aria-current={isCurrent ? 'true' : undefined}
        tabIndex={node.id === focusable ? 0 : -1}
        onFocus={(event) => {
          // the event reaches the items around it as well
          if (event.target === event.currentTarget) {
            setFocusId(node.id);
          }
        }}
      >
        <div
          class={'fpb-layers-node' + (isCurrent ? ' fpb-layers-node--current' : '')}
          style={{ paddingLeft: (4 + (level - 1) * 16) + 'px' }}
          onClick={() => layers.open(node.process)}
        >
          <span
            class="fpb-layers-toggle"
            aria-hidden="true"
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) {
                toggle(node.id);
              }
            }}
          >
            {hasChildren ? (expanded ? '−' : '+') : ''}
          </span>
          <span class="fpb-layers-node-name" title={name}>{layerName(node.process, NAME_LENGTH, translate)}</span>
          {count !== null && (
            <span class="fpb-layers-node-count">
              {count === 1 ? translate('1 operator') : translate('{count} operators', { count: String(count) })}
            </span>
          )}
        </div>
        {expanded && (
          <ul role="group">
            {childrenOf(node).map((child) => renderNode(child, level + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div class="fpb-layers-tree">
      <input
        type="text"
        class="fpb-layers-search"
        placeholder={translate('Search processes...')}
        aria-label={translate('Search layers')}
        value={term}
        onInput={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          // Escape empties the search first; the sheet around it stays (016g G1)
          if (event.key === 'Escape' && term) {
            event.preventDefault();
            setTerm('');
          }
        }}
      />
      <ul role="tree" aria-label={translate('Layers')} ref={listRef} onKeyDown={onKeyDown}>
        {tree.map((node) => renderNode(node, 1))}
      </ul>
    </div>
  );
}

