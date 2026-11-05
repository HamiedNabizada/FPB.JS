import { regionOf } from '../properties-panel/characteristics/limits';
import { markText } from '../i18n/markText';
import { fill, translateMessage } from '../i18n/language';
import { is, isAny } from '../help/utils';
import { checkIfOnSystemBorder } from '../help/helpUtils';
import { content } from '../help/modelContent';

/**
 * Checks of the VDI 3682 rule catalog (FPB.JS_Docs/Standards/Drafts/
 * VDI3682-Blatt3-Regelkatalog.md) that apply while modeling. Rule ids and
 * severities are those of the catalog. Works on the process root shapes of all
 * layers; shapes of layers not on the canvas are read from elementsContainer.
 *
 * Result: [{ rule, severity: 'error'|'warning'|'info', message, template, args, elementId, process, involved }],
 * `message` in English; `template` and `args` give it in any language with
 * translateMessage (016h T15). Values in args are data (names in quotes,
 * numbers) or messages of their own ({ template }) or lists of both.
 * `involved` = [{ id, process }] of every element the finding is about
 */

export const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

export const RULES = {
  A2: { severity: SEVERITY.ERROR, title: markText('Exactly one system limit per process') },
  B1: { severity: SEVERITY.ERROR, title: markText('State inside the system limit or on its border') },
  B2: { severity: SEVERITY.ERROR, title: markText('Process operator inside the system limit') },
  B3: { severity: SEVERITY.ERROR, title: markText('Technical resource outside the system limit') },
  B6: { severity: SEVERITY.ERROR, title: markText('Boundary state on the border of the system limit') },
  C5: { severity: SEVERITY.WARNING, title: markText('No duplicate connections') },
  C9: { severity: SEVERITY.WARNING, title: markText('Parallel or alternative flows not mixed with a normal flow') },
  D3: { severity: SEVERITY.INFO, title: markText('Process operator has a name') },
  D4: { severity: SEVERITY.INFO, title: markText('State has a name') },
  D5: { severity: SEVERITY.INFO, title: markText('Technical resource has a name') },
  // Blatt 2 Abschn. 5.2: a setpoint with its validity limits (016g B2)
  E5: { severity: SEVERITY.ERROR, title: markText('Lower limit not above upper limit') },
  F5: { severity: SEVERITY.WARNING, title: markText('Decomposition contains every input and output') },
  F8: { severity: SEVERITY.WARNING, title: markText('Branching type matches the decomposition') },
  // a note, as E6 of the catalog: the model stays valid, and every older file
  // whose layers were saved one by one would report it after the import
  F9: { severity: SEVERITY.INFO, title: markText('Copies of a boundary state agree') },
  G1: { severity: SEVERITY.WARNING, title: markText('Process operator has an input and an output') },
  G3: { severity: SEVERITY.ERROR, title: markText('Flow has different source and target') },
  G4: { severity: SEVERITY.WARNING, title: markText('Element is connected') }
};

const FLOW_TYPES = ['fpb:Flow', 'fpb:ParallelFlow', 'fpb:AlternativeFlow'];

// In the schema fpb:Usage extends fpb:Flow, so is(x, 'fpb:Flow') is true for usages too.
function isFlow(connection) {
  return isAny(connection, FLOW_TYPES) && !is(connection, 'fpb:Usage');
}
const BRANCH_TYPES = ['fpb:ParallelFlow', 'fpb:AlternativeFlow'];
// the kinds of a branching as words of a finding (F8)
const KIND = { alternative: markText('alternative'), parallel: markText('parallel') };
const TOLERANCE = 1;

export function checkModel(processShapes) {
  const issues = [];
  const byId = new Map();
  (processShapes || []).forEach(function (process) {
    if (process && process.businessObject) {
      byId.set(process.id, process);
    }
  });

  byId.forEach(function (process) {
    checkProcess(process, issues);
  });
  checkCopies(byId, issues);
  checkLimits(byId, issues);
  return issues;
}

const list = (value) => (Array.isArray(value) ? value : (value ? [value] : []));

