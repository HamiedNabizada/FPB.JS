import XMLMapper from '../xml/XMLMapper.js';
import { isAmlText } from '../aml/detect.js';

/**
 * Reading a file for "Open" (016e V8): the extension and the size first,
 * then the content decides what it is. The texts are those of the import
 * dialog before 2.0; callers translate them.
 */

export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * An error for a file that is not even read, or null.
 *
 * @param {{ name: string, size: number }} file
 * @param {{ aml: boolean }} options with the AML module, .aml files too
 * @return {null|{ message: string, details: string }}
 */
export function checkFile(file, { aml }) {
  const name = String(file.name || '').toLowerCase();
  const extensions = aml ? ['.json', '.xml', '.aml'] : ['.json', '.xml'];
  if (!extensions.some((extension) => name.endsWith(extension))) {
    return {
      message: 'Invalid file type',
      details: aml
        ? 'Please select a valid JSON (.json), XML (.xml) or AutomationML (.aml) file'
        : 'Please select a valid JSON (.json) or XML (.xml) file'
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      message: 'File too large',
      details: 'The selected file is too large. Maximum file size is 50MB.'
    };
  }
  return null;
}

/**
 * What a text holds. The content decides, not the name: FPB.js JSON in a
 * file named .xml is JSON. JSON of another kind is passed on as JSON, the
 * importer judges it.
 *
 * @param {string} text
 * @param {{ aml?: { inspect(text: string): Promise<Array> }, convertXml(text: string): Promise<*> }} options
 * @return {Promise<{ kind: 'json', data: * }|{ kind: 'xml', data: * }|{ kind: 'aml', text: string, hierarchies: Array }>}
 */
export async function parseModelText(text, { aml, convertXml }) {
  if (isAmlText(text)) {
    if (!aml) {
      throw new Error('AutomationML files are not supported in this installation of FPB.js.');
    }
    return { kind: 'aml', text, hierarchies: await aml.inspect(text) };
  }

  const type = XMLMapper.detectFileType(text);
  if (type === 'fpb-json') {
    return { kind: 'json', data: JSON.parse(text) };
  }
  if (type === 'vdi-xml') {
    return { kind: 'xml', data: await convertXml(text) };
  }
  try {
    return { kind: 'json', data: JSON.parse(text) };
  } catch (error) {
    throw new Error('File format not recognized. Please select a valid FPB.js JSON file or XML file.');
  }
}

/** The text of a file; rejects when the browser cannot read it */
export function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('File read error'));
    reader.readAsText(file);
  });
}
