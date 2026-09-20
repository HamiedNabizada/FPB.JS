import { cloneModelData } from '../help/cloneModelData';

/**
 * Automatic layout for FPB.JS import data.
 *
 * Works on the JSON exchange format (array of project definition and process
 * entries), not on the canvas: the importer needs positions before it can build
 * shapes, and moving shapes on the canvas would trigger the layer consistency
 * updaters. Each process is laid out on its own.
 *
 * The drawing follows the VDI 3682 conventions used throughout FPB.JS:
 * flow from top to bottom, input states centered on the upper edge of the
 * SystemLimit, output states on the lower edge, TechnicalResources to the right
 * of the SystemLimit. Interior elements use a layered (Sugiyama) layout:
 * cycle breaking, longest path layering with dummy nodes for long flows,
 * barycenter crossing reduction and a least squares coordinate assignment.
 */

const STATE_TYPES = ['fpb:Product', 'fpb:Energy', 'fpb:Information'];
const FLOW_TYPES = ['fpb:Flow', 'fpb:ParallelFlow', 'fpb:AlternativeFlow'];

export const LAYOUT_CONSTANTS = {
  ORIGIN_X: 350,
  ORIGIN_Y: 50,
  CANVAS_MARGIN: 20,
  STATE_SIZE: { width: 50, height: 50 },
  OPERATOR_SIZE: { width: 150, height: 80 },
  RESOURCE_SIZE: { width: 150, height: 80 },
  NODE_GAP: 60,
  // State labels are drawn left of and above the state symbol.
  STATE_LABEL_ROOM: 100,
  DUMMY_WIDTH: 20,
  DUMMY_GAP: 25,
  LEVEL_GAP: 60,
  TRACK_SPACING: 15,
  OUTSIDE_TRACK_OFFSET: 25,
  MARGIN_LEFT: 60,
  MARGIN_RIGHT: 60,
  MARGIN_EMPTY_LEVEL: 60,
  CHANNEL_SPACING: 15,
  RESOURCE_OFFSET: 60,
  RESOURCE_GAP: 30,
  MIN_SYSTEM_LIMIT_WIDTH: 250,
  // Estimate for the SystemLimit name drawn at its upper right corner.
  NAME_CHAR_WIDTH: 7.5,
  NAME_MAX_WIDTH: 400,
  ORDERING_SWEEPS: 12,
  COORDINATE_SWEEPS: 16,
  // checkIfOnSystemBorder accepts a state center within 30px of an edge.
  BORDER_TOLERANCE: 30,
  // Two line state labels sit up to about 35px above the state symbol.
  STATE_LABEL_HEIGHT: 30,
  // Flows whose ends are this close dock off center instead of bending.
  SNAP_DISTANCE: 12,
  SNAP_INSET: 8
};

const C = LAYOUT_CONSTANTS;

/**
 * Returns true if some process lacks visual information for a shape or a
 * connection, or has no elementVisualInformation at all.
 */
export function needsLayout(data) {
  if (!Array.isArray(data)) {
    return false;
  }
  return data.some((entry) => {
    if (!entry || !entry.process) {
      return false;
    }
    const model = readProcess(entry);
    return model.shapeIds.some((id) => !hasShapeVisual(model.visual.get(id)))
      || model.connectionIds.some((id) => !hasConnectionVisual(model.visual.get(id)));
  });
}

/**
 * Lays out import data.
 *
 * @param {Array} data FPB.JS JSON (project definition and process entries)
 * @param {Object} [options]
 * @param {'missing'|'all'} [options.mode='missing'] 'missing' keeps existing
 *   visual information and only adds what is absent, 'all' replaces it.
 * @return {{ data: Array, changed: boolean, report: Array }}
 */
export function layoutImportData(data, options = {}) {
  const mode = options.mode === 'all' ? 'all' : 'missing';
  const result = cloneModelData(data);
  const report = [];

  if (!Array.isArray(result)) {
    return { data: result, changed: false, report };
  }

  const entries = result.filter((entry) => entry && entry.process);
  entries.forEach((entry) => {
    if (!Array.isArray(entry.elementVisualInformation)) {
      entry.elementVisualInformation = [];
    }
  });
  const models = entries.map((entry) => readProcess(entry));
  const byProcessId = new Map(models.map((model) => [model.entry.process.id, model]));

  orderTopDown(models, byProcessId, result).forEach((model) => {
    const parent = findParent(model, models);
    const boundaryOrder = parent ? parentBoundaryOrder(model, parent) : null;
    const outcome = layoutProcess(model, mode, boundaryOrder);
    const name = model.systemLimit && typeof model.systemLimit.name === 'string' ? model.systemLimit.name : '';
    report.push({ process: model.entry.process.id, name, ...outcome });
  });

  const changed = report.some((item) => item.mode !== 'unchanged');
  return { data: result, changed, report };
}

// ---------------------------------------------------------------------------
// Reading the exchange format
// ---------------------------------------------------------------------------

function refId(ref) {
  if (ref === null || ref === undefined) {
    return null;
  }
  if (typeof ref === 'string' || ref instanceof String) {
    return String(ref);
  }
  return ref.id || null;
}

function isState(item) {
  return item && STATE_TYPES.includes(item.$type);
}

function isOperator(item) {
  return item && item.$type === 'fpb:ProcessOperator';
}

function sizeOf(item) {
  if (isState(item)) {
    return C.STATE_SIZE;
  }
  if (isOperator(item)) {
    return C.OPERATOR_SIZE;
  }
  return C.RESOURCE_SIZE;
}

function hasShapeVisual(visual) {
  return !!visual && isFiniteNumber(visual.x) && isFiniteNumber(visual.y)
    && isFiniteNumber(visual.width) && isFiniteNumber(visual.height);
}

function hasConnectionVisual(visual) {
  return !!visual && Array.isArray(visual.waypoints) && visual.waypoints.length >= 2
    && visual.waypoints.every((point) => point && isFiniteNumber(point.x) && isFiniteNumber(point.y));
}

function isFiniteNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

function readProcess(entry) {
  const visualList = Array.isArray(entry.elementVisualInformation) ? entry.elementVisualInformation : [];
  const dataList = Array.isArray(entry.elementDataInformation) ? entry.elementDataInformation : [];
  const data = new Map(dataList.filter(Boolean).map((item) => [item.id, item]));
  const visual = new Map(visualList.filter(Boolean).map((item) => [item.id, item]));

  const topLevel = (entry.process.elementsContainer || []).map((id) => data.get(refId(id))).filter(Boolean);
  const systemLimit = topLevel.find((item) => item.$type === 'fpb:SystemLimit') || null;
  const inner = systemLimit
    ? (systemLimit.elementsContainer || []).map((id) => data.get(refId(id))).filter(Boolean)
    : [];

  const nodes = inner.filter((item) => isState(item) || isOperator(item));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const flows = inner.filter((item) => FLOW_TYPES.includes(item.$type)
    && nodeIds.has(refId(item.sourceRef)) && nodeIds.has(refId(item.targetRef))
    && refId(item.sourceRef) !== refId(item.targetRef));

  const resources = topLevel.filter((item) => item.$type === 'fpb:TechnicalResource');
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const usages = topLevel.filter((item) => {
    if (item.$type !== 'fpb:Usage') {
      return false;
    }
    const ends = [refId(item.sourceRef), refId(item.targetRef)];
    return ends.some((id) => resourceIds.has(id)) && ends.some((id) => nodeIds.has(id));
  });

  const shapeIds = [
    ...(systemLimit ? [systemLimit.id] : []),
    ...nodes.map((node) => node.id),
    ...resources.map((resource) => resource.id)
  ];
  const connectionIds = [...flows, ...usages].map((connection) => connection.id);

  return { entry, data, visual, systemLimit, nodes, flows, resources, usages, shapeIds, connectionIds };
}

/**
 * Parents first, so a decomposed process can take over the left to right
 * order of the states at its ProcessOperator in the parent view.
 */