/** A limit as a number: a number, or a text that is wholly one (older files) */
function limitNumber(value) {
  if (typeof value === 'number') {
    return isFinite(value) ? value : null;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const number = Number(value.trim().replace(',', '.'));
  return isFinite(number) ? number : null;
}

/**
 * E5: in every validity limit the lower one is not above the upper one;
 * compared only where both are numbers. That the permitted rejection region
 * holds the acceptance region is not checked: Blatt 2 does not say so in as
 * many words (016g). Copies of a boundary state are one object: reported
 * once, at the copy on the uppermost layer.
 */
function checkLimits(processes, issues) {
  const seen = new Set();
  processes.forEach(function (process) {
    const layer = layerContents(process);
    layer.states.concat(layer.operators, layer.resources).forEach(function (element) {
      if (seen.has(element.id)) {
        return;
      }
      seen.add(element.id);
      list(element.businessObject.characteristics).forEach(function (characteristic, n) {
        const category = (characteristic && characteristic.category) || {};
        const name = text(category.shortName) || text(category.longName) || String(n + 1);
        list(((characteristic && characteristic.descriptiveElement) || {}).validityLimits).forEach(function (limit) {
          const from = limitNumber(limit && limit.from);
          const to = limitNumber(limit && limit.to);
          if (from === null || to === null || from <= to) {
            return;
          }
          report(issues, 'E5', element, process, msg('Characteristic {name} of {element}, {limit}: lower limit {from} is above upper limit {to}.', {
            name, element: label(element), limit: limitWord(limit.limitType), from: String(from), to: String(to)
          }));
        });
      });
    });
  });
}

const text = (value) => (value === undefined || value === null ? '' : String(value).trim());

// the regions of Blatt 2 Abschn. 5.2 as words of the interface; other types are data (E5)
const REGION_WORDS = { acceptance: markText('acceptance region'), permitted: markText('permitted rejection region') };

/** The limit type of a finding: a known region in the language of translate, else as stored */
function limitWord(limitType) {
  const region = regionOf(limitType);
  if (region && REGION_WORDS[region]) {
    return msg(REGION_WORDS[region]);
  }
  return text(limitType) || msg('validity limit');
}
const identificationOf = (state) => state.businessObject.identification || {};

/** What the copies of a boundary state must agree in (F9) */
const ASPECTS = [
  { label: markText('name'), read: (state) => text(state.businessObject.name) },
  { label: markText('short name'), read: (state) => text(identificationOf(state).shortName) },
  { label: markText('long name'), read: (state) => text(identificationOf(state).longName) },
  { label: markText('version'), read: (state) => text(identificationOf(state).versionNumber) },
  { label: markText('revision'), read: (state) => text(identificationOf(state).revisionNumber) },
  { label: markText('characteristics'), read: (state) => JSON.stringify(content(state.businessObject.characteristics)) }
];

/**
 * F9: the copies of a boundary state are one object of the model (VDI 3682
 * Blatt 1: a decomposition structures the operators, not the products and
 * energies; Blatt 2: one identification per object). Copies an older file
 * left different are reported once, at the copy on the uppermost layer.
 * `variants` holds one copy per different content, so the user can choose
 * which one all copies take (fpb.alignStateCopies).
 */
function checkCopies(processes, issues) {
  const copiesById = new Map();
  processes.forEach(function (process) {
    layerContents(process).states.forEach(function (state) {
      const list = copiesById.get(state.id) || [];
      list.push({ state: state, process: process });
      copiesById.set(state.id, list);
    });
  });

  copiesById.forEach(function (copies) {
    if (copies.length < 2) {
      return;
    }
    const first = copies[0];
    const differs = ASPECTS.filter(function (aspect) {
      return copies.some(function (copy) { return aspect.read(copy.state) !== aspect.read(first.state); });
    });
    if (!differs.length) {
      return;
    }
    const variants = [];
    const seen = new Set();
    copies.forEach(function (copy) {
      const key = JSON.stringify(ASPECTS.map(function (aspect) { return aspect.read(copy.state); }));
      if (!seen.has(key)) {
        seen.add(key);
        variants.push({ id: copy.state.id, process: copy.process });
      }
    });
    report(issues, 'F9', first.state, first.process, msg('The copies of {element} on the layers differ in {aspects}.', {
      element: label(first.state),
      aspects: differs.map(function (aspect) { return msg(aspect.label); })
    }),
      copies.map(function (copy) { return { id: copy.state.id, process: copy.process }; }));
    issues[issues.length - 1].variants = variants;
  });
}

/**
 * `involved`: every element the finding is about, as { id, process }, first
 * its own element (024 point 6, 016b V8). Elements on other layers carry
 * their layer, so the list can open it.
 */
/** A message for report(): its template and its values */
function msg(template, args) {
  return { template: template, args: args || {} };
}

function report(issues, rule, element, process, message, involved) {
  const own = element ? [{ id: element.id, process: process }] : [];
  const others = (involved || []).filter(function (x) { return x && x.id && !(element && x.id === element.id && x.process === process); });
  issues.push({
    rule: rule,
    severity: RULES[rule].severity,
    message: translateMessage(fill, message),
    template: message.template,
    args: message.args,
    elementId: element ? element.id : null,
    process: process,
    involved: own.concat(others)
  });
}

function nameOf(element) {
  const bo = element.businessObject || {};
  const identification = bo.identification || {};
  return (bo.name || identification.shortName || '').trim();
}

function label(element) {
  return nameOf(element) ? '"' + nameOf(element) + '"' : element.id;
}

function layerContents(process) {
  const top = process.businessObject.elementsContainer || [];
  const systemLimits = top.filter(function (e) { return is(e, 'fpb:SystemLimit'); });
  const systemLimit = systemLimits[0];
  const inner = systemLimit ? (systemLimit.businessObject.elementsContainer || []) : [];
  const all = top.concat(inner).filter(Boolean);
  return {
    systemLimits: systemLimits,
    systemLimit: systemLimit,
    states: all.filter(function (e) { return is(e, 'fpb:State'); }),
    operators: all.filter(function (e) { return is(e, 'fpb:ProcessOperator'); }),
    resources: all.filter(function (e) { return is(e, 'fpb:TechnicalResource'); }),
    flows: all.filter(function (e) { return isFlow(e) && e.waypoints; }),
    usages: all.filter(function (e) { return is(e, 'fpb:Usage'); })
  };
}

/**
 * 'alternative' or 'parallel' if the flows form a branching of one kind,
 * otherwise null (a single flow or mixed types say nothing, see C9).
 */
function branchKind(flows) {
  if (flows.length < 2) {
    return null;
  }
  if (flows.every(function (flow) { return is(flow, 'fpb:AlternativeFlow'); })) {
    return 'alternative';
  }
  if (flows.every(function (flow) { return is(flow, 'fpb:ParallelFlow'); })) {
    return 'parallel';
  }
  return null;
}

function flowsOf(element, direction) {
  return (element[direction] || []).filter(isFlow);
}

function checkProcess(process, issues) {
  const layer = layerContents(process);
  const sl = layer.systemLimit;

  // A2
  if (layer.systemLimits.length !== 1 && (layer.states.length || layer.operators.length || layer.systemLimits.length)) {
    report(issues, 'A2', layer.systemLimits[1] || null, process,
      layer.systemLimits.length
        ? msg('The process has {count} system limits.', { count: layer.systemLimits.length })
        : msg('The process has no system limit.'));
  }

  if (sl && hasBounds(sl)) {
    // B1: centre of the state within the system limit extended by half the state
    layer.states.forEach(function (state) {
      if (!hasBounds(state)) return;
      const cx = state.x + state.width / 2;
      const cy = state.y + state.height / 2;
      const inside = cx >= sl.x - state.width / 2 - TOLERANCE && cx <= sl.x + sl.width + state.width / 2 + TOLERANCE
        && cy >= sl.y - state.height / 2 - TOLERANCE && cy <= sl.y + sl.height + state.height / 2 + TOLERANCE;
      if (!inside) {
        report(issues, 'B1', state, process, msg('State {element} lies outside the system limit.', { element: label(state) }));
      }
    });
    // B2
    layer.operators.forEach(function (operator) {
      if (hasBounds(operator) && !contains(sl, operator)) {
        report(issues, 'B2', operator, process, msg('Process operator {element} is not inside the system limit.', { element: label(operator) }));
      }
    });
    // B3
    layer.resources.forEach(function (resource) {
      if (hasBounds(resource) && intersects(sl, resource)) {
        report(issues, 'B3', resource, process, msg('Technical resource {element} overlaps the system limit.', { element: label(resource) }));
      }
    });
    // B6: in a decomposition, the inputs and outputs of the parent operator
    const parentOperator = process.businessObject.isDecomposedProcessOperator;
    if (parentOperator) {
      const boundaryIds = parentBoundaryIds(process);
      layer.states.forEach(function (state) {
        if (boundaryIds.has(state.id) && hasBounds(state) && !checkIfOnSystemBorder(sl, state)) {
          report(issues, 'B6', state, process, msg('Boundary state {element} is not on the upper or lower border of the system limit.', { element: label(state) }));
        }
      });
    }
  }

  // C5 and G3
  const seen = new Map();
  Array.from(new Set(layer.flows.concat(layer.usages))).forEach(function (connection) {
    const source = connection.source;
    const target = connection.target;
    if (!source || !target) return;
    if (source === target) {
      report(issues, 'G3', connection, process, msg('A flow connects {element} with itself.', { element: label(source) }));
    }
    const key = source.id + '>' + target.id + '>' + connection.type;
    if (seen.has(key)) {
      report(issues, 'C5', connection, process, msg('Duplicate connection from {source} to {target}.', { source: label(source), target: label(target) }),
        [{ id: seen.get(key).id, process: process }]);
    }
    seen.set(key, connection);
  });

  // C9
  layer.states.concat(layer.operators).forEach(function (element) {
    const outgoing = flowsOf(element, 'outgoing');
    const branch = outgoing.some(function (c) { return isAny(c, BRANCH_TYPES); });
    const plain = outgoing.some(function (c) { return c.type === 'fpb:Flow'; });
    if (branch && plain) {
      report(issues, 'C9', element, process, msg('{element} mixes a normal flow with parallel or alternative flows.', { element: label(element) }),
        outgoing.map(function (c) { return { id: c.id, process: process }; }));
    }
  });

  // D3 to D5
  layer.operators.forEach(function (e) { if (!nameOf(e)) report(issues, 'D3', e, process, msg('A process operator has no name.')); });
  layer.states.forEach(function (e) { if (!nameOf(e)) report(issues, 'D4', e, process, msg('A state has no name.')); });
  layer.resources.forEach(function (e) { if (!nameOf(e)) report(issues, 'D5', e, process, msg('A technical resource has no name.')); });

  // G1
  layer.operators.forEach(function (operator) {
    const inputs = flowsOf(operator, 'incoming').length;
    const outputs = flowsOf(operator, 'outgoing').length;
    if (!inputs || !outputs) {
      report(issues, 'G1', operator, process, msg(!inputs && !outputs
        ? 'Process operator {element} has no input and no output.'
        : (!inputs ? 'Process operator {element} has no input.' : 'Process operator {element} has no output.'), { element: label(operator) }));
    }
  });

  // G4
  layer.states.concat(layer.operators, layer.resources).forEach(function (element) {
    if (!(element.incoming || []).length && !(element.outgoing || []).length) {
      report(issues, 'G4', element, process, msg('{element} is not connected.', { element: label(element) }));
    }
  });

  // F8: a branching of a decomposed operator must not contradict its decomposition
  layer.operators.forEach(function (operator) {
    const child = operator.businessObject.decomposedView;
    if (!child || !child.businessObject) {
      return;
    }
    const childStates = {};
    layerContents(child).states.forEach(function (state) { childStates[state.id] = state; });

    [
      { direction: 'outgoing', childDirection: 'incoming', text: markText('The outputs of {element} are {parent}, but its decomposition produces them {child}.') },
      { direction: 'incoming', childDirection: 'outgoing', text: markText('The inputs of {element} are {parent}, but its decomposition uses them {child}.') }
    ].forEach(function (side) {
      const flows = flowsOf(operator, side.direction);
      const parentKind = branchKind(flows);
      if (!parentKind) {
        return;
      }
      const childFlows = flows
        .map(function (flow) { return side.direction === 'outgoing' ? flow.target : flow.source; })
        .map(function (state) { return state && childStates[state.id]; })
        .filter(Boolean)
        .reduce(function (all, state) { return all.concat(flowsOf(state, side.childDirection)); }, []);

      const childKind = branchKind(childFlows);
      if (childKind && childKind !== parentKind) {
        report(issues, 'F8', operator, process, msg(side.text, { element: label(operator), parent: msg(KIND[parentKind]), child: msg(KIND[childKind]) }),
          flows.map(function (f) { return { id: f.id, process: process }; })
            .concat(childFlows.map(function (f) { return { id: f.id, process: child }; })));
      }
    });
  });

  // F5: every input and output of a decomposed operator exists in its decomposition
  layer.operators.forEach(function (operator) {
    const child = operator.businessObject.decomposedView;
    if (!child || !child.businessObject) return;
    const childStates = new Set(layerContents(child).states.map(function (s) { return s.id; }));
    const missing = flowsOf(operator, 'incoming').map(function (c) { return c.source; })
      .concat(flowsOf(operator, 'outgoing').map(function (c) { return c.target; }))
      .filter(function (state) { return state && !childStates.has(state.id); });
    if (missing.length) {
      report(issues, 'F5', operator, process, msg('The decomposition of {element} lacks {missing}.', {
        element: label(operator), missing: missing.map(label)
      }), missing.map(function (s) { return { id: s.id, process: process }; }));
    }
  });
}

/** Ids of the states connected to the operator this process decomposes. */
function parentBoundaryIds(process) {
  const ids = new Set();
  const parent = process.businessObject.parent;
  const operatorBo = process.businessObject.isDecomposedProcessOperator;
  if (!parent || !parent.businessObject || !operatorBo) {
    return ids;
  }
  const operator = layerContents(parent).operators.find(function (o) { return o.id === operatorBo.id; });
  if (!operator) {
    return ids;
  }
  flowsOf(operator, 'incoming').forEach(function (c) { if (c.source) ids.add(c.source.id); });
  flowsOf(operator, 'outgoing').forEach(function (c) { if (c.target) ids.add(c.target.id); });
  return ids;
}

function hasBounds(e) {
  return e && typeof e.x === 'number' && typeof e.y === 'number' && e.width > 0 && e.height > 0;
}

function contains(outer, inner) {
  return inner.x >= outer.x - TOLERANCE && inner.y >= outer.y - TOLERANCE
    && inner.x + inner.width <= outer.x + outer.width + TOLERANCE
    && inner.y + inner.height <= outer.y + outer.height + TOLERANCE;
}

function intersects(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
