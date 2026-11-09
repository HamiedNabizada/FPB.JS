# Upgrading to FPB.JS 2.0

For hosts that embed FPB.JS with `createFpbModeler`. The contract is `types/fpbjs.d.ts`.

## Files

Models stay compatible: 2.0 opens JSON, VDI 3682 XML and AutomationML files of 1.x, and writes the same JSON format. Some things 1.x let you draw are refused while drawing now (see "Modeling rules"); files that contain them still open, and the model check reports them.

## Breaking changes

**Dependencies**
- React and react-dom are no peer dependencies any more. `fpbjs.js` needs no global `React`, `fpbjs.esm.js` imports neither; import maps and script tags for React can go.
- FPB.JS no longer puts Bootstrap 5 into the page. A host that used Bootstrap through FPB.JS loads it itself. FPB.JS keeps its base styles inside its own containers and dialogs.
- `dist/css/diagram-js.css` is gone; the diagram-js styles come with the bundle. `dist/css/fpbjs.css` and `dist/css/dark-mode.css` stay; the Bootstrap classes in `dark-mode.css` are removed.

**Properties panel** (now Preact, `@bpmn-io/properties-panel`)
- The option `propertiesConfig` and the export `defaultPropertiesConfig` are gone (a warning is logged, the option has no effect). Leave out `propertiesContainer` to have no panel.
- `getClasses().PropertiesPanel` takes `{ container, modeler }`. Toggle `#propertiesPanelToggle` (was `#openPropertiesPanelButton`), fields `#bio-properties-panel-<id>` (was `#pp_identification_…`).

**Toolbar and layers** (`layerContainer`, now Preact)
- Classes: `.fpb-toolbar` (was `.layerPanel`), `.fpb-toolbar-button` (was Bootstrap `.btn`), `.fpb-layers`; the layer tree is `.fpb-layers-tree` (react-arborist and its `.arborist-*` classes are gone). Button ids stay.
- Every layer keeps its own zoom and position; FPB.JS sets the view after `process.switched`, so a host that zooms there is overridden.

**Questions, messages, files**
- The modeler answers `confirmation.required` itself with a native `<dialog>`. Hosts that answered it themselves turn this off with `confirmations: false`.
- Messages appear as a stack in the canvas container (`.fpb-notification`); `.alert-danger`, `.import-report` and the Bootstrap modals are gone.
- New service `fpbFiles` (`open`, `save`, `saveAs`, `export`, `bindKeys`). Ctrl+O, Ctrl+S and Ctrl+Shift+S work in every host, and a file dropped on the canvas opens; `files: false` removes Open and Save.
- Export to the host as an event needs the option `exportEvent`; the dialog has no "Event" checkbox any more.

**Images and exports**
- `toPNG` and `toPDF` leave a margin of 20 px around the drawing (before scaling). Use `margin: 0` for the old size.
- PDF pages are named like the layers (project name on top, operator names below); images in the PDF are compressed.
- JSON with the scope "Current layer" is a model of its own: `[project, layer]` with the layer as top layer, operators without their layers below. 1.x wrote the single process entry.

**Theme and language**
- `data-theme` and `lang` go on the containers of FPB.JS, not on `<html>`. The stored choice moved from `fpb-theme` to `fpbjs.theme`.

## New

- Options `theme` (`'light' | 'dark' | 'system'`), `language` (`'en' | 'de' | 'user'`), `sheets` (bottom sheets on narrow touch screens), `validation: { list: false }`, `examples`, `startCard`, `showNewModel`, `confirmations`, `files`, `exportEvent`.
- Methods `setTheme`, `getLanguage`, `setLanguage`, `getFindings`, `getCheckedRules`, `setValidationMarkers`, `select(id, { process })`, `getCurrentProcess`, `setAmlLinks`; events `theme.changed`, `i18n.changed`.
- Breadcrumbs on the canvas, Alt+Arrow keys to enter and leave layers, a start card on the empty canvas.
- AutomationML add-on (`fpbjs/aml`): a process view without an id is keyed by its place (`'#1'`); the delete question names the links of the file the export removes.

## Model check and modeling rules

- `getCheckedRules()` returns 23 codes. An element without a name reports `D7` (warning) instead of `D3`, `D4`, `D5` (info); version and revision (`D8`) come as one note per layer.
- Refused while drawing: a second system limit on a layer, dropping onto a label, a flow whose reverse exists (a state is no input and output of the same operator; provisional, for the VDI 3682 committee), dragging an end of a connection into another kind of connection, appending to an output of a decomposed layer.
- A new model is called "New project" (German "Neues Projekt") instead of "FPBJS_Project".

## 2.1

Mostly additions. A host that ignores the return values of the imports and waits for `import.done` works as with 2.0. Check these if you rely on them:

- **`importXML` and `importAML` resolve later.** In 2.0 they returned a promise that resolved as soon as the import had started, also for content the importer refused. Since 2.1 it resolves when the model is on the canvas and rejects when the content is refused. Code that awaited the call and only then waited for `import.done` would wait forever: register the `import.done` listener before the call, or use the promise alone. A refused import now throws inside an `async` function that awaits it.
- **Types:** `toJSON()` returns `ProjectData` and `ProcessData` (ids, not shapes), so it is no longer assignable to `(ProjectDefinition | ProcessEntry)[]`. The element type of the project is `'fpb:Project'`; `'fpb:ProjectDefinition'` is gone (no such type exists). `importJSON(fpb.toJSON())` still compiles.

What is new:

- `importJSON`, `importXML` resolve with `{ warnings, findings }` once the model is on the canvas and reject with an `FpbImportError` (`code`: `INVALID_DATA_STRUCTURE`, `MISSING_PROJECT_DEFINITION`, ..., `SUPERSEDED` when a newer import replaced the model first). `importAML` resolves after the import as well and carries `findings` and `report`. Ignoring the promise logs nothing.
- An import that a newer one replaced before it was done tells the screen nothing any more (no switch to its layer, no `import.done`). `import.report`, `import.done` and `import.error` carry the `run` of their import.
- `on()` returns a function that removes the listener.
- `isDirty()`, `markSaved(saved?)`, events `model.changed` (edits only) and `model.dirtyChanged` (`{ dirty }`). Pass the data of `toJSON()` you saved to `markSaved`, so edits made while it was written stay unsaved. `'changed'` stays as it was and is deprecated: it also fires for a layer switch.
- Deprecated, removed in 3.0: `addFpbElements` (warns once), the placeholders `FpbModeler`, `PropertiesPanel`, `LayerOverview` and `defaultConfig` of the main entry (use `createFpbModeler` or `getClasses()`).
- The VDI 3682 XML export keeps a setpoint of 0.
