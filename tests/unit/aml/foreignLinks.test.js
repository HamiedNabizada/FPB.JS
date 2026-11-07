// tests/unit/aml/foreignLinks.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CAEXDocument } from 'amlengine-js';

import { findFpdInstanceHierarchies, convertCaexToFpbJson } from '../../../app/fpb/aml/mapper/CaexToFpbJson.js';
import { findForeignLinks, buildFpdElementIndex, amlLinkList } from '../../../app/fpb/aml/foreignLinks.js';

/**
 * B19: the links the export removes, placed on the layer and element of the
 * diagram as the plugin places them (FpdElementIndex, AmlLinkList). Each
 * entry must name a layer and an element the import of the same hierarchy
 * gives FPB.js: the process itself or an element of it.
 */
const base = path.join(__dirname, 'oracle');
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'cases.json'), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(base, rel), 'utf8').replace(/^﻿/, '');

function listOf(text, i) {
  const doc = CAEXDocument.loadFromString(text);
  const ih = findFpdInstanceHierarchies(doc)[i];
  return { doc, ih, list: amlLinkList(findForeignLinks(doc, ih), buildFpdElementIndex(ih)) };
}

describe('foreignLinks: placing the links on the diagram', () => {
  manifest.cases.filter((c) => c.kind === 'foreignlinks').forEach((c) => {
    it('every entry lies on a layer and element of the import: ' + c.id, () => {
      const { doc, ih, list } = listOf(read(c.aml), c.hierarchy);
      const model = JSON.parse(convertCaexToFpbJson(doc, ih).value);
      const layers = new Map(model.filter((e) => e.process).map((e) => [e.process.id, e]));
      list.forEach((entry) => {
        const layer = layers.get(entry.processId);
        expect(layer, entry.link + ' on ' + entry.processId).toBeTruthy();
        const ids = [layer.process.id, ...layer.elementDataInformation.map((d) => d.id)];
        expect(ids, entry.link + ' to ' + entry.elementId).toContain(entry.elementId);
      });
    });
  });

  it('places the copy of a boundary state on its own layer, under the id of the state', () => {
    const { list } = listOf(read('inputs/generated/links.aml'), 0);
    const pick = (link) => list.filter((e) => e.link === link).map(({ processId, elementId }) => ({ processId, elementId }));

    // the state on the top layer, through a sensor below it
    expect(pick('L_Sensor')).toEqual([{ processId: 'ea7afbcf-2f9f-482b-b62e-8f5fe707be30', elementId: '8891b025-4d01-3179-be62-74c48ee6c819' }]);
    // the copy of the boundary state on the lowest layer, which carries the id of its operator
    expect(pick('L_Kopie')).toEqual([{ processId: '6d37cff1-a715-266d-7750-8ee6e7574a4c', elementId: 'dd4eb84c-c312-509d-25a0-10a5872a370e' }]);
    // the process of that layer: the layer itself
    expect(pick('L_Prozess')).toEqual([{ processId: '6d37cff1-a715-266d-7750-8ee6e7574a4c', elementId: '6d37cff1-a715-266d-7750-8ee6e7574a4c' }]);
  });
});
