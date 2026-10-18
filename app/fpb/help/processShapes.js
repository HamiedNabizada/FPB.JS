import { is } from './utils';
import { getSystemLimit } from './helpUtils';

/**
 * The data store (getProcesses) holds process business objects, while
 * modeling.switchProcess needs the process root shape. The shapes are reachable
 * from the entry point via consistsOfProcesses.
 */

/**
 * All process root shapes, entry point first, breadth first.
 */
export function collectProcessShapes(projectDefinition) {
  const shapes = [];
  const seen = new Set();
  const queue = [projectDefinition && projectDefinition.entryPoint];
  while (queue.length > 0) {
    const shape = queue.shift();
    if (!shape || !shape.businessObject || seen.has(shape)) {
      continue;
    }
    seen.add(shape);
    shapes.push(shape);
    (shape.businessObject.consistsOfProcesses || []).forEach((child) => {
      if (child && child.businessObject) {
        queue.push(child);
      }
    });
  }
  return shapes;
}

/**
 * The copies of a state on the other layers. A boundary state shares its id
 * with the state it shows one layer up (helpUtils.createStateShapeForNewLayer),
 * so every state shape with that id is the same object of the model. Use this
 * for every new lookup across layers, so a later move to own ids per
 * representation (JSON v2, Geplante-Features/020a) has one place to change.
 */
export function stateCopies(projectDefinition, element) {
  const copies = [];
  collectProcessShapes(projectDefinition).forEach((process) => {
    const systemLimit = getSystemLimit(process);
    ((systemLimit && systemLimit.businessObject.elementsContainer) || []).forEach((candidate) => {
      if (candidate && candidate !== element && candidate.id === element.id &&
          candidate.businessObject !== element.businessObject &&
          is(candidate, 'fpb:State') && copies.indexOf(candidate) === -1) {
        copies.push(candidate);
      }
    });
  });
  return copies;
}

/**
 * The process root shape with the given id, or null.
 */
export function findProcessShape(projectDefinition, id) {
  return collectProcessShapes(projectDefinition).find((shape) => shape.id === id) || null;
}
