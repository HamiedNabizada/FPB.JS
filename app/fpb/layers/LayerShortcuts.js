import { isKey } from 'diagram-js/lib/features/keyboard/KeyboardUtil';

// above the arrow keys of diagram-js, which move the selection
const PRIORITY = 2000;

/**
 * Alt+Down opens the layer of the selected decomposed operator, Alt+Up goes
 * to the parent layer (016d V5). Both keys are taken even when there is
 * nothing to open, so Alt+Arrow never moves the selection.
 */
export default function LayerShortcuts(keyboard, selection, fpbLayers) {
  keyboard.addListener(PRIORITY, function (context) {
    const event = context.keyEvent;
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (isKey(['ArrowDown', 'Down'], event)) {
      const selected = selection.get();
      if (selected.length === 1) {
        fpbLayers.openDecomposition(selected[0]);
      }
      return true;
    }
    if (isKey(['ArrowUp', 'Up'], event)) {
      fpbLayers.openParent();
      return true;
    }
  });
}

LayerShortcuts.$inject = ['keyboard', 'selection', 'fpbLayers'];
