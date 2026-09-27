const path = require('path');

const stub = path.resolve(__dirname, 'code-editor-stub.js');

/**
 * Webpack aliases shared by the web and the library build: the editors of
 * @bpmn-io/properties-panel are replaced by a stub, see code-editor-stub.js.
 */
module.exports = [
  '@bpmn-io/feel-editor',
  '@bpmn-io/feelers-editor',
  '@codemirror/autocomplete',
  '@codemirror/commands',
  '@codemirror/lang-json',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/state',
  '@codemirror/view'
].reduce((aliases, name) => {
  aliases[name + '$'] = stub;
  return aliases;
}, {});
