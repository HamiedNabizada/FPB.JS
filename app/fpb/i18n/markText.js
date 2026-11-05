/**
 * Marks an English text as a key of the catalog without translating it, like
 * N_ in gettext (016h T13): texts in tables and other keys that reach
 * translate() only later. The completeness test of the catalog finds them by
 * this call.
 */
export function markText(text) {
  return text;
}
