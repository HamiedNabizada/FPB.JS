/**
 * Ends the undo history at every layer change.
 *
 * Switching, decomposing and composing rebuild the canvas and cannot be undone.
 * Commands recorded before them refer to shapes of another layer; undoing one of
 * them after the switch would act on elements that are not on the canvas. The
 * stack is therefore cleared once such a command has completely finished.
 *
 * The same holds for confirmed dialogs (boundary placement, removal of a
 * decomposition): ConfirmationHandler then changes the parent layer directly,
 * outside of any command, so undo could only take back one side of it.
 *
 * Exception: a switch carrying the hint `fpbTransient` only passes through a
 * layer and returns to the one it started from, as the PDF export does.
 * SwitchProcess re-attaches the very same shapes, so the recorded commands
 * still refer to elements on the canvas afterwards and stay undoable.
 */
export const LAYER_COMMANDS = [
  'process.switch',
  'processOperator.decompose',
  'systemLimit.compose'
];

export default function LayerUndoBoundary(eventBus, commandStack) {
  let layerChanged = false;

  LAYER_COMMANDS.forEach(function (command) {
    eventBus.on('commandStack.' + command + '.postExecuted', function (event) {
      const hints = (event.context && event.context.hints) || {};

      if (!hints.fpbTransient) {
        layerChanged = true;
      }
    });
  });

  // Dialogs are answered outside of command execution. Low priority: clear
  // after the confirmed action has run, so it is not left undoable either.
  eventBus.on('confirmation.confirmed', 250, function () {
    commandStack.clear();
  });

  // Fired after the outermost command has finished, so clearing is safe here.
  eventBus.on('commandStack.changed', function () {
    if (layerChanged) {
      layerChanged = false;
      commandStack.clear();
    }
  });

  /**
   * Run `work` and leave the undo history as it was before.
   *
   * A transient switch is still a command and lands in the history, so after a
   * PDF export the first presses of undo would only walk back through the
   * export's own layer switches instead of the user's last change. diagram-js
   * has no way to run a command without recording it, so the recorded actions
   * are taken down beforehand and put back afterwards.
   */
  this.keepHistory = async function (work) {
    const recorded = commandStack._stack.slice();
    const position = commandStack._stackIdx;

    try {
      return await work();
    } finally {
      commandStack._stack.length = 0;
      recorded.forEach(function (action) {
        commandStack._stack.push(action);
      });
      commandStack._stackIdx = position;
      eventBus.fire('commandStack.changed', { trigger: 'fpb.historyKept' });
    }
  };
}

LayerUndoBoundary.$inject = ['eventBus', 'commandStack'];
