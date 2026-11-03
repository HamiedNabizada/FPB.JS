import { describe, it, expect } from 'vitest';

import { exampleName, isAmlUrl } from '../../../app/fpb/start/exampleName.js';

/**
 * The file name an example opens with, from its URL and its content
 * (016g F4): the path without query and fragment, a name that cannot be
 * decoded as it is, and an ending from the content when the URL has none.
 */
describe('exampleName', () => {

  it('takes the last part of the path without query and fragment', () => {
    expect(exampleName('/x/a.json?v=2', '{}')).toBe('a.json');
    expect(exampleName('https://host/x/b.xml#top', '<fpb/>')).toBe('b.xml');
  });

  it('decides AML by the path, not by query or fragment', () => {
    expect(isAmlUrl('/x/b.aml#top')).toBe(true);
    expect(isAmlUrl('/x/b.AML?v=1')).toBe(true);
    expect(isAmlUrl('/x/b.json?f=.aml')).toBe(false);
    expect(isAmlUrl('/x/b.json#.aml')).toBe(false);
  });

  it('keeps a name that cannot be decoded', () => {
    expect(exampleName('/x/%E0%A4%A.json', '{}')).toBe('%E0%A4%A.json');
    expect(exampleName('/x/Temperieren%20neu.json', '{}')).toBe('Temperieren neu.json');
  });

  it('gives a name without a known ending one from the content', () => {
    expect(exampleName('/api/model', '{"a":1}')).toBe('model.json');
    expect(exampleName('/api/model', '<?xml version="1.0"?><CAEXFile SchemaVersion="3.0">')).toBe('model.aml');
    expect(exampleName('/api/model', '  <fpb/>')).toBe('model.xml');
    expect(exampleName('/', '{}')).toBe('example.json');
  });
});
