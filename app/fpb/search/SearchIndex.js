import { is, isAny } from '../help/utils';
import { getProcessDisplayName } from '../layer-panel/utils/treeUtils';

const SEARCHABLE = ['fpb:State', 'fpb:ProcessOperator', 'fpb:TechnicalResource', 'fpb:SystemLimit'];

const TYPE_LABELS = {
  'fpb:Product': 'Product',
  'fpb:Energy': 'Energy',
  'fpb:Information': 'Information',
  'fpb:ProcessOperator': 'Process operator',
  'fpb:TechnicalResource': 'Technical resource',
  'fpb:SystemLimit': 'System limit'
};

/**
 * All named elements of all layers. Layers other than the current one are not
 * on the canvas, so they are read from the processes' elementsContainer. A
 * boundary state appears once per layer it sits in.
 */
export function collectEntries(processShapes) {
  const entries = [];
  (processShapes || []).forEach(function (process) {
    if (!process || !process.businessObject) {
      return;
    }
    const layer = getProcessDisplayName(process, 40);
    const add = function (element) {
      if (!element || !element.businessObject || !isAny(element, SEARCHABLE)) {
        return;
      }
      const bo = element.businessObject;
      const identification = bo.identification || {};
      entries.push({
        element: element,
        process: process,
        id: element.id,
        name: bo.name || identification.shortName || '',
        longName: identification.longName || '',
        type: TYPE_LABELS[bo.$type] || bo.$type,
        layer: layer
      });
    };
    (process.businessObject.elementsContainer || []).forEach(function (element) {
      add(element);
      if (is(element, 'fpb:SystemLimit')) {
        (element.businessObject.elementsContainer || []).forEach(add);
      }
    });
  });
  return entries;
}

/**
 * Entries matching the pattern (case-insensitive, in name, long name or id).
 * Exact names first, then names starting with the pattern, then the rest;
 * within a rank the current layer first.
 */
export function findEntries(entries, pattern, currentProcess) {
  const needle = (pattern || '').trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const rank = function (entry) {
    const name = entry.name.toLowerCase();
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
    if (entry.longName.toLowerCase().includes(needle)) return 3;
    if (entry.id.toLowerCase().includes(needle)) return 4;
    return -1;
  };
  return entries
    .map(function (entry) { return { entry: entry, rank: rank(entry) }; })
    .filter(function (hit) { return hit.rank >= 0; })
    .sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const aHere = a.entry.process === currentProcess ? 0 : 1;
      const bHere = b.entry.process === currentProcess ? 0 : 1;
      if (aHere !== bHere) return aHere - bHere;
      return a.entry.name.localeCompare(b.entry.name);
    })
    .map(function (hit) { return hit.entry; });
}
