// tests/unit/properties-panel/findings.test.js
import { describe, it, expect } from 'vitest';

import { findingsFor, fieldFindings } from '../../../app/fpb/properties-panel/findings.js';

const top = { id: 'p1' };
const child = { id: 'p2' };
const issue = (rule, severity, elementId, process, message = rule) => ({ rule, severity, elementId, process, message });

describe('findings for the panel', () => {

  it('takes the findings of the element on the shown layer, the layer itself for a process', () => {
    const issues = [issue('G4', 'warning', 'a', top), issue('D7', 'warning', 'a', child), issue('A2', 'error', null, top)];
    expect(findingsFor(issues, { id: 'a' }, top).map((i) => i.rule)).toEqual(['G4']);
    expect(findingsFor(issues, top, top).map((i) => i.rule)).toEqual(['A2']);
  });

  it('puts a missing name (D7, 031) at the name field with its severity', () => {
    const findings = [issue('D7', 'warning', 'a', top, 'State has no name.'), issue('G4', 'warning', 'a', top)];
    expect(fieldFindings(findings)).toEqual({ shortName: { severity: 'warning', message: 'State has no name.' } });
  });
});
