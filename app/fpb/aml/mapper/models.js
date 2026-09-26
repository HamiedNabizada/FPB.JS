import { system } from 'amlengine-js';

const { NumberStyles } = system;

/**
 * Port of Models/FpbModels.cs: the FPB.js JSON array
 * [FpbProject, ProcessEntry, ProcessEntry, ...] parsed into plain objects with
 * the fields of the C# models in camel case.
 *
 * The C# parser reads with System.Text.Json and takes characteristic values
 * that are JSON numbers as their raw text (GetRawText): 20.0 stays "20.0".
 * JSON.parse loses that text, so the JSON is read here by a small parser that
 * keeps numbers as RawNumber.
 */

/** A JSON number with its text as written */
export class RawNumber {
  constructor(raw) {
    this.raw = raw;
    this.value = Number(raw);
  }
}

/**
 * Strict JSON (RFC 8259, as JsonDocument.Parse): numbers become RawNumber,
 * everything else as JSON.parse. Throws SyntaxError on invalid input.
 */
export function parseJsonKeepingNumbers(text) {
  let i = 0;
  const fail = (message) => {
    throw new SyntaxError(message + ' at position ' + i);
  };
  const ws = () => {
    while (i < text.length) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
        i++;
      } else {
        break;
      }
    }
  };
  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

  const value = () => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const obj = {};
      ws();
      if (text[i] === '}') {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') {
          fail('Expected property name');
        }
        const key = string();
        ws();
        if (text[i] !== ':') {
          fail('Expected ":"');
        }
        i++;
        obj[key] = value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return obj;
        }
        fail('Expected "," or "}"');
      }
    }
    if (c === '[') {
      i++;
      const arr = [];
      ws();
      if (text[i] === ']') {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value());
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return arr;
        }
        fail('Expected "," or "]"');
      }
    }
    if (c === '"') {
      return string();
    }
    if (text.startsWith('true', i)) {
      i += 4;
      return true;
    }
    if (text.startsWith('false', i)) {
      i += 5;
      return false;
    }
    if (text.startsWith('null', i)) {
      i += 4;
      return null;
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (m && m[0].length) {
      i += m[0].length;
      return new RawNumber(m[0]);
    }
    return fail('Unexpected character');
  };

  const string = () => {
    const start = i;
    i++;
    for (;;) {
      const c = text.charCodeAt(i);
      if (Number.isNaN(c)) {
        fail('Unterminated string');
      }
      if (c === 0x22) {
        i++;
        return JSON.parse(text.substring(start, i));
      }
      if (c < 0x20) {
        fail('Control character in string');
      }
      i += c === 0x5c ? 2 : 1;
    }
  };

  const result = value();
  ws();
  if (i < text.length) {
    fail('Unexpected data after the JSON value');
  }
  return result;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof RawNumber);
const has = (el, name) => isObject(el) && Object.prototype.hasOwnProperty.call(el, name);

/** GetString() of an array element: a string, null for JSON null, else InvalidOperationException */
function elementString(v) {
  if (typeof v === 'string' || v === null) {
    return v;
  }
  throw new TypeError('The requested operation requires an element of type \'String\'');
}

/** GetStringProp: the string value, "" when missing or no string */
function getStringProp(el, name) {
  return has(el, name) && typeof el[name] === 'string' ? el[name] : '';
}

/** GetScalarAsString: strings as they are, numbers as their raw text, booleans as true/false */
function getScalarAsString(el, name) {
  if (!has(el, name)) {
    return '';
  }
  const v = el[name];
  if (typeof v === 'string') {
    return v;
  }
  if (v instanceof RawNumber) {
    return v.raw;
  }
  if (v === true) {
    return 'true';
  }
  if (v === false) {
    return 'false';
  }
  return '';
}

/** GetStringPropOrNull: the string value, null when missing, no string or empty */
function getStringPropOrNull(el, name) {
  if (has(el, name) && typeof el[name] === 'string') {
    return el[name] ? el[name] : null;
  }
  return null;
}

/** GetIdRefProp: a plain id string or the id of an embedded business object */
function getIdRefProp(el, name) {
  if (!has(el, name)) {
    return null;
  }
  const v = el[name];
  if (typeof v === 'string') {
    return v ? v : null;
  }
  if (isObject(v) && typeof v.id === 'string') {
    return v.id ? v.id : null;
  }
  return null;
}

/** GetDoubleProp: numbers as they are, numeric strings by double.TryParse, else 0 */
function getDoubleProp(el, name) {
  if (has(el, name)) {
    const v = el[name];
    if (v instanceof RawNumber) {
      return v.value;
    }
    if (typeof v === 'string') {
      const d = system.tryParseDouble(v, NumberStyles.Float | NumberStyles.AllowThousands);
      if (d !== null) {
        return d;
      }
    }
  }
  return 0;
}

const eachOf = (el, name) => (has(el, name) && Array.isArray(el[name]) ? el[name] : []);

/**
 * FpbJsonParser.Parse: { project, entries } from the JSON text. Throws like
 * the C# parser: no array, no fpb:Project.
 */
export function parseFpbJson(json) {
  const root = parseJsonKeepingNumbers(json);
  if (!Array.isArray(root)) {
    throw new Error('Expected JSON array');
  }

  let project = null;
  const entries = [];

  for (const elem of root) {
    if (has(elem, '$type') && elem.$type === 'fpb:Project') {
      project = {
        type: 'fpb:Project',
        name: getStringProp(elem, 'name'),
        targetNamespace: getStringProp(elem, 'targetNamespace'),
        entryPoint: getStringProp(elem, 'entryPoint')
      };
    } else if (has(elem, 'process')) {
      entries.push(parseProcessEntry(elem));
    }
  }

  if (!project) {
    throw new Error('No fpb:Project found');
  }
  return { project, entries };
}

