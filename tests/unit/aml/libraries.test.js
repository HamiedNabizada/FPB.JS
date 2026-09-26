// tests/unit/aml/libraries.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CAEXDocument } from 'amlengine-js';

import { ensureLibraries } from '../../../app/fpb/aml/mapper/libraries.js';
import { buildDiagramInterchangeDocument } from '../../../app/fpb/aml/mapper/diagramInterchange.js';
import { fixedEnvironment } from '../../../app/fpb/aml/mapper/environment.js';
import { maskRandomGuids } from './oracleMask.js';

const oracle = path.join(__dirname, 'oracle');
const decode = (bytes) => new TextDecoder().decode(bytes);

/** The library elements of a saved document, in document order */
function libraries(xml) {
  const parts = [];
  const re = /<(InterfaceClassLib|RoleClassLib|AttributeTypeLib|SystemUnitClassLib|ExternalReference)\b[\s\S]*?(?:\/>|<\/\1>)/g;
  for (const m of xml.matchAll(re)) {
    parts.push(m[0]);
  }
  return maskRandomGuids(parts.join('\n'));
}

describe('FPD libraries of the mapper port', () => {

  it('are the libraries the C# mapper writes on Convert', () => {
    const expected = fs.readFileSync(path.join(oracle, 'expected', 'convert', 'fpbjs-temperieren.aml'), 'utf8');
    const doc = CAEXDocument.new_CAEXDocument();
    const restore = fixedEnvironment();
    try {
      ensureLibraries(doc.caexFile);
    } finally {
      restore();
    }
    expect(libraries(decode(doc.saveToStream(true)))).toBe(libraries(expected));
  });

  it('adds nothing to a document that has them', () => {
    const doc = CAEXDocument.new_CAEXDocument();
    ensureLibraries(doc.caexFile);
    const once = decode(doc.saveToStream(true));
    ensureLibraries(doc.caexFile);
    expect(decode(doc.saveToStream(true))).toBe(once);
  });

  it('builds the OMG_DD library document', () => {
    const restore = fixedEnvironment();
    try {
      const xml = decode(buildDiagramInterchangeDocument().saveToStream(true));
      expect(xml).toContain('OMG_DD_AttributeTypeLib');
      expect(xml).toContain('DD_Waypoint');
    } finally {
      restore();
    }
  });
});
