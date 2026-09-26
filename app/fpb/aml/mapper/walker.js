import { stripAlias } from './mappings';

/**
 * Port of CaexElementWalker.cs: depth-first walks over InternalElements.
 */

/** WalkInternalElements(roots, visit): every IE reachable from the roots, parents first */
export function walkInternalElements(roots, visit) {
  for (const ie of roots) {
    visit(ie);
    walkInternalElements(ie.internalElement, visit);
  }
}

/** WalkInternalElements(doc, visit): every IE under every InstanceHierarchy */
export function walkDocumentInternalElements(doc, visit) {
  if (!doc || !doc.caexFile) {
    return;
  }
  for (const ih of doc.caexFile.instanceHierarchy) {
    walkInternalElements(ih.internalElement, visit);
  }
}

/** CollectIesBySuc: every IE whose RefBaseSystemUnitPath matches `sucPath` */
export function collectIesBySuc(doc, sucPath) {
  const result = [];
  walkDocumentInternalElements(doc, (ie) => {
    if (stripAlias(ie.refBaseSystemUnitPath) === sucPath) {
      result.push(ie);
    }
  });
  return result;
}
