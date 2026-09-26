// tests/unit/build/codeEditorStub.test.js
import { describe, it, expect } from 'vitest';

/**
 * Both webpack builds replace the FEEL and code editors of
 * @bpmn-io/properties-panel with build/code-editor-stub.js; vitest.config.js
 * applies the same aliases. The package calls some of them when it loads: a
 * stub that throws there breaks the whole editor, not only a JSON entry.
 */
describe('code editor stub', () => {

  it('stands in for the editors in the unit tests as in the builds', async () => {
    const langJson = await import('@codemirror/lang-json');
    expect(() => langJson.json()).toThrow(/does not ship the FEEL and code editors/);
  });

  // the ES module is what webpack bundles (field "module"); Node would take
  // the CommonJS file, where the aliases do not apply
  it('lets @bpmn-io/properties-panel load', async () => {
    const panel = await import('@bpmn-io/properties-panel/dist/index.esm.js');
    expect(typeof panel.PropertiesPanel).toBe('function');
  });

  it('still refuses the JSON linter once it is used', async () => {
    const { jsonParseLinter } = await import('@codemirror/lang-json');
    const lint = jsonParseLinter();
    expect(() => lint({})).toThrow(/does not ship the FEEL and code editors/);
  });
});
