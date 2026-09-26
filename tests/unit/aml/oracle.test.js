// tests/unit/aml/oracle.test.js
//
// The JavaScript port of the FpbMapper against the C# mapper: every case that
// tools/aml-oracle wrote to oracle/cases.json. AML is compared as saved text
// (SaveToStream with BOM, CRLF, two spaces) after numbering the random GUIDs
// of Aml.Engine (oracleMask.js); JSON by content; warnings exactly. Both
// sides use the same fixed GUIDs and time (fixedEnvironment).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CAEXDocument } from 'amlengine-js';

import { fixedEnvironment } from '../../../app/fpb/aml/mapper/environment.js';
import { findFpdInstanceHierarchies, convertCaexToFpbJson } from '../../../app/fpb/aml/mapper/CaexToFpbJson.js';
import { convertFpbJsonToCaex, updateInPlace } from '../../../app/fpb/aml/mapper/FpbJsonToCaex.js';
import { guidsIn, maskRandomGuids } from './oracleMask.js';

const base = path.join(__dirname, 'oracle');
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'cases.json'), 'utf8'));

/** As File.ReadAllText: UTF-8 without the byte order mark */
const read = (rel) => fs.readFileSync(path.join(base, rel), 'utf8').replace(/^﻿/, '');
const decode = (bytes) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);

function fixed(run) {
  const restore = fixedEnvironment();
  try {
    return run();
  } finally {
    restore();
  }
}

function hierarchy(doc, index) {
  return index == null ? undefined : findFpdInstanceHierarchies(doc)[index];
}

function expectSameAml(actualBytes, c, inputs) {
  const keep = guidsIn(...inputs);
  const actual = maskRandomGuids(decode(actualBytes), keep);
  const expected = maskRandomGuids(decode(fs.readFileSync(path.join(base, c.expected))), keep);
  expect(actual).toBe(expected);
}

function expectSameWarnings(warnings, c, inputs) {
  const keep = guidsIn(...inputs);
  expect(warnings.map((w) => maskRandomGuids(w, keep))).toEqual(c.warnings.map((w) => maskRandomGuids(w, keep)));
}

const byKind = (kind) => manifest.cases.filter((c) => c.kind === kind);

describe('FpbMapper port against the C# mapper', () => {

  describe('JSON to AML (Convert)', () => {
    byKind('convert').forEach((c) => {
      it(c.id, () => {
        const json = read(c.json);
        const result = fixed(() => convertFpbJsonToCaex(json));
        expectSameAml(result.value.saveToStream(true), c, [json]);
        expectSameWarnings(result.warnings, c, [json]);
      });
    });
  });

  describe('FPD hierarchies of a document', () => {
    byKind('find').forEach((c) => {
      it(c.id, () => {
        const doc = CAEXDocument.loadFromString(read(c.aml));
        const found = findFpdInstanceHierarchies(doc).map((ih) => ({ id: ih.id, name: ih.name }));
        expect(found).toEqual(c.hierarchies);
      });
    });
  });

  describe('AML to JSON', () => {
    byKind('tojson').forEach((c) => {
      it(c.id, () => {
        const aml = read(c.aml);
        const doc = CAEXDocument.loadFromString(aml);
        const ih = hierarchy(doc, c.hierarchy);
        const result = fixed(() => convertCaexToFpbJson(doc, ih));
        expect(JSON.parse(result.value)).toEqual(JSON.parse(read(c.expected)));
        expectSameWarnings(result.warnings, c, [aml]);
      });
    });
  });

  describe('AML updated with FPB.js JSON (UpdateInPlace)', () => {
    byKind('update').forEach((c) => {
      it(c.id, () => {
        const aml = read(c.aml);
        const json = read(c.json);
        const doc = CAEXDocument.loadFromString(aml);
        const ih = hierarchy(doc, c.hierarchy);
        const result = fixed(() => updateInPlace(doc, json, ih));
        expectSameAml(result.value.saveToStream(true), c, [aml, json]);
        expectSameWarnings(result.warnings, c, [aml, json]);
      });
    });
  });
});
