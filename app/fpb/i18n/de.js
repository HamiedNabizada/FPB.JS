/**
 * German texts of FPB.js, keyed by their English (016h T2). Terms of VDI/VDE
 * 3682 Blatt 1 and 2 as the guideline names them (016h V7); "du" and the
 * imperative as in the AutomationML plugins. A test sees to it that every
 * key in the code has an entry here and that no entry is left unused.
 */
const de = {

  // --- toolbar (toolbar/) ---
  'The toolbar stopped working. Details are in the console.': 'Die Symbolleiste funktioniert nicht mehr. Einzelheiten stehen in der Konsole.',
  'New model': 'Neues Modell',
  'New model (not in read-only mode)': 'Neues Modell (nicht im Nur-Lese-Modus)',
  'Open ({key}+O)': 'Öffnen ({key}+O)',
  'Open (not in read-only mode)': 'Öffnen (nicht im Nur-Lese-Modus)',
  'Save ({key}+S)': 'Speichern ({key}+S)',
  'Export': 'Exportieren',
  'AML file': 'AML-Datei',
  'Start a new model?': 'Neues Modell beginnen?',
  'The current model will be removed from the editor.': 'Das aktuelle Modell wird aus dem Editor entfernt.',
  'Changes that you have not downloaded are lost.': 'Änderungen, die du nicht heruntergeladen hast, gehen verloren.',
  'Start new model': 'Neues Modell beginnen',
  'Layers': 'Ebenen',
  'Model check (VDI 3682): {counts}': 'Modellprüfung (VDI 3682): {counts}',
  'Properties': 'Eigenschaften',
  'Hide layers': 'Ebenen ausblenden',
  'Show layers': 'Ebenen einblenden',
  'Search all layers': 'Alle Ebenen durchsuchen',
  'Search all layers ({key}+F)': 'Alle Ebenen durchsuchen ({key}+F)',
  'Project': 'Projekt',
  'Switch to Light Mode': 'Helle Darstellung',
  'Switch to Dark Mode': 'Dunkle Darstellung',
  'Back to the colours of VDI 3682': 'Zurück zu den Farben der VDI 3682',
  'Colours for colour vision deficiency': 'Farben bei Farbsehschwäche',
  'Show information and help': 'Information und Hilfe',

  // --- keys (info/keyboardShortcuts.js, 016h V8) ---
  'key: Ctrl': 'Strg',
  'key: Shift': 'Umschalt',
  'key: Alt': 'Alt',
  'key: Delete': 'Entf',
  'key: Backspace': 'Rücktaste',
  'key: Escape': 'Esc',
  'key: Space': 'Leertaste',
  'key: Mouse': 'Maus',
  'key: Arrow Keys': 'Pfeiltasten',

  // --- counts of the model check (validation/FpbValidation.js) ---
  '{count} error': '{count} Fehler',
  '{count} errors': '{count} Fehler',
  '{count} warning': '{count} Warnung',
  '{count} warnings': '{count} Warnungen',
  '{count} note': '{count} Hinweis',
  '{count} notes': '{count} Hinweise'
};

export default de;