function orderTopDown(models, byProcessId, data) {
  const project = data.find((item) => item && item.$type === 'fpb:Project');
  const entryPoint = project ? refId(project.entryPoint) : null;
  const ordered = [];
  const seen = new Set();

  const visit = (model) => {
    if (!model || seen.has(model)) {
      return;
    }
    seen.add(model);
    ordered.push(model);
    models.filter((child) => findParent(child, models) === model).forEach(visit);
  };

  visit(byProcessId.get(entryPoint));
  models.filter((model) => !findParent(model, models)).forEach(visit);
  models.forEach(visit);
  return ordered;
}

function decomposingOperatorId(model) {
  return refId(model.entry.process.isDecomposedProcessOperator);
}

function findParent(model, models) {
  const processId = model.entry.process.id;
  const operatorId = decomposingOperatorId(model);
  return models.find((candidate) => candidate !== model && candidate.nodes.some((node) => isOperator(node)
    && (refId(node.decomposedView) === processId || (operatorId && node.id === operatorId)))) || null;
}

/**
 * Input and output states of a decomposed process are the states connected to
 * the decomposed ProcessOperator in the parent process, ordered by their
 * position there.
 */
function parentBoundaryOrder(model, parent) {
  const processId = model.entry.process.id;
  const operatorId = decomposingOperatorId(model);
  const operator = parent.nodes.find((node) => isOperator(node)
    && (refId(node.decomposedView) === processId || node.id === operatorId));
  if (!operator) {
    return null;
  }
  const centerX = (id) => {
    const visual = parent.visual.get(id);
    return hasShapeVisual(visual) ? visual.x + visual.width / 2 : 0;
  };
  const byParentPosition = (ids) => ids
    .map((id, index) => ({ id, index, x: centerX(id) }))
    .sort((a, b) => (a.x - b.x) || (a.index - b.index))
    .map((item) => item.id);

  const inputs = parent.flows.filter((flow) => refId(flow.targetRef) === operator.id)
    .map((flow) => refId(flow.sourceRef));
  const outputs = parent.flows.filter((flow) => refId(flow.sourceRef) === operator.id)
    .map((flow) => refId(flow.targetRef));
  return { inputs: byParentPosition(unique(inputs)), outputs: byParentPosition(unique(outputs)) };
}

function unique(list) {
  return list.filter((item, index) => list.indexOf(item) === index);
}

// ---------------------------------------------------------------------------
// Process level decision
// ---------------------------------------------------------------------------

function layoutProcess(model, mode, boundaryOrder) {
  const missingShapes = model.shapeIds.filter((id) => !hasShapeVisual(model.visual.get(id)));
  const missingConnections = model.connectionIds.filter((id) => !hasConnectionVisual(model.visual.get(id)));

  if (mode === 'missing' && missingShapes.length === 0 && missingConnections.length === 0) {
    return { mode: 'unchanged', placed: 0 };
  }

  // A lone SystemLimit position (some generators write a default one) is no
  // layout to build on: arrange everything when no element inside has a place.
  const nothingPlaced = model.shapeIds
    .filter((id) => !model.systemLimit || id !== model.systemLimit.id)
    .every((id) => missingShapes.includes(id));
  const systemLimitMissing = model.systemLimit && missingShapes.includes(model.systemLimit.id);

  if (mode === 'all' || nothingPlaced || systemLimitMissing || !model.systemLimit) {
    const geometry = computeFullLayout(model, boundaryOrder);
    writeGeometry(model, geometry);
    return { mode: 'full', placed: model.shapeIds.length + model.connectionIds.length };
  }

  // Connections of newly placed (or pushed aside) shapes are rerouted too,
  // their stored waypoints still point at the old position.
  const moved = new Set(missingShapes);
  if (missingShapes.length > 0) {
    placeMissingShapes(model, missingShapes, boundaryOrder).forEach((id) => moved.add(id));
  }
  const connections = [...model.flows, ...model.usages]
    .filter((connection) => missingConnections.includes(connection.id)
      || moved.has(refId(connection.sourceRef)) || moved.has(refId(connection.targetRef)));
  // Stale routes must not act as obstacles for the new ones.
  connections.forEach((connection) => model.visual.delete(connection.id));
  connections.forEach((connection) => {
    setVisual(model, connection.id, {
      id: connection.id,
      type: connection.$type,
      waypoints: simpleRoute(model, connection)
    });
  });
  return {
    mode: missingShapes.length > 0 ? 'incremental' : 'connections',
    placed: missingShapes.length + connections.length
  };
}

function setVisual(model, id, visual) {
  const list = model.entry.elementVisualInformation;
  const index = list.findIndex((item) => item && item.id === id);
  if (index === -1) {
    list.push(visual);
  } else {
    list[index] = visual;
  }
  model.visual.set(id, visual);
}

function writeGeometry(model, geometry) {
  geometry.shapes.forEach((box, id) => {
    const item = model.data.get(id);
    setVisual(model, id, {
      id,
      type: item.$type,
      x: round(box.x),
      y: round(box.y),
      width: box.width,
      height: box.height
    });
  });
  geometry.connections.forEach((waypoints, id) => {
    const item = model.data.get(id);
    setVisual(model, id, {
      id,
      type: item.$type,
      waypoints: waypoints.map((point) => ({ x: round(point.x), y: round(point.y) }))
    });
  });
}

function round(value) {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Full layout
// ---------------------------------------------------------------------------

/**
 * @return {{ shapes: Map<string, {x,y,width,height}>, connections: Map<string, Array> }}
 */
function computeFullLayout(model, boundaryOrder) {
  const shapes = new Map();
  const connections = new Map();

  if (!model.systemLimit) {
    placeResourcesWithoutSystemLimit(model, shapes);
    return { shapes, connections };
  }

  const graph = buildGraph(model, boundaryOrder);
  orderLayers(graph);
  assignX(graph);
  const usagePlan = planUsages(model, graph);
  assignY(graph, usagePlan);

  // Translate so the SystemLimit starts at the origin.
  const bounds = systemLimitBounds(graph);
  const dx = C.ORIGIN_X - bounds.x;
  const dy = C.ORIGIN_Y - bounds.y;
  graph.nodes.forEach((node) => {
    node.x += dx;
    node.cy += dy;
  });
  graph.levelTop = graph.levelTop.map((value) => value + dy);
  graph.levelBottom = graph.levelBottom.map((value) => value + dy);
  graph.trackY = shiftTracks(graph.trackY, dy);
  bounds.x += dx;
  bounds.y += dy;
  graph.channelX = graph.channelX.map((value) => value + dx);

  shapes.set(model.systemLimit.id, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  graph.nodes.filter((node) => !node.dummy).forEach((node) => {
    shapes.set(node.id, {
      x: node.x - node.width / 2,
      y: node.cy - node.height / 2,
      width: node.width,
      height: node.height
    });
  });

  routeFlows(graph, connections);
  placeResources(model, graph, bounds, usagePlan, shapes, connections);
  keepOnCanvas(shapes, connections);

  return { shapes, connections };
}

/**
 * Many TechnicalResources on the left can reach past the origin. Shift the
 * whole process so nothing lies at negative coordinates.
 */
function keepOnCanvas(shapes, connections) {
  let minX = Infinity;
  let minY = Infinity;
  shapes.forEach((box) => {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  });
  connections.forEach((points) => points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
  }));
  const dx = minX < C.CANVAS_MARGIN ? C.CANVAS_MARGIN - minX : 0;
  const dy = minY < C.CANVAS_MARGIN ? C.CANVAS_MARGIN - minY : 0;
  if (!dx && !dy) {
    return;
  }
  shapes.forEach((box) => {
    box.x += dx;
    box.y += dy;
  });
  connections.forEach((points) => points.forEach((point) => {
    point.x += dx;
    point.y += dy;
  }));
}

