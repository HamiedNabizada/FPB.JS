import I18n from './I18n';

/**
 * English and German for FPB.js (016h T1). Replaces diagram-js'
 * i18n/translate: `translate` keeps its form (template, replacements), so
 * every caller stays as it is, and a host may still put a translate of its
 * own in additionalModules.
 */
export default {
  __init__: ['fpbI18n'],
  fpbI18n: ['type', I18n],
  translate: ['factory', ['fpbI18n', function (fpbI18n) {
    return function translate(template, replacements) {
      return fpbI18n.translate(template, replacements);
    };
  }]]
};