function parseProcessEntry(elem) {
  const procEl = elem.process;
  const process = {
    type: 'fpb:Process',
    id: getStringProp(procEl, 'id'),
    isDecomposedProcessOperator: getIdRefProp(procEl, 'isDecomposedProcessOperator'),
    parent: getIdRefProp(procEl, 'parent'),
    consistsOfStates: [],
    consistsOfSystemLimit: getStringPropOrNull(procEl, 'consistsOfSystemLimit'),
    consistsOfProcesses: [],
    consistsOfProcessOperator: [],
    elementsContainer: []
  };
  if (has(procEl, 'consistsOfStates')) {
    process.consistsOfStates = procEl.consistsOfStates.map(elementString);
  }
  if (has(procEl, 'consistsOfProcessOperator')) {
    process.consistsOfProcessOperator = procEl.consistsOfProcessOperator.map(elementString);
  }

  const entry = { process, elementData: [], elementVisual: [] };
  for (const edi of eachOf(elem, 'elementDataInformation')) {
    entry.elementData.push(parseElementData(edi));
  }
  for (const evi of eachOf(elem, 'elementVisualInformation')) {
    entry.elementVisual.push(parseVisualInfo(evi));
  }
  return entry;
}

function parseElementData(el) {
  const data = {
    type: getStringProp(el, '$type'),
    id: getStringProp(el, 'id'),
    name: getStringProp(el, 'name'),
    sourceRef: getStringPropOrNull(el, 'sourceRef'),
    targetRef: getStringPropOrNull(el, 'targetRef'),
    decomposedView: getStringPropOrNull(el, 'decomposedView'),
    inTandemWith: [],
    identification: null,
    characteristics: []
  };
  if (has(el, 'inTandemWith')) {
    data.inTandemWith = el.inTandemWith.map(elementString);
  }
  if (has(el, 'identification')) {
    data.identification = parseIdentification(el.identification);
  }
  if (has(el, 'characteristics')) {
    for (const c of el.characteristics) {
      data.characteristics.push(parseCharacteristic(c));
    }
  }
  return data;
}

function parseIdentification(el) {
  return {
    uniqueIdent: getStringProp(el, 'uniqueIdent'),
    longName: getStringProp(el, 'longName'),
    shortName: getStringProp(el, 'shortName'),
    versionNumber: getStringProp(el, 'versionNumber'),
    revisionNumber: getStringProp(el, 'revisionNumber')
  };
}

function parseCharacteristic(el) {
  const c = { category: null, descriptiveElement: null, relationalElement: null };

  if (has(el, 'category')) {
    c.category = parseIdentification(el.category);
  }
  if (has(el, 'descriptiveElement')) {
    const descEl = el.descriptiveElement;
    c.descriptiveElement = {
      valueDeterminationProcess: getStringProp(descEl, 'valueDeterminationProcess'),
      representivity: getStringProp(descEl, 'representivity'),
      setpointValue: parseValueWithUnit(descEl, 'setpointValue'),
      validityLimits: parseValidityLimits(descEl, 'validityLimits'),
      actualValues: parseValueWithUnitList(descEl, 'actualValues')
    };
  }
  if (has(el, 'relationalElement')) {
    const relEl = el.relationalElement;
    c.relationalElement = {
      view: getStringProp(relEl, 'view'),
      model: getStringProp(relEl, 'model'),
      regulationsForRelationalGeneration: getStringProp(relEl, 'regulationsForRelationalGeneration')
    };
  }
  return c;
}

function parseValueWithUnit(parent, name) {
  if (!has(parent, name) || !isObject(parent[name])) {
    return null;
  }
  const v = parent[name];
  return { value: getScalarAsString(v, 'value'), unit: getStringProp(v, 'unit') };
}

function parseValueWithUnitList(parent, name) {
  if (!has(parent, name) || !Array.isArray(parent[name])) {
    return [];
  }
  return parent[name].filter(isObject).map((v) => ({ value: getScalarAsString(v, 'value'), unit: getStringProp(v, 'unit') }));
}

function parseValidityLimits(parent, name) {
  if (!has(parent, name) || !Array.isArray(parent[name])) {
    return [];
  }
  return parent[name].filter(isObject).map((v) => ({
    limitType: getStringProp(v, 'limitType'),
    from: getScalarAsString(v, 'from'),
    to: getScalarAsString(v, 'to')
  }));
}

function parseVisualInfo(el) {
  const vi = {
    id: getStringProp(el, 'id'),
    type: getStringProp(el, 'type'),
    x: getDoubleProp(el, 'x'),
    y: getDoubleProp(el, 'y'),
    width: getDoubleProp(el, 'width'),
    height: getDoubleProp(el, 'height'),
    waypoints: []
  };
  if (has(el, 'waypoints')) {
    for (const wp of el.waypoints) {
      const wpi = { x: getDoubleProp(wp, 'x'), y: getDoubleProp(wp, 'y'), original: null };
      if (has(wp, 'original')) {
        wpi.original = { x: getDoubleProp(wp.original, 'x'), y: getDoubleProp(wp.original, 'y'), original: null };
      }
      vi.waypoints.push(wpi);
    }
  }
  return vi;
}