function buildGraph(model, boundaryOrder) {
  const documentIndex = new Map(model.nodes.map((node, index) => [node.id, index]));
  const out = new Map(model.nodes.map((node) => [node.id, []]));
  const incoming = new Map(model.nodes.map((node) => [node.id, []]));
  model.flows.forEach((flow) => {
    out.get(refId(flow.sourceRef)).push(flow);
    incoming.get(refId(flow.targetRef)).push(flow);
  });

  let inputs;
  let outputs;
  if (boundaryOrder) {
    const present = new Set(model.nodes.filter(isState).map((node) => node.id));
    inputs = boundaryOrder.inputs.filter((id) => present.has(id));
    const inputSet = new Set(inputs);
    outputs = boundaryOrder.outputs.filter((id) => present.has(id) && !inputSet.has(id));
  } else {
    const states = model.nodes.filter(isState);
    inputs = states.filter((node) => incoming.get(node.id).length === 0 && out.get(node.id).length > 0)
      .map((node) => node.id);
    outputs = states.filter((node) => out.get(node.id).length === 0 && incoming.get(node.id).length > 0)
      .map((node) => node.id);
  }
  const inputSet = new Set(inputs);
  const outputSet = new Set(outputs);
  const interior = model.nodes.filter((node) => !inputSet.has(node.id) && !outputSet.has(node.id));
  const interiorSet = new Set(interior.map((node) => node.id));

  // Cycle breaking on interior flows: depth first search in document order,
  // flows closing a cycle are drawn as back edges.
  const backEdges = new Set();
  const color = new Map();
  const interiorFlows = model.flows.filter((flow) => interiorSet.has(refId(flow.sourceRef))
    && interiorSet.has(refId(flow.targetRef)));
  const interiorOut = new Map(interior.map((node) => [node.id, []]));
  const interiorIn = new Map(interior.map((node) => [node.id, []]));
  interiorFlows.forEach((flow) => {
    interiorOut.get(refId(flow.sourceRef)).push(flow);
    interiorIn.get(refId(flow.targetRef)).push(flow);
  });
  const dfs = (id) => {
    color.set(id, 'gray');
    interiorOut.get(id).forEach((flow) => {
      const target = refId(flow.targetRef);
      if (color.get(target) === 'gray') {
        backEdges.add(flow.id);
      } else if (!color.has(target)) {
        dfs(target);
      }
    });
    color.set(id, 'black');
  };
  interior.filter((node) => interiorIn.get(node.id).length === 0).forEach((node) => {
    if (!color.has(node.id)) {
      dfs(node.id);
    }
  });
  interior.forEach((node) => {
    if (!color.has(node.id)) {
      dfs(node.id);
    }
  });

  // Longest path layering. Level 0 holds the inputs, the last level the outputs.
  const level = new Map();
  const levelOf = (id, stack = new Set()) => {
    if (level.has(id)) {
      return level.get(id);
    }
    if (stack.has(id)) {
      return 1;
    }
    stack.add(id);
    let value = 1;
    interiorIn.get(id).forEach((flow) => {
      if (!backEdges.has(flow.id)) {
        value = Math.max(value, levelOf(refId(flow.sourceRef), stack) + 1);
      }
    });
    stack.delete(id);
    level.set(id, value);
    return value;
  };
  interior.forEach((node) => levelOf(node.id));
  const maxInterior = interior.reduce((max, node) => Math.max(max, level.get(node.id)), 0);
  const lastLevel = maxInterior + 1;
  inputs.forEach((id) => level.set(id, 0));
  outputs.forEach((id) => level.set(id, lastLevel));

  const nodes = [];
  const nodeById = new Map();
  const addNode = (node) => {
    nodes.push(node);
    nodeById.set(node.id, node);
    return node;
  };
  model.nodes.forEach((item) => {
    const size = sizeOf(item);
    addNode({
      id: item.id,
      kind: isState(item) ? 'state' : 'operator',
      boundary: inputSet.has(item.id) ? 'input' : outputSet.has(item.id) ? 'output' : null,
      level: level.get(item.id),
      width: size.width,
      height: size.height,
      order: documentIndex.get(item.id),
      dummy: false,
      up: [],
      down: []
    });
  });

  // Forward segments (with dummy nodes for flows spanning several levels) and back edges.
  const chains = new Map();
  const back = [];
  model.flows.forEach((flow) => {
    const source = nodeById.get(refId(flow.sourceRef));
    const target = nodeById.get(refId(flow.targetRef));
    if (backEdges.has(flow.id) || target.level <= source.level) {
      back.push({ flow, source, target });
      return;
    }
    const chain = [source];
    for (let k = source.level + 1; k < target.level; k++) {
      chain.push(addNode({
        id: `dummy:${flow.id}:${k}`,
        kind: 'dummy',
        level: k,
        width: C.DUMMY_WIDTH,
        height: 0,
        order: source.order,
        dummy: true,
        up: [],
        down: []
      }));
    }
    chain.push(target);
    for (let i = 0; i < chain.length - 1; i++) {
      chain[i].down.push(chain[i + 1]);
      chain[i + 1].up.push(chain[i]);
    }
    chains.set(flow.id, { flow, chain });
  });

  const layers = [];
  for (let k = 0; k <= lastLevel; k++) {
    layers.push(nodes.filter((node) => node.level === k).sort((a, b) => a.order - b.order));
  }
  if (boundaryOrder) {
    layers[0] = inputs.map((id) => nodeById.get(id));
    layers[lastLevel] = outputs.map((id) => nodeById.get(id));
  }

  return {
    nodes,
    nodeById,
    layers,
    lastLevel,
    chains,
    back,
    fixedLayers: boundaryOrder ? new Set([0, lastLevel]) : new Set(),
    systemLimitName: typeof model.systemLimit.name === 'string' ? model.systemLimit.name.trim() : '',
    channelX: [],
    trackY: new Map()
  };
}

// --- Crossing reduction ----------------------------------------------------

function orderLayers(graph) {
  const { layers } = graph;

  // Initial order below the first level follows the upper neighbors.
  for (let k = 1; k < layers.length; k++) {
    if (!graph.fixedLayers.has(k)) {
      sortByBarycenter(layers[k], layers[k - 1], 'up');
    }
  }

  let best = layers.map((layer) => layer.slice());
  let bestCrossings = countAllCrossings(layers);

  for (let sweep = 0; sweep < C.ORDERING_SWEEPS && bestCrossings > 0; sweep++) {
    for (let k = 1; k < layers.length; k++) {
      if (!graph.fixedLayers.has(k)) {
        sortByBarycenter(layers[k], layers[k - 1], 'up');
      }
    }
    for (let k = layers.length - 2; k >= 0; k--) {
      if (!graph.fixedLayers.has(k)) {
        sortByBarycenter(layers[k], layers[k + 1], 'down');
      }
    }
    const crossings = countAllCrossings(layers);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      best = layers.map((layer) => layer.slice());
    }
  }

  best.forEach((layer, k) => {
    layers[k] = layer;
  });
  graph.crossings = bestCrossings;
}

function sortByBarycenter(layer, reference, direction) {
  const position = new Map(reference.map((node, index) => [node, index]));
  const keys = new Map();
  layer.forEach((node, index) => {
    const neighbors = node[direction].filter((neighbor) => position.has(neighbor));
    const key = neighbors.length
      ? neighbors.reduce((sum, neighbor) => sum + position.get(neighbor), 0) / neighbors.length
      : index;
    keys.set(node, { key, index });
  });
  layer.sort((a, b) => (keys.get(a).key - keys.get(b).key) || (keys.get(a).index - keys.get(b).index));
}

function countAllCrossings(layers) {
  let total = 0;
  for (let k = 0; k < layers.length - 1; k++) {
    total += countCrossings(layers[k], layers[k + 1]);
  }
  return total;
}

function countCrossings(upper, lower) {
  const upperIndex = new Map(upper.map((node, index) => [node, index]));
  const lowerIndex = new Map(lower.map((node, index) => [node, index]));
  const edges = [];
  upper.forEach((node) => {
    node.down.forEach((neighbor) => {
      if (lowerIndex.has(neighbor)) {
        edges.push([upperIndex.get(node), lowerIndex.get(neighbor)]);
      }
    });
  });
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if ((edges[i][0] - edges[j][0]) * (edges[i][1] - edges[j][1]) < 0) {
        crossings++;
      }
    }
  }
  return crossings;
}

// --- Horizontal coordinates --------------------------------------------------

