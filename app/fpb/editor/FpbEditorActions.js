import { isCmd, isKey } from 'diagram-js/lib/features/keyboard/KeyboardUtil';

/**
 * FPB adjustments to the diagram-js editor actions and key bindings:
 * - removeSelection (Delete, Backspace) goes through fpbDelete, so deleting
 *   an element with consequences on another layer still asks first;
 * - selectAll (Ctrl/Cmd+A) selects every element of the current layer;
 * - copy and paste (Ctrl/Cmd+C, Ctrl/Cmd+V) through fpbCopyPaste.
 * Undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z) come from diagram-js.
 */
export default function FpbEditorActions(injector, eventBus, keyboard, selection, elementRegistry, canvas, fpbDelete, fpbCopyPaste) {

  eventBus.on('editorActions.init', function (event) {
    const editorActions = event.editorActions;

    if (editorActions.isRegistered('removeSelection')) {
      editorActions.unregister('removeSelection');
    }
    editorActions.register('removeSelection', function () {
      fpbDelete.remove(selection.get());
    });

    // Ctrl/Cmd+C and Ctrl/Cmd+V: the key bindings of diagram-js trigger these
    editorActions.register('copy', function () {
      fpbCopyPaste.copy(selection.get());
    });
    editorActions.register('paste', function () {
      fpbCopyPaste.paste();
    });

    editorActions.register('selectAll', function () {
      const root = canvas.getRootElement();
      selection.select(elementRegistry.filter(function (element) {
        return element !== root && element.type !== 'label' && element.parent;
      }));
    });
  });

  keyboard.addListener(function (context) {
    const event = context.keyEvent;
    if (isCmd(event) && isKey(['a', 'A'], event)) {
      injector.get('editorActions').trigger('selectAll');
      return true;
    }
  });
}

FpbEditorActions.$inject = ['injector', 'eventBus', 'keyboard', 'selection', 'elementRegistry', 'canvas', 'fpbDelete', 'fpbCopyPaste'];
