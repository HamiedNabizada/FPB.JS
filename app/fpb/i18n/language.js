/**
 * Pure helpers of the translation (016h T1, T3): which language a value
 * names, placeholders filled as in diagram-js, and messages whose values are
 * messages of their own.
 */

/** The languages FPB.js speaks; English is the key of every text */
export const LANGUAGES = ['en', 'de'];

/**
 * 'en' or 'de' for a value that names one, in any case and with a region
 * ('de-AT', 'en_GB'); null for anything else.
 */
export function normalizeLanguage(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^([a-z]{2})(?:[-_][a-z0-9]+)*$/.exec(value.trim().toLowerCase());
  return match && LANGUAGES.indexOf(match[1]) !== -1 ? match[1] : null;
}

/**
 * The template with each {name} replaced by replacements[name]; a placeholder
 * without a value stays as it is (as the translate of diagram-js does).
 */
export function fill(template, replacements) {
  const values = replacements || {};
  return template.replace(/{([^}]+)}/g, function (whole, key) {
    const value = values[key];
    return value === undefined || value === null ? whole : String(value);
  });
}

/**
 * A message in the language of `translate`: { template, args } is translated,
 * a value in args that is itself { template, args } first; strings and
 * numbers in args are data and stay. A message without template gives its
 * `message` (or itself, if it is a string) unchanged.
 */
export function translateMessage(translate, message) {
  if (message === null || message === undefined) {
    return '';
  }
  if (typeof message === 'string') {
    return message;
  }
  if (typeof message.template !== 'string') {
    return message.message === undefined ? '' : String(message.message);
  }
  const args = {};
  Object.keys(message.args || {}).forEach(function (key) {
    const value = message.args[key];
    args[key] = value && typeof value === 'object' ? translateMessage(translate, value) : value;
  });
  return translate(message.template, args);
}