function separation(left, right) {
  const gap = left.dummy || right.dummy ? C.DUMMY_GAP : C.NODE_GAP;
  const labelRoom = right.kind === 'state' ? C.STATE_LABEL_ROOM : 0;
  return left.width / 2 + right.width / 2 + gap + labelRoom;
}

function assignX(graph) {
  const { layers } = graph;
  layers.forEach((layer) => {
    let x = 0;
    layer.forEach((node, index) => {
      x = index === 0 ? 0 : x + separation(layer[index - 1], node);
      node.x = x;
    });
  });

  // A one to one link (single neighbor on both sides) or a dummy node weighs
  // more, so these connections end up straight. Locked dummy nodes keep the
  // vertical line chosen for their flow.
  const align = (layer, direction) => {
    const opposite = direction === 'up' ? 'down' : 'up';
    const desired = [];
    const weights = [];
    layer.forEach((node) => {
      if (node.lock !== undefined) {
        desired.push(node.lock);
        weights.push(1000);
        return;
      }
      const neighbors = node[direction];
      if (!neighbors.length) {
        desired.push(node.x);
        weights.push(1);
        return;
      }
      desired.push(neighbors.reduce((sum, neighbor) => sum + neighbor.x, 0) / neighbors.length);
      const oneToOne = neighbors.length === 1 && neighbors[0][opposite].length === 1;
      weights.push(node.dummy || oneToOne ? 8 : 1);
    });
    placeInOrder(layer, desired, weights);
  };
  const sweeps = (count) => {
    for (let sweep = 0; sweep < count; sweep++) {
      for (let k = 1; k < layers.length; k++) {
        align(layers[k], 'up');
      }
      for (let k = layers.length - 2; k >= 0; k--) {
        align(layers[k], 'down');
      }
    }
  };

  sweeps(C.COORDINATE_SWEEPS);
  // One vertical line per long flow, then let the other elements settle around it.
  graph.chains.forEach(({ chain }) => {
    const dummies = chain.slice(1, -1);
    if (!dummies.length) {
      return;
    }
    const xs = dummies.map((dummy) => dummy.x).sort((a, b) => a - b);
    const lock = xs[Math.floor(xs.length / 2)];
    dummies.forEach((dummy) => {
      dummy.lock = lock;
    });
  });
  sweeps(C.COORDINATE_SWEEPS / 2);
  straighten(graph);
}

/**
 * Final pass: put all dummy nodes of a long flow on one vertical line and align
 * one to one links, wherever the neighbors in the level leave room.
 */
function straighten(graph) {
  const { layers } = graph;
  const index = new Map();
  layers.forEach((layer) => layer.forEach((node, i) => index.set(node, i)));
  const fits = (node, x) => {
    const layer = layers[node.level];
    const i = index.get(node);
    const left = layer[i - 1];
    const right = layer[i + 1];
    return (!left || left.x + separation(left, node) <= x + 0.01)
      && (!right || x + separation(node, right) <= right.x + 0.01);
  };

  graph.chains.forEach(({ chain }) => {
    const dummies = chain.slice(1, -1);
    if (!dummies.length) {
      return;
    }
    const xs = dummies.map((dummy) => dummy.x).sort((a, b) => a - b);
    const candidates = [dummies[0].lock, chain[chain.length - 1].x, chain[0].x, xs[Math.floor(xs.length / 2)], ...xs]
      .filter((x) => x !== undefined);
    const target = candidates.find((x) => dummies.every((dummy) => fits(dummy, x)));
    if (target !== undefined) {
      dummies.forEach((dummy) => {
        dummy.x = target;
      });
    }
  });

  // Links that are only a few pixels off vertical: move one end if the level
  // leaves room, a nearly straight line reads worse than a straight one.
  layers.forEach((layer) => {
    layer.forEach((upper) => {
      upper.down.forEach((lower) => {
        const dx = Math.abs(upper.x - lower.x);
        if (dx <= 0.5 || dx > C.SNAP_DISTANCE || (upper.dummy && lower.dummy)) {
          return;
        }
        if (!lower.dummy && lower.up.length === 1 && fits(lower, upper.x)) {
          lower.x = upper.x;
        } else if (!upper.dummy && upper.down.length === 1 && fits(upper, lower.x)) {
          upper.x = lower.x;
        } else if (!lower.dummy && fits(lower, upper.x)) {
          lower.x = upper.x;
        }
      });
    });
  });

  for (let pass = 0; pass < 2; pass++) {
    layers.forEach((layer) => {
      layer.forEach((upper) => {
        if (upper.dummy || upper.down.length !== 1) {
          return;
        }
        const lower = upper.down[0];
        if (lower.dummy || lower.up.length !== 1 || Math.abs(upper.x - lower.x) < 0.5) {
          return;
        }
        if (fits(lower, upper.x) && lower.down.length <= 1) {
          lower.x = upper.x;
        } else if (fits(upper, lower.x) && upper.up.length === 0) {
          upper.x = lower.x;
        }
      });
    });
  }
}

/**
 * Least squares placement that keeps the order and the minimum separation:
 * with offsets o_i for the separations the positions minus offsets must be non
 * decreasing, which is a weighted isotonic regression solved by pool adjacent
 * violators.
 */
