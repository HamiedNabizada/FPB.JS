/**
 * File names of exports and downloads (016e D2), checked and cleaned as the
 * export dialog did before 2.0 (Windows and Unix).
 */

// characters no file name may hold; without the g flag, test() keeps no state
const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/;
const INVALID_CHARS_ALL = /[<>:"/\\|?*\x00-\x1f]/g;

const RESERVED = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

const MAX_LENGTH = 200;

/**
 * @param {string} name as typed
 * @return {{ valid: boolean, error: string|null, sanitized: string }} the
 *   name to use in `sanitized`, also when it is not valid
 */
export function validateFileName(name) {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Filename cannot be empty', sanitized: 'FPB' };
  }
  const trimmed = name.trim();
  if (RESERVED.includes(trimmed.toUpperCase())) {
    return { valid: false, error: `"${trimmed}" is a reserved filename`, sanitized: 'FPB' };
  }
  if (INVALID_CHARS.test(trimmed)) {
    return { valid: false, error: 'Filename contains invalid characters', sanitized: trimmed.replace(INVALID_CHARS_ALL, '_') };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { valid: false, error: `Filename is too long (max ${MAX_LENGTH} characters)`, sanitized: trimmed.substring(0, MAX_LENGTH) };
  }
  return { valid: true, error: null, sanitized: trimmed };
}

/** The name of the project as a file name, "FPB" without one */
export function defaultFileName(fpbjs) {
  const project = fpbjs.getProjectDefinition && fpbjs.getProjectDefinition();
  const name = project && project.name;
  return name ? validateFileName(String(name)).sanitized : 'FPB';
}
