import { markText } from '../i18n/markText';
import { is } from '../help/utils';

/**
 * The layers of a model (016d T1): a process is a layer; the top layer
 * belongs to the project, every other one is the decomposition of a process
 * operator. Read from the model each time, never kept on the side.
 */

/** The top layer: its parent is the project */
export function isRootProcess(process) {
  return !!(process && process.businessObject && is(process.businessObject.parent, 'fpb:Project'));
}

/**
 * The name of a layer as Layers and the breadcrumbs show it: the project name
 * for the top layer, the name of the decomposed operator below, cut after
 * `maxLength` characters.
 */
/** Name of a layer; a layer without a name in the language of `translate` */
export function layerName(process, maxLength = Infinity, translate = (text) => text) {
  const bo = process.businessObject;
  if (isRootProcess(process)) {
    return bo.parent.name;
  }
  if (bo.isDecomposedProcessOperator != null) {
    const name = bo.isDecomposedProcessOperator.name;
    if (!name) {
      return translate(markText('unnamed'));
    }
    return name.length > maxLength ? name.substring(0, maxLength) + '...' : name;
  }
  return translate(markText('Process'));
}

/** `{ id, process, children }` from the top layers down */
export function buildTree(processes) {
  const node = (process, seen) => {
    seen.add(process.id);
    const children = (process.businessObject.consistsOfProcesses || [])
      .filter((child) => child && !seen.has(child.id))
      .map((child) => node(child, seen));
    return { id: process.id, process, children };
  };
  return (processes || []).filter(isRootProcess).map((root) => node(root, new Set()));
}

/** The layers from the top down to `process` */
export function pathTo(process) {
  if (!process || !process.businessObject) {
    return [];
  }
  const path = [process];
  const seen = new Set([process.id]);
  let current = process;
  while (!isRootProcess(current)) {
    const parent = current.businessObject.parent;
    if (!parent || !parent.businessObject || seen.has(parent.id)) {
      break;
    }
    seen.add(parent.id);
    path.unshift(parent);
    current = parent;
  }
  return path;
}
