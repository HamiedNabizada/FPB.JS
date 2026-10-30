// above the keys of diagram-js and of the editor actions
const PRIORITY = 2000;

/**
 * The keys of files on the canvas (016e T8): Ctrl/Cmd+S saves, with Shift
 * under a new name. Taken before the browser can save the page. Off with
 * the option `files: false`; fpbFiles.bindKeys adds them to the panels.
 *
 * diagram-js listens to keys on its SVG only. The label editor lies next to
 * it in the container and stops every key, as do the messages and the
 * breadcrumbs, which are not in the SVG either: for those the container
 * listens first (capture), and leaves the SVG to the keyboard of diagram-js.
 */
export default function FileShortcuts(keyboard, canvas, fpbFiles, eventBus) {
  keyboard.addListener(PRIORITY, function (context) {
    if (fpbFiles._handleKey(context.keyEvent)) {
      return true;
    }
  });

  const container = canvas.getContainer();
  const listener = function (event) {
    const binding = keyboard.getBinding();
    if (binding && binding.contains(event.target)) {
      return;
    }
    if (fpbFiles._handleKey(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  container.addEventListener('keydown', listener, true);
  eventBus.on('diagram.destroy', function () {
    container.removeEventListener('keydown', listener, true);
  });
}

FileShortcuts.$inject = ['keyboard', 'canvas', 'fpbFiles', 'eventBus'];
