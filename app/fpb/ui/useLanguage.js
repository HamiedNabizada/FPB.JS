import { useModelerState } from './useModelerState';

/**
 * The language in effect for a Preact root (016h T4): reading it makes the
 * root draw again on `i18n.changed`, and with it everything below that asks
 * translate. Without the language module (a host's own translate) 'en'.
 */
export function useLanguage(modeler) {
  return useModelerState(modeler, 'i18n.changed', function () {
    const i18n = modeler.get('fpbI18n', false);
    return i18n ? i18n.get() : 'en';
  });
}
