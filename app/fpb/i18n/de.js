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
  '{count} notes': '{count} Hinweise',

  // --- element types (i18n/typeNames.js, menus, search, VDI 3682 Blatt 1) ---
  'Product': 'Produkt',
  'Energy': 'Energie',
  'Information': 'Information',
  'ProcessOperator': 'Prozessoperator',
  'Process operator': 'Prozessoperator',
  'TechnicalResource': 'Technische Ressource',
  'Technical resource': 'Technische Ressource',
  'SystemLimit': 'Systemgrenze',
  'System limit': 'Systemgrenze',
  'Flow': 'Fluss',
  'ParallelFlow': 'Paralleler Fluss',
  'AlternativeFlow': 'Alternativer Fluss',
  'Usage': 'Nutzung',
  'Process': 'Prozess',
  'label': 'Beschriftung',
  'Parallel branching': 'Parallele Verzweigung',
  'Alternative branching': 'Alternative Verzweigung',

  // --- palette (palette/PaletteConstants.js) ---
  'Add System Limit': 'Systemgrenze hinzufügen',
  'Add Product': 'Produkt hinzufügen',
  'Add Energy': 'Energie hinzufügen',
  'Add Information': 'Information hinzufügen',
  'Add Process Operator': 'Prozessoperator hinzufügen',
  'Add Technical Resource': 'Technische Ressource hinzufügen',
  'Activate Select Tool': 'Auswahlwerkzeug aktivieren',
  'Activate Lasso Tool': 'Lassowerkzeug aktivieren',
  'Activate the create/remove space tool': 'Werkzeug zum Einfügen und Entfernen von Platz aktivieren',
  'Activate the hand tool': 'Handwerkzeug aktivieren',

  // --- context pad (context-pad/ContextPadConstants.js) ---
  'Remove {type}': '{type} entfernen',
  'Connect {type} with ProcessOperator': '{type} mit Prozessoperator verbinden',
  'Parallel used {type}': '{type} parallel verbinden',
  'Alternative Process': 'Alternativer Prozessablauf',
  'Connect {type} with Product, Energy or Information': '{type} mit Produkt, Energie oder Information verbinden',
  'Parallel Process': 'Paralleler Prozessablauf',
  'Connect Process Operator with a Technical Resource': 'Prozessoperator mit einer Technischen Ressource verbinden',
  'Decompose this ProcessOperator': 'Diesen Prozessoperator dekomponieren',
  'Connect Technical Resource with a Process Operator': 'Technische Ressource mit einem Prozessoperator verbinden',
  'Switch to parent process': 'Zum übergeordneten Prozess wechseln',
  'Compose SystemLimit': 'Systemgrenze komponieren',
  'Alternative Flow': 'Alternativer Fluss',
  'Change type': 'Typ ändern',
  'Append a connected element below': 'Verbundenes Element darunter anhängen',
  'Applying the diagram to the AML file removes them.': 'Das Übernehmen des Diagramms in die AML-Datei entfernt sie.',

  // --- hints while modeling (modeling/behavior/ModelingFeedback.js) ---
  'Product, energy and information must be on or within the system limit': 'Produkt, Energie und Information müssen auf oder innerhalb der Systemgrenze liegen',
  'Process operators must be within the system limits.': 'Prozessoperatoren müssen innerhalb der Systemgrenze liegen.',
  'Technical resources must be outside the system limits.': 'Technische Ressourcen müssen außerhalb der Systemgrenze liegen.',
  'This state represents an input/output of the decomposed process operator and must remain on the system boundary.': 'Dieser Zustand ist ein Ein- oder Ausgang des dekomponierten Prozessoperators und muss auf der Systemgrenze bleiben.',
  'Switching between processes is purely for navigation purposes. The decomposition and composition functionalities are used to transfer changes to higher and lower process levels.': 'Der Wechsel zwischen Prozessen dient nur der Navigation. Änderungen übertragen Dekomposition und Komposition auf höhere und tiefere Ebenen.',
  'You are not allowed to move {src} on {target}': '{src} darf nicht auf {target} verschoben werden',
  'You are not allowed to place a {src} on a {target}': '{src} darf nicht auf {target} platziert werden',
  'This element cannot be deleted.': 'Dieses Element kann nicht gelöscht werden.',
  'The decomposition of "{po}" has been removed.': 'Die Dekomposition von "{po}" wurde entfernt.',
  'The deleted ProcessOperator had decomposed views. These were all deleted with.': 'Der gelöschte Prozessoperator hatte Dekompositionen. Sie wurden mit gelöscht.',
  'The ProcessOperator has a decomposed view. The connected state is placed on its system boundary as soon as the decompose icon is clicked again.': 'Der Prozessoperator ist dekomponiert. Der verbundene Zustand kommt auf dessen Systemgrenze, sobald du das Symbol zum Dekomponieren wieder anklickst.',
  'The deleted connection was connected to a decomposed ProcessOperator. The connected state is thus deleted in the decomposed view.': 'Die gelöschte Verbindung hing an einem dekomponierten Prozessoperator. Der verbundene Zustand wird deshalb auch in der Dekomposition gelöscht.',

  // --- canvas: preview, screen readers, search ---
  'Click to open this layer': 'Klicke, um diese Ebene zu öffnen',
  '{name}: {count} elements': '{name}: {count} Elemente',
  'Decomposition': 'Dekomposition',
  'Process diagram, editable drawing area': 'Prozessdiagramm, bearbeitbare Zeichenfläche',
  'No element found': 'Kein Element gefunden',
  '{type} in {layer}': '{type} in {layer}'
};

export default de;
