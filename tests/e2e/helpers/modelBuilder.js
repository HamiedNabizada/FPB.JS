// tests/e2e/helpers/modelBuilder.js

/**
 * Builds FPB.JS exchange data (the JSON array the importer reads) in code, so
 * import and layout tests can describe the model they need in a few lines.
 *
 *   const m = new ModelBuilder('Projekt');
 *   const p = m.process('p1');
 *   const a = p.state('fpb:Product', 'A', { x: 100, y: 75 });
 *   const op = p.operator('Op', { x: 200, y: 200 });
 *   p.flow(a, op);
 *   const data = m.build();              // with visual information
 *   const bare = m.build({ layout: false }); // data only, as the data-only download
 *
 * Shapes without a position get none in the output; `build({ layout: false })`
 * drops all visual information, `build({ layout: 'shapes' })` keeps shapes but
 * drops connection waypoints.
 */

let counter = 0;
const nextId = (prefix) => `${prefix}-${String(++counter).padStart(4, '0')}-0000-4000-8000-000000000000`;

const SIZES = {
  state: { width: 50, height: 50 },
  operator: { width: 150, height: 80 },
  resource: { width: 150, height: 80 },
};

function identification(id, name) {
  return {
    $type: 'fpb:Identification',
    uniqueIdent: id,
    longName: '',
    shortName: name,
    versionNumber: '',
    revisionNumber: ''
  };
}

export class ProcessBuilder {

  constructor(id, systemLimitName, systemLimitBox) {
    this.id = id;
    this.systemLimitId = nextId('sl');
    this.systemLimitName = systemLimitName;
    this.systemLimitBox = systemLimitBox;
    this.inner = [];      // ids inside the SystemLimit
    this.outer = [];      // ids on process level
    this.data = new Map();
    this.visual = new Map();
    this.parent = null;
    this.decomposedOperator = null;
    this.children = [];
  }

  _shape(type, kind, name, box, where, id) {
    const elementId = id || nextId(kind);
    this.data.set(elementId, {
      $type: type,
      id: elementId,
      identification: identification(elementId, name),
      isAssignedTo: [],
      incoming: [],
      outgoing: [],
      name,
      characteristics: []
    });
    if (box) {
      this.visual.set(elementId, { id: elementId, type, ...SIZES[kind], ...box });
    }
    (where === 'outer' ? this.outer : this.inner).push(elementId);
    return elementId;
  }

  state(type, name, box, id) {
    return this._shape(type, 'state', name, box, 'inner', id);
  }

  product(name, box, id) {
    return this.state('fpb:Product', name, box, id);
  }

  operator(name, box, id) {
    return this._shape('fpb:ProcessOperator', 'operator', name, box, 'inner', id);
  }

  resource(name, box, id) {
    return this._shape('fpb:TechnicalResource', 'resource', name, box, 'outer', id);
  }

  _connect(type, source, target, waypoints, where) {
    const id = nextId(type === 'fpb:Usage' ? 'usage' : 'flow');
    const item = { $type: type, id, sourceRef: source, targetRef: target };
    if (type === 'fpb:ParallelFlow' || type === 'fpb:AlternativeFlow') {
      item.inTandemWith = [];
    }
    this.data.set(id, item);
    this.data.get(source).outgoing.push(id);
    this.data.get(target).incoming.push(id);
    (where === 'outer' ? this.outer : this.inner).push(id);
    this.visual.set(id, { id, type, waypoints: waypoints || this._straight(source, target) });
    return id;
  }

