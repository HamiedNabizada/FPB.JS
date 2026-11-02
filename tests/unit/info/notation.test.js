import { describe, it, expect } from 'vitest';

import { NOTATION, NOTATION_FLOWS } from '../../../app/fpb/info/notation.js';

/**
 * The notation reference in "Information" (016e V14): every element of
 * VDI 3682 Blatt 1 (section 4.1, figure 3) with its symbol and one sentence.
 */

describe('NOTATION', () => {

  it('lists the elements of VDI 3682 Blatt 1 in their order', () => {
    expect(NOTATION.map((entry) => entry.id)).toEqual([
      'product', 'energy', 'information', 'processOperator', 'technicalResource', 'systemLimit', 'flow', 'usage'
    ]);
  });

  it('gives every element a name, a symbol and one sentence', () => {
    NOTATION.forEach((entry) => {
      expect(entry.name).toBeTruthy();
      expect(entry.symbol).toBeTruthy();
      expect(entry.text).toMatch(/^[A-Z][^.]*\.$/);
    });
  });

  it('draws the shapes with the symbols of the palette', () => {
    const symbols = Object.fromEntries(NOTATION.map((entry) => [entry.id, entry.symbol]));
    expect(symbols).toEqual({
      product: 'icon-fpb-product',
      energy: 'icon-fpb-energy',
      information: 'icon-fpb-information',
      processOperator: 'icon-fpb-processoperator',
      technicalResource: 'icon-fpb-technicalresource',
      systemLimit: 'icon-fpb-systemlimit',
      flow: 'arrow',
      usage: 'double-arrow'
    });
  });

  it('keeps the sentence of the process operator from the guideline', () => {
    expect(NOTATION.find((entry) => entry.id === 'processOperator').text)
      .toBe('Converts products, energies and information into new ones; only process operators can be decomposed.');
  });

  // final review 016e D3, I5: no more than VDI 3682 Blatt 1, section 4.1
  it('keeps the other sentences close to the guideline', () => {
    const text = (id) => NOTATION.find((entry) => entry.id === id).text;
    expect(text('product')).toBe('The generic term under which streams of materials, substances and the like can also be described.');
    expect(text('technicalResource')).toBe('An asset with which a process operator carries out its conversion.');
    expect(text('systemLimit')).toBe('Marks the limit of the process under consideration with a dashed frame.');
  });

  it('says how parallel and alternative flows are drawn', () => {
    expect(NOTATION_FLOWS).toBe('Parallel and alternative flows have no symbols of their own: parallel flows share part of their way, alternative flows run apart.');
  });
});
