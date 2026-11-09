// tests/fixtures/generate/largeModel.js

/**
 * Valid FPB.js models of any size for the performance budget (032a V9), in
 * the format of the JSON download, with layout.
 *
 * Each layer is one chain inside its system limit: an input state on the top
 * border, operators and states in turn, an output state on the bottom border.
 * The first operator of every layer but the last is decomposed into the next
 * layer, whose border states are the operator's input and output states (same
 * ids, as FPB.js copies them). `perLayer` counts states and operators; an even
 * number is rounded down to the next odd one (a chain has one state more than
 * operators). The ids are fixed, so the same size gives the same model.
 *
 * @param {{ layers: number, perLayer: number }} size
 * @return {Array} [project, ...process entries]
 */
export function generateLargeModel({ layers, perLayer }) {
  let counter = 0;
  const nextId = () => '00000000-0000-4000-8000-' + String(++counter).padStart(12, '0');

  const operators = Math.max(1, Math.floor((perLayer - 1) / 2));
  const rootId = nextId();
  const project = {
    $type: 'fpb:Project',
    name: 'Large model',
    targetNamespace: 'http://www.hsu-ifa.de/fpbjs',
    entryPoint: rootId
  };

  const entries = [];
  let processId = rootId;
  let parentId = null;
  let decomposed = null;
  let input = { id: nextId(), name: 'Input' };
  let output = null;

  for (let layer = 1; layer <= layers; layer++) {
    const built = buildLayer({
      layer, operators, nextId, processId, input,
      output: output || { id: nextId(), name: 'Output' },
      decomposeFirst: layer < layers
    });
    built.entry.process.parent = parentId ? parentId : { ...project };
    built.entry.process.isDecomposedProcessOperator = decomposed;
    if (entries.length) {
      entries[entries.length - 1].process.consistsOfProcesses.push(processId);
    }
    entries.push(built.entry);

    // the next layer decomposes the first operator of this one
    parentId = processId;
    decomposed = built.first.id;
    processId = built.first.id;
    input = built.first.input;
    output = built.first.output;
  }
  return [project, ...entries];
}

const STATE = { width: 50, height: 50 };
const OPERATOR = { width: 150, height: 80 };
const COLUMNS = 10;
const CELL = { width: 200, height: 160 };
const LIMIT = { x: 100, y: 100 };

function identification(id, name) {
  return {
    $type: 'fpb:Identification',
    uniqueIdent: id,
    longName: '',
    shortName: name,
    versionNumber: '1.0',
    revisionNumber: '0'
  };
}

function shape(type, id, name) {
  return {
    $type: type,
    id,
    identification: identification(id, name),
    isAssignedTo: [],
    incoming: [],
    outgoing: [],
    name,
    characteristics: []
  };
}

function buildLayer({ layer, operators, nextId, processId, input, output, decomposeFirst }) {
  const systemLimitId = nextId();
  const data = [];
  const visual = [];
  const inner = [];
  const byId = new Map();
  const centers = new Map();

  const place = (item, box) => {
    data.push(item);
    byId.set(item.id, item);
    visual.push({ id: item.id, type: item.$type, ...box });
    centers.set(item.id, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    inner.push(item.id);
  };

  // the chain inside: operator, state, operator, ... operator
  const chain = [];
  for (let i = 1; i <= operators; i++) {
    chain.push({ kind: 'operator', id: nextId(), name: `Operator ${layer}.${i}` });
    if (i < operators) {
      chain.push({ kind: 'state', id: nextId(), name: `State ${layer}.${i}` });
    }
  }
  const rows = Math.ceil(chain.length / COLUMNS);
  const limitBox = { ...LIMIT, width: 60 + COLUMNS * CELL.width, height: 120 + rows * CELL.height };

  const inBox = { x: LIMIT.x + 60 + (OPERATOR.width - STATE.width) / 2, y: LIMIT.y - STATE.height / 2, ...STATE };
  place(shape('fpb:Product', input.id, input.name), inBox);

  chain.forEach((element, index) => {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const x = LIMIT.x + 60 + column * CELL.width;
    const y = LIMIT.y + 80 + row * CELL.height;
    if (element.kind === 'operator') {
      place(shape('fpb:ProcessOperator', element.id, element.name), { x, y, ...OPERATOR });
    } else {
      place(shape('fpb:Product', element.id, element.name), { x: x + (OPERATOR.width - STATE.width) / 2, y: y + 15, ...STATE });
    }
  });

  const last = centers.get(chain[chain.length - 1].id);
  const outBox = { x: last.x - STATE.width / 2, y: LIMIT.y + limitBox.height - STATE.height / 2, ...STATE };
  place(shape('fpb:Product', output.id, output.name), outBox);

  // flows along the chain: input, operator, state, ..., operator, output
  const order = [input.id, ...chain.map((element) => element.id), output.id];
  for (let i = 0; i < order.length - 1; i++) {
    const id = nextId();
    const source = byId.get(order[i]);
    const target = byId.get(order[i + 1]);
    data.push({ $type: 'fpb:Flow', id, sourceRef: source.id, targetRef: target.id });
    source.outgoing.push(id);
    target.incoming.push(id);
    [source, target].forEach((end, n) => {
      const other = n === 0 ? target : source;
      if (end.$type !== 'fpb:ProcessOperator' && !end.isAssignedTo.includes(other.id)) {
        end.isAssignedTo.push(other.id);
      }
    });
    visual.push({ id, type: 'fpb:Flow', waypoints: [centers.get(source.id), centers.get(target.id)] });
    inner.push(id);
  }

  const first = byId.get(chain[0].id);
  const firstOutput = byId.get(order[2]);
  if (decomposeFirst) {
    first.decomposedView = first.id;
  }

  const systemLimit = { $type: 'fpb:SystemLimit', id: systemLimitId, elementsContainer: inner, name: `System limit ${layer}` };
  visual.unshift({ id: systemLimitId, type: 'fpb:SystemLimit', ...limitBox });

  return {
    entry: {
      process: {
        $type: 'fpb:Process',
        id: processId,
        elementsContainer: [systemLimitId],
        isDecomposedProcessOperator: null,
        consistsOfStates: data.filter((item) => item.$type === 'fpb:Product').map((item) => item.id),
        consistsOfSystemLimit: systemLimitId,
        consistsOfProcesses: [],
        consistsOfProcessOperator: data.filter((item) => item.$type === 'fpb:ProcessOperator').map((item) => item.id),
        parent: null
      },
      elementDataInformation: [systemLimit, ...data],
      elementVisualInformation: visual
    },
    first: {
      id: first.id,
      input: { id: input.id, name: input.name },
      output: { id: firstOutput.id, name: firstOutput.name }
    }
  };
}
