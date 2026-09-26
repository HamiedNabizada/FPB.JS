// tests/unit/aml/ids.test.js
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

import { sha1, dotNetGuidFromBytes, deriveSubProcessId, deriveBoundaryStateId } from '../../../app/fpb/aml/mapper/ids.js';
import oracle from './oracle/cases.json';

describe('ids of the mapper port', () => {

  it('sha1 matches node crypto for empty, short, block-sized and long input', () => {
    const inputs = ['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'fpd-subprocess-of:ä€😀'.repeat(20)];
    inputs.forEach((text) => {
      const bytes = new TextEncoder().encode(text);
      expect(Buffer.from(sha1(bytes)).toString('hex')).toBe(createHash('sha1').update(bytes).digest('hex'));
    });
  });

  /** new Guid(byte[]).ToString("B") of .NET, checked with dotnet: bytes 00..0f */
  it('formats bytes as new Guid(bytes) does in .NET (first three fields little endian)', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i);
    expect(dotNetGuidFromBytes(bytes)).toBe('{03020100-0504-0706-0809-0a0b0c0d0e0f}');
  });

  /** Values of the C# mapper, called by reflection in tools/aml-oracle */
  it('derives the same sub-process and boundary state ids as the C# mapper', () => {
    const derived = oracle.cases.filter((c) => c.kind === 'derive');
    expect(derived.length).toBeGreaterThan(0);
    derived.forEach((c) => {
      const result = c.method === 'DeriveSubProcessId' ? deriveSubProcessId(...c.args) : deriveBoundaryStateId(...c.args);
      expect(result, c.id).toBe(c.result);
    });
  });
});