  _straight(source, target) {
    const mid = (id) => {
      const box = this.visual.get(id);
      return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: 0, y: 0 };
    };
    return [mid(source), mid(target)];
  }

  flow(source, target, type = 'fpb:Flow', waypoints) {
    const id = this._connect(type, source, target, waypoints, 'inner');
    const sourceData = this.data.get(source);
    const targetData = this.data.get(target);
    const assign = (a, b) => {
      if (/Product|Energy|Information/.test(a.$type) && !a.isAssignedTo.includes(b.id)) {
        a.isAssignedTo.push(b.id);
      }
    };
    assign(sourceData, targetData);
    assign(targetData, sourceData);
    return id;
  }

  /** Several flows of one type from one source; they form a tandem group. */
  branch(source, targets, type) {
    const ids = targets.map((target) => this.flow(source, target, type));
    ids.forEach((id) => {
      this.data.get(id).inTandemWith = ids.filter((other) => other !== id);
    });
    return ids;
  }

  usage(operator, resource, waypoints) {
    const id = this._connect('fpb:Usage', operator, resource, waypoints, 'outer');
    this.data.get(operator).isAssignedTo.push(resource);
    this.data.get(resource).isAssignedTo.push(operator);
    return id;
  }

  characteristic(elementId, props = {}) {
    const n = this.data.get(elementId).characteristics.length + 1;
    this.data.get(elementId).characteristics.push({
      $type: 'fpbch:Characteristics',
      category: {
        $type: 'fpb:Identification',
        uniqueIdent: `${elementId}_c${n}`,
        longName: props.longName || 'Merkmal lang',
        shortName: props.shortName || `Merkmal${n}`,
        versionNumber: '1.0',
        revisionNumber: '0'
      },
      descriptiveElement: {
        $type: 'fpbch:DescriptiveElement',
        valueDeterminationProcess: 'Messung',
        representivity: 'Mittelwert',
        setpointValue: { $type: 'fpbch:ValueWithUnit', value: props.setpoint || '20', unit: props.unit || '°C' },
        validityLimits: props.validityLimits || [{ $type: 'fpbch:ValidityLimits', limitType: 'range', from: 10, to: 30 }],
        actualValues: props.actualValues !== undefined ? props.actualValues
          : [{ $type: 'fpbch:ValueWithUnit', value: '21', unit: '°C' }, { $type: 'fpbch:ValueWithUnit', value: '19', unit: '°C' }]
      },
      relationalElement: {
        $type: 'fpbch:RelationalElement',
        view: 'thermisch',
        model: 'Modell',
        regulationsForRelationalGeneration: 'DIN'
      }
    });
  }

  /** The data object of an element, to tweak it before build(). */
  item(id) {
    return this.data.get(id);
  }

  entry(options) {
    const layout = options.layout === undefined ? true : options.layout;
    const all = [...this.data.values()];
    const typeOf = (id) => this.data.get(id).$type;
    const process = {
      $type: 'fpb:Process',
      id: this.id,
      elementsContainer: [this.systemLimitId, ...this.outer],
      isDecomposedProcessOperator: this.decomposedOperator,
      consistsOfStates: this.inner.filter((id) => /Product|Energy|Information/.test(typeOf(id))),
      consistsOfSystemLimit: this.systemLimitId,
      consistsOfProcesses: this.children.slice(),
      consistsOfProcessOperator: this.inner.filter((id) => typeOf(id) === 'fpb:ProcessOperator'),
      parent: this.parent
    };
    const systemLimit = {
      $type: 'fpb:SystemLimit',
      id: this.systemLimitId,
      elementsContainer: this.inner.slice(),
      name: this.systemLimitName
    };
    const visual = [];
    if (layout && this.systemLimitBox) {
      visual.push({ id: this.systemLimitId, type: 'fpb:SystemLimit', ...this.systemLimitBox });
    }
    if (layout) {
      this.visual.forEach((v, id) => {
        const connection = !!v.waypoints;
        if (connection && layout === 'shapes') {
          return;
        }
        visual.push(JSON.parse(JSON.stringify(v)));
      });
    }
    return {
      process,
      elementDataInformation: JSON.parse(JSON.stringify([systemLimit, ...all])),
      elementVisualInformation: visual
    };
  }
}

export class ModelBuilder {

  constructor(name = 'Testprojekt', namespace = 'http://www.hsu-ifa.de/fpbjs') {
    this.name = name;
    this.namespace = namespace;
    this.processes = [];
  }

  /** Root process; the first one created is the entry point. */
  process(id, systemLimitName = 'Systemgrenze', systemLimitBox = { x: 100, y: 100, width: 600, height: 500 }) {
    const p = new ProcessBuilder(id || nextId('proc'), systemLimitName, systemLimitBox);
    this.processes.push(p);
    return p;
  }

  /**
   * Decomposes `operatorId` of `parent`: the child process gets the operator's
   * id (as FPB.JS does), and the states at the operator are copied into the
   * child as boundary states with the same ids.
   */
  decompose(parent, operatorId, systemLimitName = 'Unterprozess', systemLimitBox) {
    const child = this.process(operatorId, systemLimitName, systemLimitBox);
    child.parent = parent.id;
    child.decomposedOperator = operatorId;
    parent.children.push(child.id);
    parent.item(operatorId).decomposedView = child.id;
    return child;
  }

  build(options = {}) {
    const project = {
      $type: 'fpb:Project',
      name: this.name,
      targetNamespace: this.namespace,
      entryPoint: this.processes[0].id
    };
    return [project, ...this.processes.map((p) => {
      const entry = p.entry(options);
      if (!entry.process.parent) {
        entry.process.parent = p === this.processes[0] ? { ...project } : null;
      }
      return entry;
    })];
  }
}

/** Visual information of every element of a process (outer id -> list). */
export function visualIndex(data) {
  const out = {};
  data.filter((e) => e.process).forEach((e) => {
    out[e.process.id] = new Map((e.elementVisualInformation || []).map((v) => [v.id, v]));
  });
  return out;
}
