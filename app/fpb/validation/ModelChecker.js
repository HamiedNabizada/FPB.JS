import { is, isAny } from '../help/utils';
import { checkIfOnSystemBorder } from '../help/helpUtils';

/**
 * Checks of the VDI 3682 rule catalog (FPB.JS_Docs/Standards/Drafts/
 * VDI3682-Blatt3-Regelkatalog.md) that apply while modeling. Rule ids and
 * severities are those of the catalog. Works on the process root shapes of all
 * layers; shapes of layers not on the canvas are read from elementsContainer.
 *
 * Result: [{ rule, severity: 'error'|'warning'|'info', message, elementId, process }]
 */

export const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

export const RULES = {
  A2: { severity: SEVERITY.ERROR, title: 'Exactly one system limit per process' },
  B1: { severity: SEVERITY.ERROR, title: 'State inside the system limit or on its border' },
  B2: { severity: SEVERITY.ERROR, title: 'Process operator inside the system limit' },
  B3: { severity: SEVERITY.ERROR, title: 'Technical resource outside the system limit' },
  B6: { severity: SEVERITY.ERROR, title: 'Boundary state on the border of the system limit' },
  C5: { severity: SEVERITY.WARNING, title: 'No duplicate connections' },
  C9: { severity: SEVERITY.WARNING, title: 'Parallel or alternative flows not mixed with a normal flow' },
  D3: { severity: SEVERITY.INFO, title: 'Process operator has a name' },
  D4: { severity: SEVERITY.INFO, title: 'State has a name' },
  D5: { severity: SEVERITY.INFO, title: 'Technical resource has a name' },
  F5: { severity: SEVERITY.WARNING, title: 'Decomposition contains every input and output' },
  G1: { severity: SEVERITY.WARNING, title: 'Process operator has an input and an output' },
  G3: { severity: SEVERITY.ERROR, title: 'Flow has different source and target' },
  G4: { severity: SEVERITY.WARNING, title: 'Element is connected' }
};

const FLOW_TYPES = ['fpb:Flow', 'fpb:ParallelFlow', 'fpb:AlternativeFlow'];

// In the schema fpb:Usage extends fpb:Flow, so is(x, 'fpb:Flow') is true for usages too.
function isFlow(connection) {
  return isAny(connection, FLOW_TYPES) && !is(connection, 'fpb:Usage');
}
const BRANCH_TYPES = ['fpb:ParallelFlow', 'fpb:AlternativeFlow'];
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
  return issues;
}

function report(issues, rule, element, process, message) {
  issues.push({
    rule: rule,
    severity: RULES[rule].severity,
    message: message,
    elementId: element ? element.id : null,
    process: process
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

function flowsOf(element, direction) {
  return (element[direction] || []).filter(isFlow);
}

function checkProcess(process, issues) {
  const layer = layerContents(process);
  const sl = layer.systemLimit;

  // A2
  if (layer.systemLimits.length !== 1 && (layer.states.length || layer.operators.length || layer.systemLimits.length)) {
    report(issues, 'A2', layer.systemLimits[1] || null, process,
      layer.systemLimits.length ? 'The process has ' + layer.systemLimits.length + ' system limits.' : 'The process has no system limit.');
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
        report(issues, 'B1', state, process, 'State ' + label(state) + ' lies outside the system limit.');
      }
    });
    // B2
    layer.operators.forEach(function (operator) {
      if (hasBounds(operator) && !contains(sl, operator)) {
        report(issues, 'B2', operator, process, 'Process operator ' + label(operator) + ' is not inside the system limit.');
      }
    });
    // B3
    layer.resources.forEach(function (resource) {
      if (hasBounds(resource) && intersects(sl, resource)) {
        report(issues, 'B3', resource, process, 'Technical resource ' + label(resource) + ' overlaps the system limit.');
      }
    });
    // B6: in a decomposition, the inputs and outputs of the parent operator
    const parentOperator = process.businessObject.isDecomposedProcessOperator;
    if (parentOperator) {
      const boundaryIds = parentBoundaryIds(process);
      layer.states.forEach(function (state) {
        if (boundaryIds.has(state.id) && hasBounds(state) && !checkIfOnSystemBorder(sl, state)) {
          report(issues, 'B6', state, process, 'Boundary state ' + label(state) + ' is not on the upper or lower border of the system limit.');
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
      report(issues, 'G3', connection, process, 'A flow connects ' + label(source) + ' with itself.');
    }
    const key = source.id + '>' + target.id + '>' + connection.type;
    if (seen.has(key)) {
      report(issues, 'C5', connection, process, 'Duplicate connection from ' + label(source) + ' to ' + label(target) + '.');
    }
    seen.set(key, connection);
  });

  // C9
  layer.states.concat(layer.operators).forEach(function (element) {
    const outgoing = flowsOf(element, 'outgoing');
    const branch = outgoing.some(function (c) { return isAny(c, BRANCH_TYPES); });
    const plain = outgoing.some(function (c) { return c.type === 'fpb:Flow'; });
    if (branch && plain) {
      report(issues, 'C9', element, process, label(element) + ' mixes a normal flow with parallel or alternative flows.');
    }
  });

  // D3 to D5
  layer.operators.forEach(function (e) { if (!nameOf(e)) report(issues, 'D3', e, process, 'A process operator has no name.'); });
  layer.states.forEach(function (e) { if (!nameOf(e)) report(issues, 'D4', e, process, 'A state has no name.'); });
  layer.resources.forEach(function (e) { if (!nameOf(e)) report(issues, 'D5', e, process, 'A technical resource has no name.'); });

  // G1
  layer.operators.forEach(function (operator) {
    const inputs = flowsOf(operator, 'incoming').length;
    const outputs = flowsOf(operator, 'outgoing').length;
    if (!inputs || !outputs) {
      report(issues, 'G1', operator, process, 'Process operator ' + label(operator) + ' has no ' +
        (!inputs && !outputs ? 'input and no output' : (!inputs ? 'input' : 'output')) + '.');
    }
  });

  // G4
  layer.states.concat(layer.operators, layer.resources).forEach(function (element) {
    if (!(element.incoming || []).length && !(element.outgoing || []).length) {
      report(issues, 'G4', element, process, label(element) + ' is not connected.');
    }
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
      report(issues, 'F5', operator, process, 'The decomposition of ' + label(operator) + ' lacks ' +
        missing.map(label).join(', ') + '.');
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
