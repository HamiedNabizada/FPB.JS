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
 * The process root shape with the given id, or null.
 */
export function findProcessShape(projectDefinition, id) {
  return collectProcessShapes(projectDefinition).find((shape) => shape.id === id) || null;
}
