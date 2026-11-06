// tests/unit/validation/modelCheckCorpus.test.js
//
// The corpus of 031 (V8): small AML files with the verdict they must get, the
// same in FPB.js (tests/e2e/model-check-parity.spec.js) and in the OCL rules of
// the plugin (ModelCheckParityTests.cs). Each case is the model "Temperieren"
// with one change, written as AML by the mapper of FPB.js; what the mapper
// does not write (an element without any name) is set in the document.
//
// UPDATE_MODEL_CHECK_CORPUS=1 writes the files; without it the test checks
// that they are what the cases make.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { fixedEnvironment } from '../../../app/fpb/aml/mapper/environment.js';
import { convertFpbJsonToCaex } from '../../../app/fpb/aml/mapper/FpbJsonToCaex.js';
import { guidsIn, maskRandomGuids, maskWritingTime } from '../aml/oracleMask.js';
import basis from '../../e2e/fixtures/temperieren.json';

const DIR = path.join(__dirname, '..', '..', 'fixtures', 'model-check');

const ERHITZEN = '9ca400c0-a373-48c0-9f13-37ce196cee29';
const PRUEFEN = '9833d9a9-1b88-4bfb-91b3-7ab5e2617045';
const HEIZPLATTE = '9fe05bdc-4f2b-4ec5-8128-51dbc597eee2';
const ROHSTOFF = 'c50336d6-9a7f-46e3-a7f5-e6187618dd69';
const WARMPRODUKT = 'ee2dd67d-eecf-4a76-bb64-148b6ed4c320';
const GUTPRODUKT = '1a9fc4c7-3c89-4277-8965-3b186eaa2672';
const AUSSCHUSS = '61a6df5b-1081-4651-93ae-572fea3994ab';

const clone = () => JSON.parse(JSON.stringify(basis));
const processOf = (model, id) => model.find((e) => e.process && e.process.id === id);
const top = (model) => model.find((e) => e.process && !e.process.isDecomposedProcessOperator) || model.find((e) => e.process);
const data = (model, id) => model.filter((e) => e.process).flatMap((e) => e.elementDataInformation).filter((d) => d.id === id);

function versioned(model) {
  model.filter((e) => e.process).flatMap((e) => e.elementDataInformation).forEach((d) => {
    if (d.identification) {
      d.identification.versionNumber = '1';
      d.identification.revisionNumber = '0';
    }
  });
  return model;
}

function allElements(doc) {
  const out = [];
  const walk = (list) => { for (const ie of list) { out.push(ie); walk(ie.internalElement); } };
  for (const ih of doc.caexFile.instanceHierarchy) walk(ih.internalElement);
  return out;
}

const bare = (id) => String(id || '').replace(/^\{|\}$/g, '');

/** The cases: a change of the model, then of the AML document */
const CASES = {
  // flows the guideline does not know (C1 to C4)
  flows: {
    model() {
      const m = versioned(clone());
      const t = top(m).elementDataInformation;
      t.find((d) => d.id === 'd5dc692d-61ac-4b4b-aea5-3d3044345aa7').sourceRef = ERHITZEN;     // PO -> PO: C3
      t.find((d) => d.id === '6551201a-9b9a-43fa-ad15-dc59a37933f7').sourceRef = WARMPRODUKT;  // state -> state: C2
      t.find((d) => d.id === 'baefb918-128f-4f3b-924d-a6ca6e1e5ca1').targetRef = HEIZPLATTE;   // PO -> TR: C1
      t.find((d) => d.id === '0059ef37' || d.id.startsWith('0059ef37')).sourceRef = ROHSTOFF;  // usage from a state: C4
      return m;
    }
  },
  // identification (D1, D7, D8)
  names: {
    model() {
      const m = versioned(clone());
      data(m, AUSSCHUSS).forEach((d) => { d.identification.versionNumber = ''; });
      data(m, HEIZPLATTE).forEach((d) => { d.identification.uniqueIdent = 'DUP-1'; });
      data(m, GUTPRODUKT).forEach((d) => { d.identification.uniqueIdent = 'DUP-1'; d.identification.longName = 'Gutes Produkt'; });
      return m;
    },
    document(doc) {
      // the mapper names an element without a name after its type; a file of
      // another tool may leave the name out: "Prüfen" without any name
      const pruefen = allElements(doc).find((ie) => bare(ie.id) === PRUEFEN);
      pruefen.name = '';
      const identification = pruefen.attribute.item('Identification');
      ['shortName', 'longName'].forEach((n) => { const a = identification && identification.attribute.item(n); if (a) a.value = ''; });
    }
  },
  // cardinality (A3, A4): the decomposition of "Erhitzen" without its operators and flows
  cardinality: {
    model() {
      const m = versioned(clone());
      const child = processOf(m, ERHITZEN);
      const gone = new Set(child.elementDataInformation
        .filter((d) => /ProcessOperator$|Flow$/.test(d.$type)).map((d) => d.id));
      child.elementDataInformation = child.elementDataInformation.filter((d) => !gone.has(d.id));
      child.elementVisualInformation = child.elementVisualInformation.filter((v) => !gone.has(v.id));
      child.elementDataInformation.forEach((d) => {
        if (d.incoming) d.incoming = d.incoming.filter((id) => !gone.has(id));
        if (d.outgoing) d.outgoing = d.outgoing.filter((id) => !gone.has(id));
      });
      return m;
    }
  }
};

function build(name) {
  const c = CASES[name];
  const restore = fixedEnvironment();
  try {
    const json = JSON.stringify(c.model());
    const result = convertFpbJsonToCaex(json);
    if (c.document) c.document(result.value);
    return { text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(result.value.saveToStream(true)), keep: guidsIn(json) };
  } finally {
    restore();
  }
}

// as in the oracle test: the random GUIDs of Aml.Engine depend on which test
// built the libraries first, and the writing time on the zone of the machine
const masked = (text, keep) => maskWritingTime(maskRandomGuids(text, keep));

describe('model check corpus (031 V8)', () => {
  Object.keys(CASES).forEach((name) => {
    it(name + '.aml is what the case makes', () => {
      const file = path.join(DIR, name + '.aml');
      const { text, keep } = build(name);
      if (process.env.UPDATE_MODEL_CHECK_CORPUS) {
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(file, text);
      }
      expect(masked(fs.readFileSync(file, 'utf8'), keep)).toBe(masked(text, keep));
    });
  });

  it('every case has its expected verdict', () => {
    Object.keys(CASES).concat(['showcase-a']).forEach((name) => {
      const expected = JSON.parse(fs.readFileSync(path.join(DIR, name + '.expected.json'), 'utf8'));
      expect(Array.isArray(expected.rules) && Array.isArray(expected.findings)).toBe(true);
    });
  });
});
