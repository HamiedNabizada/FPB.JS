import { describe, it, expect } from 'vitest';

import { validateFileName, defaultFileName } from '../../../app/fpb/files/fileName.js';

/**
 * File names of exports and downloads (016e D2): checked and cleaned as in
 * the export dialog before 2.0; by default the name of the project.
 */

describe('validateFileName', () => {

  it('takes a valid name as it is, without the spaces around it', () => {
    expect(validateFileName('  modell  ')).toEqual({ valid: true, error: null, sanitized: 'modell' });
  });

  it('flags an empty name and falls back to FPB', () => {
    expect(validateFileName('   ')).toEqual({ valid: false, error: 'Filename cannot be empty', sanitized: 'FPB' });
  });

  it('flags a reserved name and falls back to FPB', () => {
    expect(validateFileName('con')).toEqual({ valid: false, error: '"con" is a reserved filename', sanitized: 'FPB' });
  });

  it('replaces invalid characters, again and again', () => {
    expect(validateFileName('a<b>c:d|e?f*g')).toEqual({ valid: false, error: 'Filename contains invalid characters', sanitized: 'a_b_c_d_e_f_g' });
    expect(validateFileName('a/b').sanitized).toBe('a_b');
    expect(validateFileName('a\\b').sanitized).toBe('a_b');
  });

  it('cuts a name to 200 characters', () => {
    const result = validateFileName('x'.repeat(230));
    expect(result.error).toBe('Filename is too long (max 200 characters)');
    expect(result.sanitized).toBe('x'.repeat(200));
  });
});

describe('defaultFileName', () => {

  const modeler = (name) => ({ getProjectDefinition: () => (name === undefined ? null : { name }) });

  it('is the name of the project', () => {
    expect(defaultFileName(modeler('Temperieren'))).toBe('Temperieren');
  });

  it('is FPB without a project or with an empty name', () => {
    expect(defaultFileName(modeler(undefined))).toBe('FPB');
    expect(defaultFileName(modeler(''))).toBe('FPB');
  });

  it('is cleaned like a typed name', () => {
    expect(defaultFileName(modeler('a/b'))).toBe('a_b');
  });
});
