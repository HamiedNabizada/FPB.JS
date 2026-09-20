import { isKey } from 'diagram-js/lib/features/keyboard/KeyboardUtil';

/**
 * Single keys for the tools of the palette, shown in their tooltip.
 *
 * diagram-js renders the tooltip of a palette entry itself since version 15 and
 * puts `entry.shortcut` next to the title, so a key only has to be bound here
 * and named there (see FpbPaletteProvider).
 *
 * Careful with single keys: diagram-js binds the keyboard to the canvas
 * container, and editing a label happens inside that container. Without the
 * guard below, naming a state "Heat" would have activated the hand tool on the
 * first letter. Keys with Ctrl, Alt or Cmd are left alone as well, otherwise
 * the alignment shortcuts (Ctrl+Shift+L and friends) would collide.
 */
export const TOOL_SHORTCUTS = {
  h: 'hand',
  l: 'lasso',
  s: 'space'
};

export default function ToolShortcuts(keyboard, injector, handTool, lassoTool, spaceTool) {
  // `toggle` and not `activate...`: the tools want a mouse event with
  // coordinates, a keystroke has none. Pressing the key again switches back.
  const tools = {
    hand: handTool,
    lasso: lassoTool,
    space: spaceTool
  };

  keyboard.addListener(function (context) {
    const event = context.keyEvent;

    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event, injector)) {
      return;
    }

    const tool = Object.keys(TOOL_SHORTCUTS).find(function (key) {
      return isKey([key, key.toUpperCase()], event);
    });

    if (!tool) {
      return;
    }
    tools[TOOL_SHORTCUTS[tool]].toggle();

    return true;
  });
}

ToolShortcuts.$inject = ['keyboard', 'injector', 'handTool', 'lassoTool', 'spaceTool'];

/** Is the user writing right now, on the canvas or in a panel? */
function isTyping(event, injector) {
  const directEditing = injector.get('directEditing', false);

  if (directEditing && directEditing.isActive()) {
    return true;
  }

  const target = event.target;

  if (!target) {
    return false;
  }
  return target.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(target.tagName) !== -1;
}
