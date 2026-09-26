/**
 * Is a text an AutomationML (CAEX) document? Its root element is CAEXFile.
 * Kept apart from AmlSupport, so the import dialog can tell AML files without
 * loading the AML module (and with it the engine).
 */
export function isAmlText(content) {
  const text = String(content);
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.substring(1) : text;
  return /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<CAEXFile\b/.test(withoutBom);
}
