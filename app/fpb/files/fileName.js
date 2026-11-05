import { markText } from '../i18n/markText';
import { fill } from '../i18n/language';


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
/** A name that is not valid: `error` in English, `message` for translateMessage */
function problem(template, args, sanitized) {
  return { valid: false, error: fill(template, args), message: { template, args }, sanitized };
}

export function validateFileName(name) {
  if (!name || name.trim() === '') {
    return problem(markText('Filename cannot be empty'), {}, 'FPB');
  }
  const trimmed = name.trim();
  if (RESERVED.includes(trimmed.toUpperCase())) {
    return problem(markText('"{name}" is a reserved filename'), { name: trimmed }, 'FPB');
  }
  if (INVALID_CHARS.test(trimmed)) {
    return problem(markText('Filename contains invalid characters'), {}, trimmed.replace(INVALID_CHARS_ALL, '_'));
  }
  if (trimmed.length > MAX_LENGTH) {
    return problem(markText('Filename is too long (max {max} characters)'), { max: MAX_LENGTH }, trimmed.substring(0, MAX_LENGTH));
  }
  return { valid: true, error: null, sanitized: trimmed };
}

/** The name of the project as a file name, "FPB" without one */
export function defaultFileName(fpbjs) {
  const project = fpbjs.getProjectDefinition && fpbjs.getProjectDefinition();
  const name = project && project.name;
  return name ? validateFileName(String(name)).sanitized : 'FPB';
}