function placeInOrder(layer, desired, weights) {
  if (!layer.length) {
    return;
  }
  const offsets = [0];
  for (let i = 1; i < layer.length; i++) {
    offsets.push(offsets[i - 1] + separation(layer[i - 1], layer[i]));
  }
  const blocks = [];
  layer.forEach((node, i) => {
    blocks.push({ value: desired[i] - offsets[i], weight: weights ? weights[i] : 1, count: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value) {
      const last = blocks.pop();
      const previous = blocks.pop();
      const weight = previous.weight + last.weight;
      blocks.push({
        value: (previous.value * previous.weight + last.value * last.weight) / weight,
        weight,
        count: previous.count + last.count
      });
    }
  });
  let i = 0;
  blocks.forEach((block) => {
    for (let n = 0; n < block.count; n++, i++) {
      layer[i].x = block.value + offsets[i];
    }
  });
}

// --- Usage planning (needs x positions, feeds the gap heights) --------------

function planUsages(model, graph) {
  const plan = [];
  model.usages.forEach((usage) => {
    const sourceId = refId(usage.sourceRef);
    const targetId = refId(usage.targetRef);
    const operator = graph.nodeById.get(sourceId) || graph.nodeById.get(targetId);
    if (!operator) {
      return;
    }
    const resourceId = operator.id === sourceId ? targetId : sourceId;
    // Only elements block a usage, crossing another line is acceptable.
    const others = graph.layers[operator.level].filter((node) => !node.dummy && node !== operator);
    plan.push({
      usage,
      operator,
      resourceId,
      reversed: operator.id !== sourceId,
      rightFree: !others.some((node) => node.x > operator.x),
      leftFree: !others.some((node) => node.x < operator.x)
    });
  });

  // TechnicalResources go to the right of the SystemLimit, to the left only if
  // their operators are blocked on the right but free on the left.
  const sideOf = new Map();
  model.resources.forEach((resource) => {
    const items = plan.filter((item) => item.resourceId === resource.id);
    const left = items.filter((item) => !item.rightFree && item.leftFree).length;
    const right = items.filter((item) => item.rightFree).length;
    sideOf.set(resource.id, left > right ? 'left' : 'right');
  });
  plan.forEach((item) => {
    item.side = sideOf.get(item.resourceId) || 'right';
    item.blocked = item.side === 'right' ? !item.rightFree : !item.leftFree;
  });
  return plan;
}

// --- Vertical coordinates ------------------------------------------------------

function gapKey(level) {
  return String(level);
}

function assignY(graph, usagePlan) {
  const { layers, lastLevel } = graph;

  // Horizontal tracks per gap between level k and k+1: one per source of a
  // bending segment, so all flows leaving one element share their bend (the
  // usual FPB fork), one per back edge end, one per blocked usage.
  const tracks = new Map();
  const addTrack = (level, key, x, upX, downX) => {
    const id = gapKey(level);
    if (!tracks.has(id)) {
      tracks.set(id, []);
    }
    let item = tracks.get(id).find((candidate) => candidate.key === key);
    if (!item) {
      item = { key, x, up: [], down: [] };
      tracks.get(id).push(item);
    }
    item.x = Math.min(item.x, x);
    if (upX !== undefined) {
      item.up.push(upX);
    }
    if (downX !== undefined) {
      item.down.push(downX);
    }
  };

  graph.chains.forEach(({ flow, chain }) => {
    const straightAlternative = flow.$type === 'fpb:AlternativeFlow' && chain.length === 2;
    if (straightAlternative) {
      return;
    }
    for (let i = 0; i < chain.length - 1; i++) {
      if (segmentBends(chain, i)) {
        addTrack(chain[i].level, trackKey(chain, i), chain[i].x, chain[i].x, chain[i + 1].x);
      }
    }
  });
  graph.back.forEach(({ flow, source, target }) => {
    addTrack(source.level, `back:${flow.id}`, source.x, source.x, undefined);
    addTrack(target.level - 1, `back:${flow.id}`, target.x, undefined, target.x);
  });
  usagePlan.filter((item) => item.blocked).forEach((item) => {
    addTrack(item.operator.level, `usage:${item.usage.id}`, item.operator.x, item.operator.x, undefined);
  });

  tracks.forEach((items, id) => tracks.set(id, orderTracks(items)));

  const levelHeight = layers.map((layer) => layer.reduce((max, node) => Math.max(max, node.height), 0));
  // Labels of states are drawn above the symbol, keep the tracks clear of them.
  const labelReserve = (k) => (layers[k + 1] && layers[k + 1].some((node) => node.kind === 'state')
    ? C.STATE_LABEL_HEIGHT : 0);
  const gapHeight = (k) => {
    const count = (tracks.get(gapKey(k)) || []).length;
    return C.LEVEL_GAP + Math.max(0, count - 1) * C.TRACK_SPACING + labelReserve(k);
  };

  const top = [];
  const bottom = [];
  let y = 0;
  for (let k = 0; k <= lastLevel; k++) {
    top[k] = y;
    bottom[k] = y + levelHeight[k];
    if (k < lastLevel) {
      y = bottom[k] + gapHeight(k);
    }
  }
  graph.levelTop = top;
  graph.levelBottom = bottom;
  graph.levelHeight = levelHeight;

  graph.nodes.forEach((node) => {
    node.cy = top[node.level] + levelHeight[node.level] / 2;
  });

  const trackY = new Map();
  tracks.forEach((items, id) => {
    const k = Number(id);
    items.forEach(({ key }, index) => {
      let value;
      if (k < 0) {
        value = top[0] - C.OUTSIDE_TRACK_OFFSET - index * C.TRACK_SPACING;
      } else if (k >= lastLevel) {
        value = bottom[lastLevel] + C.OUTSIDE_TRACK_OFFSET + index * C.TRACK_SPACING;
      } else {
        const span = (items.length - 1) * C.TRACK_SPACING;
        value = bottom[k] + (gapHeight(k) - labelReserve(k) - span) / 2 + index * C.TRACK_SPACING;
      }
      trackY.set(`${id}|${key}`, value);
    });
  });
  graph.trackY = trackY;
}

/**
 * Orders the tracks of one gap from top to bottom. Base order is the x of the
 * element a track starts at. A track with a line coming down at x has to lie
 * above a track with a line leaving downwards at the same x, otherwise the two
 * vertical pieces overlap and the flows cannot be told apart.
 */
function orderTracks(items) {
  const base = items.slice().sort((a, b) => (a.x - b.x) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const same = (a, b) => Math.abs(a - b) < 1;
  const above = new Map(base.map((item) => [item, new Set()]));
  base.forEach((a) => {
    base.forEach((b) => {
      if (a !== b && a.up.some((x) => b.down.some((y) => same(x, y)))) {
        above.get(b).add(a);
      }
    });
  });
  const result = [];
  const placed = new Set();
  while (result.length < base.length) {
    const next = base.find((item) => !placed.has(item) && [...above.get(item)].every((other) => placed.has(other)))
      || base.find((item) => !placed.has(item));
    result.push(next);
    placed.add(next);
  }
  return result;
}

/**
 * Whether segment i of a flow chain needs a horizontal piece. Ends that are
 * only a few pixels apart dock off center on the element instead.
 */
function segmentBends(chain, i) {
  return Math.abs(chain[i].x - chain[i + 1].x) > 0.5 && snapEnd(chain, i) === null;
}

/**
 * For a segment whose ends are a few pixels apart: the end that docks off
 * center ('target' or 'source'), or null if the segment bends. Only an end
 * without other lines forking or joining there may dock off center, otherwise
 * two almost parallel lines would be drawn.
 */
function snapEnd(chain, i) {
  const from = chain[i];
  const to = chain[i + 1];
  const dx = Math.abs(from.x - to.x);
  const snapsAt = (node) => !node.dummy && dx <= Math.min(C.SNAP_DISTANCE, node.width / 2 - C.SNAP_INSET);
  if (i === chain.length - 2 && snapsAt(to) && to.up.length === 1) {
    return 'target';
  }
  if (i === 0 && snapsAt(from) && from.down.length === 1) {
    return 'source';
  }
  return null;
}

/**
 * Track of a bending segment: flows leaving one element share a bend (fork),
 * flows joining into one element share a bend (join), as in hand drawn FPBs.
 */
function trackKey(chain, i) {
  const from = chain[i];
  const to = chain[i + 1];
  if (from.down.length <= 1 && to.up.length > 1) {
    return `in:${to.id}`;
  }
  return `node:${from.id}`;
}

function shiftTracks(trackY, dy) {
  const shifted = new Map();
  trackY.forEach((value, key) => shifted.set(key, value + dy));
  return shifted;
}

function track(graph, level, key) {
  return graph.trackY.get(`${gapKey(level)}|${key}`);
}

function systemLimitBounds(graph) {
  const { layers, lastLevel } = graph;
  let minLeft = Infinity;
  let maxRight = -Infinity;
  graph.nodes.forEach((node) => {
    const half = node.dummy ? 0 : node.width / 2;
    const labelRoom = node.kind === 'state' ? C.STATE_LABEL_ROOM : 0;
    minLeft = Math.min(minLeft, node.x - half - labelRoom);
    maxRight = Math.max(maxRight, node.x + half);
  });
  if (!isFinite(minLeft)) {
    minLeft = 0;
    maxRight = 0;
  }

  const channels = graph.back.length;
  const left = minLeft - C.MARGIN_LEFT;
  let right = maxRight + C.MARGIN_RIGHT + channels * C.CHANNEL_SPACING;
  // The SystemLimit name is drawn right aligned at the top edge, where the
  // input states sit. Keep the rightmost input state clear of it.
  const nameWidth = graph.systemLimitName ? Math.min(C.NAME_MAX_WIDTH, graph.systemLimitName.length * C.NAME_CHAR_WIDTH) + C.NODE_GAP / 2 : 0;
  layers[0].forEach((node) => {
    right = Math.max(right, node.x + node.width / 2 + nameWidth);
  });
  graph.channelX = graph.back.map((item, index) => maxRight + C.MARGIN_RIGHT / 2 + index * C.CHANNEL_SPACING);
  if (right - left < C.MIN_SYSTEM_LIMIT_WIDTH) {
    right = left + C.MIN_SYSTEM_LIMIT_WIDTH;
  }

  const topY = layers[0].length
    ? graph.levelTop[0] + graph.levelHeight[0] / 2
    : graph.levelTop[0] - C.MARGIN_EMPTY_LEVEL;
  const bottomY = layers[lastLevel].length
    ? graph.levelTop[lastLevel] + graph.levelHeight[lastLevel] / 2
    : graph.levelTop[lastLevel] + C.MARGIN_EMPTY_LEVEL;

  return { x: left, y: topY, width: right - left, height: Math.max(bottomY - topY, 2 * C.MARGIN_EMPTY_LEVEL) };
}

// --- Routing -------------------------------------------------------------------

function routeFlows(graph, connections) {
  graph.chains.forEach(({ flow, chain }) => {
    const source = chain[0];
    const target = chain[chain.length - 1];
    const start = { x: source.x, y: source.cy + source.height / 2 };
    const end = { x: target.x, y: target.cy - target.height / 2 };

    if (flow.$type === 'fpb:AlternativeFlow' && chain.length === 2) {
      connections.set(flow.id, [start, end]);
      return;
    }

    const points = [start];
    let x = start.x;
    for (let i = 0; i < chain.length - 1; i++) {
      const to = chain[i + 1];
      if (segmentBends(chain, i)) {
        const y = track(graph, chain[i].level, trackKey(chain, i));
        points.push({ x, y }, { x: to.x, y });
        x = to.x;
      } else if (Math.abs(x - to.x) > 0.5 && snapEnd(chain, i) === 'source') {
        // Leave the source a little off center, the line arrives straight.
        start.x = to.x;
        x = to.x;
      }
    }
    // Snapped at the target (or straight): dock where the line arrives.
    end.x = x;
    points.push(end);
    connections.set(flow.id, simplify(points));
  });

  graph.back.forEach(({ flow, source, target }, index) => {
    const channel = graph.channelX[index];
    const below = track(graph, source.level, `back:${flow.id}`);
    const above = track(graph, target.level - 1, `back:${flow.id}`);
    connections.set(flow.id, simplify([
      { x: source.x, y: source.cy + source.height / 2 },
      { x: source.x, y: below },
      { x: channel, y: below },
      { x: channel, y: above },
      { x: target.x, y: above },
      { x: target.x, y: target.cy - target.height / 2 }
    ]));
  });
}

function simplify(points) {
  const result = [];
  points.forEach((point) => {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.01 && Math.abs(last.y - point.y) < 0.01) {
      return;
    }
    result.push({ x: point.x, y: point.y });
  });
  for (let i = result.length - 2; i > 0; i--) {
    const a = result[i - 1];
    const b = result[i];
    const c = result[i + 1];
    const vertical = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01;
    const horizontal = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
    if (vertical || horizontal) {
      result.splice(i, 1);
    }
  }
  return result;
}

// --- TechnicalResources ------------------------------------------------------

function placeResources(model, graph, bounds, usagePlan, shapes, connections) {
  if (!model.resources.length) {
    return;
  }
  const systemLeft = bounds.x;
  const systemRight = bounds.x + bounds.width;
  const usagesOn = (side) => usagePlan.filter((item) => item.side === side);
  const columnX = {
    right: systemRight + C.RESOURCE_OFFSET + usagesOn('right').length * C.CHANNEL_SPACING,
    left: systemLeft - C.RESOURCE_OFFSET - usagesOn('left').length * C.CHANNEL_SPACING - C.RESOURCE_SIZE.width
  };

  const entries = model.resources.map((resource, index) => {
    const items = usagePlan.filter((item) => item.resourceId === resource.id);
    const cy = items.length
      ? items.reduce((sum, item) => sum + item.operator.cy, 0) / items.length
      : null;
    return { resource, index, cy, side: items.length ? items[0].side : 'right' };
  });
  let fallback = bounds.y;
  entries.forEach((entry) => {
    if (entry.cy === null) {
      entry.cy = fallback + C.RESOURCE_SIZE.height / 2;
    }
    fallback = Math.max(fallback, entry.cy + C.RESOURCE_SIZE.height);
  });

  const resourceCenter = new Map();
  ['right', 'left'].forEach((side) => {
    const column = entries.filter((entry) => entry.side === side)
      .sort((a, b) => (a.cy - b.cy) || (a.index - b.index));
    const centers = placeVertically(column, column.map((entry) => entry.cy));
    column.forEach((entry, i) => {
      resourceCenter.set(entry.resource.id, centers[i]);
      shapes.set(entry.resource.id, {
        x: columnX[side],
        y: centers[i] - C.RESOURCE_SIZE.height / 2,
        width: C.RESOURCE_SIZE.width,
        height: C.RESOURCE_SIZE.height
      });
    });
  });

  ['right', 'left'].forEach((side) => {
    const sign = side === 'right' ? 1 : -1;
    const systemEdge = side === 'right' ? systemRight : systemLeft;
    const resourceEdge = side === 'right' ? columnX.right : columnX.left + C.RESOURCE_SIZE.width;
    // Nested spans do not cross when the shortest runs innermost.
    const span = (item) => {
      const resourceY = resourceCenter.get(item.resourceId);
      return resourceY === undefined ? 0 : Math.abs(resourceY - item.operator.cy);
    };
    const ordered = usagesOn(side)
      .map((item, index) => ({ item, index }))
      .sort((a, b) => (span(a.item) - span(b.item)) || (a.index - b.index))
      .map((entry) => entry.item);
    let channelIndex = 0;
    ordered.forEach((item) => {
      const { operator, usage } = item;
      const resourceY = resourceCenter.get(item.resourceId);
      if (resourceY === undefined) {
        return;
      }
      const straight = !item.blocked && Math.abs(resourceY - operator.cy) < 0.5;
      const channel = systemEdge + sign * (C.RESOURCE_OFFSET / 2 + (straight ? 0 : channelIndex++) * C.CHANNEL_SPACING);
      const startX = operator.x + sign * operator.width / 2;
      let points;
      if (!item.blocked) {
        points = [
          { x: startX, y: operator.cy },
          { x: channel, y: operator.cy },
          { x: channel, y: resourceY },
          { x: resourceEdge, y: resourceY }
        ];
      } else {
        // Leave the operator sideways into the free space next to it, then run
        // below the level to the channel.
        const layer = graph.layers[operator.level];
        const neighbors = layer.filter((node) => !node.dummy && sign * (node.x - operator.x) > 0)
          .map((node) => node.x - sign * (node.width / 2 + (sign > 0 && node.kind === 'state' ? C.STATE_LABEL_ROOM : 0)));
        const nearest = neighbors.length
          ? (sign > 0 ? Math.min(...neighbors) : Math.max(...neighbors))
          : startX + sign * C.NODE_GAP;
        const detourX = sign > 0
          ? Math.min(startX + C.NODE_GAP / 2, (startX + nearest) / 2)
          : Math.max(startX - C.NODE_GAP / 2, (startX + nearest) / 2);
        const trackValue = track(graph, operator.level, `usage:${usage.id}`);
        points = [
          { x: startX, y: operator.cy },
          { x: detourX, y: operator.cy },
          { x: detourX, y: trackValue },
          { x: channel, y: trackValue },
          { x: channel, y: resourceY },
          { x: resourceEdge, y: resourceY }
        ];
      }
      points = simplify(points);
      connections.set(usage.id, item.reversed ? points.reverse() : points);
    });
  });
}

function placeVertically(column, desired) {
  const offsets = [0];
  for (let i = 1; i < column.length; i++) {
    offsets.push(offsets[i - 1] + C.RESOURCE_SIZE.height + C.RESOURCE_GAP);
  }
  const blocks = [];
  desired.forEach((value, i) => {
    blocks.push({ value: value - offsets[i], weight: 1, count: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value) {
      const last = blocks.pop();
      const previous = blocks.pop();
      const weight = previous.weight + last.weight;
      blocks.push({
        value: (previous.value * previous.weight + last.value * last.weight) / weight,
        weight,
        count: previous.count + last.count
      });
    }
  });
  const result = [];
  blocks.forEach((block) => {
    for (let n = 0; n < block.count; n++) {
      result.push(block.value + offsets[result.length]);
    }
  });
  return result;
}

function placeResourcesWithoutSystemLimit(model, shapes) {
  model.resources.forEach((resource, index) => {
    shapes.set(resource.id, {
      x: C.ORIGIN_X + index * (C.RESOURCE_SIZE.width + C.NODE_GAP),
      y: C.ORIGIN_Y,
      width: C.RESOURCE_SIZE.width,
      height: C.RESOURCE_SIZE.height
    });
  });
}

// ---------------------------------------------------------------------------
// Incremental placement (existing visual information is kept)
// ---------------------------------------------------------------------------

function boxOf(model, id) {
  const visual = model.visual.get(id);
  return hasShapeVisual(visual) ? { x: visual.x, y: visual.y, width: visual.width, height: visual.height } : null;
}

function overlaps(a, b, margin) {
  return a.x < b.x + b.width + margin && b.x < a.x + a.width + margin
    && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;
}

function placeMissingShapes(model, missingIds, boundaryOrder) {
  const missing = new Set(missingIds);
  const moved = new Set();
  const systemLimit = boxOf(model, model.systemLimit.id);
  const graph = buildGraph(model, boundaryOrder);
  const placedBoxes = () => model.shapeIds
    .filter((id) => id !== model.systemLimit.id && !missing.has(id))
    .map((id) => ({ id, box: boxOf(model, id) }))
    .filter((item) => item.box);
  const labelRoomOf = (item) => (isState(item) ? C.STATE_LABEL_ROOM : 0);
  // Existing lines between placed elements: a new element must not cover them.
  const existingLines = [...model.flows, ...model.usages]
    .filter((connection) => !missing.has(refId(connection.sourceRef)) && !missing.has(refId(connection.targetRef)))
    .map((connection) => model.visual.get(connection.id))
    .filter(hasConnectionVisual)
    .map((visual) => visual.waypoints);
  // Room for the label left of a state counts as occupied, for the new
  // element and for the ones already there.
  const withLabelRoom = (box, room) => ({ x: box.x - room, y: box.y, width: box.width + room, height: box.height });
  const isFree = (box, labelRoom) => {
    const extended = withLabelRoom(box, labelRoom);
    const occupied = placedBoxes().some((other) => overlaps(extended, withLabelRoom(other.box, labelRoomOf(model.data.get(other.id))), 20));
    if (occupied) {
      return false;
    }
    const padded = { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 };
    return !existingLines.some((points) => points.slice(0, -1)
      .some((point, i) => segmentIntersectsBox(point, points[i + 1], padded)));
  };

  const place = (id, box) => {
    const item = model.data.get(id);
    setVisual(model, id, { id, type: item.$type, x: round(box.x), y: round(box.y), width: box.width, height: box.height });
    missing.delete(id);
  };
  const shift = (id, dx, dy = 0) => {
    const visual = model.visual.get(id);
    visual.x = round(visual.x + dx);
    visual.y = round(visual.y + dy);
    moved.add(id);
  };
  // Growing downwards keeps the output states on the lower edge and moves
  // whatever lies below the SystemLimit along.
  const growDown = (bottom) => {
    const oldBottom = systemLimit.y + systemLimit.height;
    if (bottom <= oldBottom) {
      return;
    }
    const dy = bottom - oldBottom;
    model.shapeIds.forEach((id) => {
      if (id === model.systemLimit.id || missing.has(id)) {
        return;
      }
      const box = boxOf(model, id);
      if (!box) {
        return;
      }
      const onLowerEdge = isState(model.data.get(id))
        && Math.abs(box.y + box.height / 2 - oldBottom) <= C.BORDER_TOLERANCE;
      if (onLowerEdge || box.y >= oldBottom - 1) {
        shift(id, 0, dy);
      }
    });
    systemLimit.height = bottom - systemLimit.y;
    model.visual.get(model.systemLimit.id).height = round(systemLimit.height);
  };
  // Growing the SystemLimit to the right pushes the TechnicalResources beside
  // it along, so it never grows over them.
  const growRight = (right) => {
    const oldRight = systemLimit.x + systemLimit.width;
    if (right <= oldRight) {
      return;
    }
    const dx = right - oldRight;
    model.resources.forEach((resource) => {
      const box = !missing.has(resource.id) && boxOf(model, resource.id);
      if (box && box.x >= oldRight - 1) {
        shift(resource.id, dx);
      }
    });
    systemLimit.width = right - systemLimit.x;
    model.visual.get(model.systemLimit.id).width = round(systemLimit.width);
  };
  // Candidate x positions inside [from, to], nearest to the preferred x first.
  const candidatesX = (from, to, preferred) => {
    const list = [];
    for (let x = from; x <= to; x += 10) {
      list.push(x);
    }
    return list.sort((p, q) => (Math.abs(p - preferred) - Math.abs(q - preferred)) || (p - q));
  };
  const connectedCenterX = (id) => {
    const ends = model.flows
      .filter((flow) => refId(flow.sourceRef) === id || refId(flow.targetRef) === id)
      .map((flow) => boxOf(model, refId(flow.sourceRef) === id ? refId(flow.targetRef) : refId(flow.sourceRef)))
      .filter(Boolean);
    return ends.length ? ends.reduce((sum, box) => sum + box.x + box.width / 2, 0) / ends.length : null;
  };
  const nameWidth = typeof model.systemLimit.name === 'string' && model.systemLimit.name.trim()
    ? Math.min(C.NAME_MAX_WIDTH, model.systemLimit.name.trim().length * C.NAME_CHAR_WIDTH) + C.NODE_GAP / 2
    : 0;

  // Boundary states: a free place on their edge, otherwise right of the outermost state there.
  graph.nodes.filter((node) => !node.dummy && node.boundary && missing.has(node.id)).forEach((node) => {
    const item = model.data.get(node.id);
    const edge = node.boundary === 'input' ? 'top' : 'bottom';
    const edgeY = edge === 'top' ? systemLimit.y : systemLimit.y + systemLimit.height;
    const y = edgeY - node.height / 2;
    const labelRoom = labelRoomOf(item);
    const from = systemLimit.x + C.MARGIN_LEFT + labelRoom;
    const to = systemLimit.x + systemLimit.width - C.MARGIN_RIGHT - node.width - (edge === 'top' ? nameWidth : 0);
    const center = connectedCenterX(node.id);
    const preferred = center === null ? from : center - node.width / 2;
    let x = candidatesX(from, to, preferred)
      .find((candidate) => isFree({ x: candidate, y, width: node.width, height: node.height }, labelRoom));
    if (x === undefined) {
      const right = placedBoxes()
        .filter((other) => Math.abs(other.box.y + other.box.height / 2 - edgeY) <= C.BORDER_TOLERANCE)
        .reduce((max, other) => Math.max(max, other.box.x + other.box.width), systemLimit.x);
      x = right + C.NODE_GAP + labelRoom;
      while (!isFree({ x, y, width: node.width, height: node.height }, labelRoom)) {
        x += 10;
      }
      growRight(x + node.width + C.MARGIN_RIGHT + (edge === 'top' ? nameWidth : 0));
    }
    place(node.id, { x, y, width: node.width, height: node.height });
  });

  // Interior elements in level order: below their placed predecessors, at a
  // free place inside the SystemLimit, otherwise in a new column on the right.
  graph.nodes.filter((node) => !node.dummy && !node.boundary && missing.has(node.id))
    .sort((a, b) => (a.level - b.level) || (a.order - b.order))
    .forEach((node) => {
      const item = model.data.get(node.id);
      const predecessors = model.flows.filter((flow) => refId(flow.targetRef) === node.id)
        .map((flow) => boxOf(model, refId(flow.sourceRef))).filter(Boolean);
      const successors = model.flows.filter((flow) => refId(flow.sourceRef) === node.id)
        .map((flow) => boxOf(model, refId(flow.targetRef))).filter(Boolean);
      let y;
      if (predecessors.length) {
        y = Math.max(...predecessors.map((box) => box.y + box.height)) + C.LEVEL_GAP;
      } else if (successors.length) {
        y = Math.min(...successors.map((box) => box.y)) - C.LEVEL_GAP - node.height;
      } else {
        y = systemLimit.y + C.LEVEL_GAP + C.BORDER_TOLERANCE;
      }
      const minY = systemLimit.y + C.BORDER_TOLERANCE + C.STATE_SIZE.height / 2 + 10;
      y = Math.max(minY, y);
      // Keep a level gap (and room for labels) above the output states.
      growDown(y + node.height + C.LEVEL_GAP + C.STATE_LABEL_HEIGHT + C.STATE_SIZE.height / 2);

      const labelRoom = labelRoomOf(item);
      const from = systemLimit.x + C.MARGIN_LEFT + labelRoom;
      const to = systemLimit.x + systemLimit.width - C.MARGIN_RIGHT - node.width;
      const center = connectedCenterX(node.id);
      const preferred = center === null ? from : center - node.width / 2;
      let x = candidatesX(from, to, preferred)
        .find((candidate) => isFree({ x: candidate, y, width: node.width, height: node.height }, labelRoom));
      if (x === undefined) {
        x = placedBoxes()
          .filter((other) => model.nodes.some((n) => n.id === other.id))
          .reduce((max, other) => Math.max(max, other.box.x + other.box.width), systemLimit.x) + C.NODE_GAP + labelRoom;
        while (!isFree({ x, y, width: node.width, height: node.height }, labelRoom)) {
          x += 10;
        }
        growRight(x + node.width + C.MARGIN_RIGHT);
      }
      place(node.id, { x, y, width: node.width, height: node.height });
    });

  // TechnicalResources right of the SystemLimit at the height of their operator.
  model.resources.filter((resource) => missing.has(resource.id)).forEach((resource) => {
    const operatorBoxes = model.usages
      .filter((usage) => refId(usage.sourceRef) === resource.id || refId(usage.targetRef) === resource.id)
      .map((usage) => boxOf(model, refId(usage.sourceRef) === resource.id ? refId(usage.targetRef) : refId(usage.sourceRef)))
      .filter(Boolean);
    const cy = operatorBoxes.length
      ? operatorBoxes.reduce((sum, box) => sum + box.y + box.height / 2, 0) / operatorBoxes.length
      : systemLimit.y + C.RESOURCE_SIZE.height / 2;
    const candidate = {
      x: systemLimit.x + systemLimit.width + C.RESOURCE_OFFSET,
      y: cy - C.RESOURCE_SIZE.height / 2,
      width: C.RESOURCE_SIZE.width,
      height: C.RESOURCE_SIZE.height
    };
    let guard = 0;
    while (!isFree(candidate, 0) && guard++ < 500) {
      candidate.y += C.RESOURCE_SIZE.height + C.RESOURCE_GAP;
    }
    place(resource.id, candidate);
  });

  return moved;
}

/**
 * Routes a single connection between placed shapes the way FpbLayouter draws
 * new connections (vertical flows with bends, straight alternative flows,
 * horizontal usages). Tries several bend positions and takes the first route
 * that does not run through another element.
 */
function simpleRoute(model, connection) {
  const sourceId = refId(connection.sourceRef);
  const targetId = refId(connection.targetRef);
  const source = boxOf(model, sourceId);
  const target = boxOf(model, targetId);
  if (!source || !target) {
    return [];
  }
  const obstacles = model.shapeIds
    .filter((id) => id !== sourceId && id !== targetId && (!model.systemLimit || id !== model.systemLimit.id))
    .map((id) => boxOf(model, id))
    .filter(Boolean);
  // Lines of connections without a common end must not be covered or run
  // closely alongside; forks and joins may share their lines.
  const lines = [...model.flows, ...model.usages]
    .filter((other) => other !== connection
      && refId(other.sourceRef) !== sourceId && refId(other.targetRef) !== targetId
      && refId(other.sourceRef) !== targetId && refId(other.targetRef) !== sourceId)
    .map((other) => model.visual.get(other.id))
    .filter(hasConnectionVisual)
    .map((visual) => visual.waypoints);
  const candidates = connection.$type === 'fpb:Usage'
    ? usageCandidates(source, target)
    : flowCandidates(source, target, obstacles, connection.$type === 'fpb:AlternativeFlow');
  const free = candidates.find((points) => !routeHits(points, obstacles) && !routeCrowds(points, lines))
    || candidates.find((points) => !routeHits(points, obstacles))
    || candidates[0];
  return simplify(free).map((point) => ({ x: round(point.x), y: round(point.y) }));
}

/**
 * True if a horizontal or vertical piece of the route lies on, or closer than
 * a track spacing next to, a parallel piece of another line.
 */
function routeCrowds(points, lines) {
  const pieces = (list) => list.slice(0, -1).map((point, i) => [point, list[i + 1]]);
  const own = pieces(simplify(points));
  const others = [];
  lines.forEach((line) => others.push(...pieces(line)));
  return own.some(([a, b]) => others.some(([c, d]) => {
    const vertical = Math.abs(a.x - b.x) < 0.5 && Math.abs(c.x - d.x) < 0.5;
    const horizontal = Math.abs(a.y - b.y) < 0.5 && Math.abs(c.y - d.y) < 0.5;
    if (vertical) {
      const overlap = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
      return overlap > 2 && Math.abs(a.x - c.x) < C.TRACK_SPACING / 2 + 1;
    }
    if (horizontal) {
      const overlap = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
      return overlap > 2 && Math.abs(a.y - c.y) < C.TRACK_SPACING / 2 + 1;
    }
    return false;
  }));
}

function flowCandidates(source, target, obstacles, alternative) {
  const start = { x: source.x + source.width / 2, y: source.y + source.height };
  const end = { x: target.x + target.width / 2, y: target.y };
  const candidates = [];
  if (alternative || Math.abs(start.x - end.x) < 0.5) {
    candidates.push([start, end]);
  }
  const bend = C.TRACK_SPACING + 5;
  if (end.y - start.y > 2 * bend) {
    const bends = [(start.y + end.y) / 2, start.y + bend, end.y - bend];
    for (let y = start.y + bend + C.TRACK_SPACING; y < end.y - bend; y += C.TRACK_SPACING) {
      bends.push(y);
    }
    bends.forEach((y) => {
      candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
    });
  }
  // Around obstacles: down, sideways into a lane, along it, back. Lanes right
  // beside an element come first (nearest to the direct line), the lanes
  // outside everything last.
  const all = [source, target, ...obstacles];
  const right = all.reduce((max, box) => Math.max(max, box.x + box.width), -Infinity) + C.NODE_GAP / 2;
  const left = all.reduce((min, box) => Math.min(min, box.x), Infinity) - C.NODE_GAP / 2;
  const middle = (start.x + end.x) / 2;
  const nearLanes = [];
  obstacles.forEach((box) => {
    if (box.y + box.height > start.y && box.y < end.y) {
      nearLanes.push(box.x - C.NODE_GAP / 3, box.x + box.width + C.NODE_GAP / 3);
    }
  });
  nearLanes.sort((a, b) => (Math.abs(a - middle) - Math.abs(b - middle)) || (a - b));
  [...nearLanes, right, left].forEach((lane) => {
    candidates.push([
      start,
      { x: start.x, y: start.y + bend },
      { x: lane, y: start.y + bend },
      { x: lane, y: end.y - bend },
      { x: end.x, y: end.y - bend },
      end
    ]);
  });
  return candidates;
}

function usageCandidates(source, target) {
  const sourceMid = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetMid = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const toRight = sourceMid.x <= targetMid.x;
  const start = { x: toRight ? source.x + source.width : source.x, y: sourceMid.y };
  const end = { x: toRight ? target.x : target.x + target.width, y: targetMid.y };
  const step = toRight ? C.TRACK_SPACING + 5 : -(C.TRACK_SPACING + 5);
  return [(start.x + end.x) / 2, end.x - step, start.x + step].map((x) => [
    start, { x, y: start.y }, { x, y: end.y }, end
  ]);
}

function routeHits(points, obstacles) {
  for (let i = 0; i < points.length - 1; i++) {
    if (obstacles.some((box) => segmentIntersectsBox(points[i], points[i + 1], box))) {
      return true;
    }
  }
  return false;
}

/**
 * Liang-Barsky clipping against the box shrunk by one pixel, so a segment that
 * only touches an edge does not count.
 */
function segmentIntersectsBox(p, q, box) {
  const minX = box.x + 1;
  const maxX = box.x + box.width - 1;
  const minY = box.y + 1;
  const maxY = box.y + box.height - 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (pValue, qValue) => {
    if (pValue === 0) {
      return qValue >= 0;
    }
    const t = qValue / pValue;
    if (pValue < 0) {
      if (t > t1) {
        return false;
      }
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) {
        return false;
      }
      t1 = Math.min(t1, t);
    }
    return true;
  };
  return clip(-dx, p.x - minX) && clip(dx, maxX - p.x) && clip(-dy, p.y - minY) && clip(dy, maxY - p.y) && t0 <= t1;
}
