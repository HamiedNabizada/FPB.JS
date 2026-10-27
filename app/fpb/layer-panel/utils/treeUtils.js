import { layerName } from '../../layers/tree';

/**
 * Display name of a process, cut after `maxLength` characters; the same
 * name the layers tree and the breadcrumbs show (layers/tree.js).
 */
export const getProcessDisplayName = (process, maxLength = 25) => layerName(process, maxLength);
