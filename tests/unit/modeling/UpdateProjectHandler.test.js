// tests/unit/modeling/UpdateProjectHandler.test.js
import { describe, it, expect } from 'vitest';

import UpdateProjectHandler from '../../../app/fpb/modeling/cmd/UpdateProjectHandler.js';

function setup() {
  const project = { name: 'Alt', targetNamespace: 'http://alt' };
  const fired = [];
  const eventBus = { fire: (name, data) => fired.push({ name, data }) };
  const handler = new UpdateProjectHandler({ getProjectDefinition: () => project }, eventBus);
  return { project, fired, handler };
}

describe('UpdateProjectHandler', () => {

  it('sets the properties and remembers the old ones', () => {
    const { project, handler, fired } = setup();
    const context = { properties: { name: 'Neu' } };
    handler.execute(context);
    expect(project).toEqual({ name: 'Neu', targetNamespace: 'http://alt' });
    expect(fired.map((f) => f.name)).toEqual(['fpb.projectChanged']);
  });

  it('revert brings back the old values, a second execute (redo) the new', () => {
    const { project, handler } = setup();
    const context = { properties: { name: 'Neu', targetNamespace: 'http://neu' } };
    handler.execute(context);
    handler.revert(context);
    expect(project).toEqual({ name: 'Alt', targetNamespace: 'http://alt' });
    handler.execute(context);
    expect(project).toEqual({ name: 'Neu', targetNamespace: 'http://neu' });
  });
});
