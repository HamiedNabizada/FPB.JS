import TranslateModule from 'diagram-js/lib/i18n/translate';

import I18n from './I18n';

/**
 * English and German for FPB.js (016h T1). Replaces diagram-js'
 * i18n/translate: `translate` keeps its form (template, replacements), so
 * every caller stays as it is, and a host may still put a translate of its
 * own in additionalModules.
 *
 * Modules of diagram-js (palette, context pad, popup menu) depend on their
 * translate module. didi loads each module once, its dependencies first, and
 * a later definition of a service wins: depending on it here loads it before
 * this module, so this translate replaces it and none comes after.
 */
export default {
  __depends__: [TranslateModule],
  __init__: ['fpbI18n'],
  fpbI18n: ['type', I18n],
  translate: ['factory', ['fpbI18n', function (fpbI18n) {
    return function translate(template, replacements) {
      return fpbI18n.translate(template, replacements);
    };
  }]]
};
