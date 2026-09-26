/**
 * Read-only mode: the model can be looked at, zoomed, searched, checked,
 * exported and its layers switched, but the user cannot change it.
 *
 * Built on canvasLock (@bpmn-io/diagram-js-canvas-lock), which blocks
 * dragging (moving, creating, connecting, the tools), the context pad, popup
 * menus, direct editing of labels and every editor action except navigation
 * (so also delete, undo, redo, copy and paste). ReadOnlyRules refuses what
 * asks the rules, e.g. the arrow keys, which diagram-js binds directly. The
 * entry points of FPB.js that bypass both (the alignment keys, the panels,
 * New and Import) ask isEnabled() or listen to `readOnly.changed`.
 *
 * Changes through the API stay possible: the host still imports models and
 * switches layers.
 */
export default function ReadOnly(eventBus, canvasLock) {
  this._canvasLock = canvasLock;

  eventBus.on('canvasLock.changed', function (event) {
    eventBus.fire('readOnly.changed', { readOnly: event.locked });
  });
}

ReadOnly.$inject = ['eventBus', 'canvasLock'];

/** Turn the mode on (true) or off (false) */
ReadOnly.prototype.set = function (readOnly) {
  if (readOnly) {
    this._canvasLock.lock();
  } else {
    this._canvasLock.unlock();
  }
};

ReadOnly.prototype.isEnabled = function () {
  return this._canvasLock.isLocked();
};

/**
 * Is the modeler read-only? For code that may run without this module, e.g.
 * services in a unit test.
 */
export function isReadOnly(injector) {
  const readOnly = injector && injector.get('readOnly', false);
  return !!(readOnly && readOnly.isEnabled());
}
