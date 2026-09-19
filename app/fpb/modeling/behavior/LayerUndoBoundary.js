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
 */
export const LAYER_COMMANDS = [
  'process.switch',
  'processOperator.decompose',
  'systemLimit.compose'
];

export default function LayerUndoBoundary(eventBus, commandStack) {
  let layerChanged = false;

  LAYER_COMMANDS.forEach(function (command) {
    eventBus.on('commandStack.' + command + '.postExecuted', function () {
      layerChanged = true;
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
}

LayerUndoBoundary.$inject = ['eventBus', 'commandStack'];
