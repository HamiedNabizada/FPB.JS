import { describe, it, expect, vi } from 'vitest';

import { MAX_FILE_SIZE, checkFile, parseModelText } from '../../../app/fpb/files/readModelFile.js';

/**
 * Reading a model file for "Open" (016e V8): the extension and the size are
 * checked first, then the content decides whether it is FPB.js JSON, VDI 3682
 * XML or AutomationML. The texts are those of the import dialog before 2.0.
 */

const FPB_JSON = JSON.stringify([{ $type: 'fpb:Project', name: 'P' }]);
const VDI_XML = '<?xml version="1.0"?><project xmlns="http://www.vdivde.de/3682" name="P"></project>';
const AML = '<?xml version="1.0" encoding="utf-8"?><CAEXFile FileName="a.aml"></CAEXFile>';

const convertXml = vi.fn(async () => [{ $type: 'fpb:Project', name: 'from xml' }]);

describe('checkFile', () => {

  it('takes .json and .xml, whatever the case', () => {
    expect(checkFile({ name: 'a.json', size: 10 }, { aml: false })).toBeNull();
    expect(checkFile({ name: 'A.XML', size: 10 }, { aml: false })).toBeNull();
  });

  it('refuses other extensions', () => {
    const error = checkFile({ name: 'a.txt', size: 10 }, { aml: false });
    expect(error.message).toBe('Invalid file type');
    expect(error.details).toBe('Please select a valid JSON (.json) or XML (.xml) file');
  });

  it('takes .aml only with the AML module', () => {
    expect(checkFile({ name: 'a.aml', size: 10 }, { aml: false }).message).toBe('Invalid file type');
    expect(checkFile({ name: 'a.aml', size: 10 }, { aml: true })).toBeNull();
    expect(checkFile({ name: 'a.txt', size: 10 }, { aml: true }).details)
      .toBe('Please select a valid JSON (.json), XML (.xml) or AutomationML (.aml) file');
  });

  it('refuses a file over 50 MB', () => {
    const error = checkFile({ name: 'a.json', size: MAX_FILE_SIZE + 1 }, { aml: false });
    expect(error.message).toBe('File too large');
    expect(error.details).toBe('The selected file is too large. Maximum file size is 50MB.');
  });
});

describe('parseModelText', () => {

  it('reads FPB.js JSON', async () => {
    const result = await parseModelText(FPB_JSON, { convertXml });
    expect(result.kind).toBe('json');
    expect(result.data[0].name).toBe('P');
  });

  it('converts VDI 3682 XML', async () => {
    const result = await parseModelText(VDI_XML, { convertXml });
    expect(result).toEqual({ kind: 'xml', data: [{ $type: 'fpb:Project', name: 'from xml' }] });
    expect(convertXml).toHaveBeenCalledWith(VDI_XML);
  });

  it('lets the content decide: FPB.js JSON in a file named .xml is JSON', async () => {
    expect((await parseModelText(FPB_JSON, { convertXml })).kind).toBe('json');
  });

  it('reads the process views of an AML file with the AML module', async () => {
    const aml = { inspect: vi.fn(async () => [{ id: 'ih1', name: 'View 1' }]) };
    const result = await parseModelText(AML, { aml, convertXml });
    expect(result).toEqual({ kind: 'aml', text: AML, hierarchies: [{ id: 'ih1', name: 'View 1' }] });
  });

  it('refuses an AML file without the AML module', async () => {
    await expect(parseModelText(AML, { convertXml }))
      .rejects.toThrow('AutomationML files are not supported in this installation of FPB.js.');
  });

  it('refuses text that is no model', async () => {
    await expect(parseModelText('hello', { convertXml }))
      .rejects.toThrow('File format not recognized. Please select a valid FPB.js JSON file or XML file.');
  });

  it('takes JSON of another kind as JSON, the importer judges it', async () => {
    const result = await parseModelText('[{"a":1}]', { convertXml });
    expect(result).toEqual({ kind: 'json', data: [{ a: 1 }] });
  });
});
