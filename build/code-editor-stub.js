/**
 * Stand-in for the FEEL and code editors that @bpmn-io/properties-panel
 * imports. FPB.js uses none of its FEEL or JSON entries, and the editors
 * would add over 500 KB to the bundle (tree shaking does not drop them).
 *
 * Only Annotation.define runs when the library loads; everything else throws
 * if an entry that needs an editor is ever used.
 */
function unavailable() {
  throw new Error('FPB.js does not ship the FEEL and code editors of @bpmn-io/properties-panel');
}

export default unavailable;

export const Annotation = { define: () => ({}) };
export const EditorState = {};
export const EditorView = {};
export const FeelersEditor = unavailable;

export const highlightSpecialChars = unavailable;
export const drawSelection = unavailable;
export const keymap = {};
export const placeholder = unavailable;
export const lineNumbers = unavailable;
export const syntaxHighlighting = unavailable;
export const defaultHighlightStyle = {};
export const foldGutter = unavailable;
export const bracketMatching = unavailable;
export const foldKeymap = [];
export const closeBrackets = unavailable;
export const closeBracketsKeymap = [];
export const history = unavailable;
export const defaultKeymap = [];
export const historyKeymap = [];
export const jsonParseLinter = unavailable;
export const json = unavailable;
export const linter = unavailable;
