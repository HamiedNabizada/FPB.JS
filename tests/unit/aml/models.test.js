// tests/unit/aml/models.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { parseFpbJson, parseJsonKeepingNumbers, RawNumber } from '../../../app/fpb/aml/mapper/models.js';

const inputs = path.join(__dirname, 'oracle', 'inputs', 'json');

describe('JSON models of the mapper port', () => {

  it('keeps the raw text of numbers and parses the rest as JSON.parse', () => {
    const v = parseJsonKeepingNumbers('{"a":20.0,"b":[1e3,-0,"x\u00e4"],"c":null,"d":true}');
    expect(v.a).toBeInstanceOf(RawNumber);
    expect(v.a.raw).toBe('20.0');
    expect(v.b[0].raw).toBe('1e3');
    expect(v.b[0].value).toBe(1000);
    expect(v.b[2]).toBe('xä');
    expect(v.c).toBe(null);
    expect(v.d).toBe(true);
  });

  it('rejects what JsonDocument rejects: trailing commas, comments, leading zeros', () => {
    ['[1,]', '{"a":1,}', '[1] // x', '[01]', '[1', ''].forEach((text) => {
      expect(() => parseJsonKeepingNumbers(text), text).toThrow(SyntaxError);
    });
  });

  it('parses every JSON input of the oracle', () => {
    const files = fs.readdirSync(inputs).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    files.forEach((file) => {
      const { project, entries } = parseFpbJson(fs.readFileSync(path.join(inputs, file), 'utf8').replace(/^﻿/, ''));
      expect(project.type, file).toBe('fpb:Project');
      expect(entries.length, file).toBeGreaterThan(0);
      entries.forEach((e) => expect(e.process.id, file).toBeTruthy());
    });
  });

  it('takes characteristic numbers as their text, as GetRawText', () => {
    const json = '[{"$type":"fpb:Project","name":"P","entryPoint":"p"},{"process":{"id":"p"},"elementDataInformation":[' +
      '{"$type":"fpb:Product","id":"s","characteristics":[{"descriptiveElement":{"setpointValue":{"value":20.0,"unit":"°C"},' +
      '"validityLimits":[{"limitType":"t","from":0,"to":1.50}]}}]}],"elementVisualInformation":[{"id":"s","x":"12.5","y":3}]}]';
    const { entries } = parseFpbJson(json);
    const d = entries[0].elementData[0].characteristics[0].descriptiveElement;
    expect(d.setpointValue).toEqual({ value: '20.0', unit: '°C' });
    expect(d.validityLimits[0]).toEqual({ limitType: 't', from: '0', to: '1.50' });
    expect(entries[0].elementVisual[0].x).toBe(12.5);
    expect(entries[0].elementVisual[0].y).toBe(3);
  });
});
