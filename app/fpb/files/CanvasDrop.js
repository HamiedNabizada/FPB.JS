import { droppedHandle } from './fileAccess';

/**
 * A file dragged onto the canvas opens (016e V8), as through "Open". While it
 * is dragged over, the canvas shows where it can go. In read-only mode the
 * drop is refused with a message. In Chrome and Edge the dropped file is the
 * one Ctrl+S saves into; its handle is asked for during the drop, the only
 * time the browser hands it out.
 *
 * Off with the option `files: false`; then the page refuses dropped files
 * everywhere (notifications/ImportMessages.js), as it does outside the canvas.
 */
export default function CanvasDrop(canvas, fpbFiles, injector, translate, eventBus, config) {
  if (config && config.files === false) {
    return;
  }

  const container = canvas.getContainer();
  let hint = null;

  const readOnly = () => {
    const service = injector.get('readOnly', false);
    return !!(service && service.isEnabled());
  };
  const hasFiles = (event) => event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files');

  // refused: in read-only mode the browser drops nothing, the hint says why
  const show = (refused) => {
    container.classList.add('fpb-drop-active');
    if (!hint) {
      hint = document.createElement('div');
      hint.appendChild(document.createElement('span'));
      container.appendChild(hint);
    }
    hint.className = refused ? 'fpb-drop-hint is-refused' : 'fpb-drop-hint';
    hint.firstChild.textContent = refused
      ? translate('Opening a file is not possible in read-only mode.')
      : translate('Drop the file to open it');
  };
  const hide = () => {
    container.classList.remove('fpb-drop-active');
    if (hint) {
      hint.remove();
      hint = null;
    }
  };

  const over = (event) => {
    if (!hasFiles(event)) {
      return;
    }
    // without preventDefault the browser would open the file and leave the page
    event.preventDefault();
    if (readOnly()) {
      event.dataTransfer.dropEffect = 'none';
      show(true);
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
    show(false);
  };

  const leave = (event) => {
    if (!container.contains(event.relatedTarget)) {
      hide();
    }
  };

  const drop = (event) => {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    hide();
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) {
      return;
    }
    if (readOnly()) {
      fpbFiles._notInReadOnly();
      return;
    }
    droppedHandle(event.dataTransfer).then((handle) => {
      fpbFiles.openFile(file, handle);
    });
    if (event.dataTransfer.files.length > 1) {
      fpbFiles._onlyFirstOpened(file.name);
    }
  };

  container.addEventListener('dragenter', over);
  container.addEventListener('dragover', over);
  container.addEventListener('dragleave', leave);
  container.addEventListener('drop', drop);
  window.addEventListener('dragend', hide);

  eventBus.on('diagram.destroy', function () {
    container.removeEventListener('dragenter', over);
    container.removeEventListener('dragover', over);
    container.removeEventListener('dragleave', leave);
    container.removeEventListener('drop', drop);
    window.removeEventListener('dragend', hide);
    hide();
  });
}

CanvasDrop.$inject = ['canvas', 'fpbFiles', 'injector', 'translate', 'eventBus', 'config'];
