import { useEffect } from 'react';
import { useError } from '../context/ErrorContext';

/**
 * Forwards importer events to the notifications. Lives next to the provider
 * so it is registered as long as the panel exists; the import dialog itself is
 * only mounted while the panel is expanded, and an import may also come in
 * through the library API while it is collapsed.
 */
export default function ImportNotificationBridge({ modeler }) {
  const { showError, showReport } = useError();

  useEffect(() => {
    const eventBus = modeler.get('eventBus');
    const handleError = (event) => showError(event.message, event.details);
    const handleReport = (event) => showReport(event);

    eventBus.on('import.error', handleError);
    eventBus.on('import.report', handleReport);

    return () => {
      eventBus.off('import.error', handleError);
      eventBus.off('import.report', handleReport);
    };
  }, [modeler, showError, showReport]);

  // A file dropped outside the import dialog made the browser open it and leave
  // the page, with the unsaved model. The dialog handles its own drops first
  // (defaultPrevented); everywhere else a dragged file is refused.
  useEffect(() => {
    const draggingFile = (event) => event.dataTransfer
      && Array.from(event.dataTransfer.types || []).includes('Files');
    const refuse = (event) => {
      if (draggingFile(event) && !event.defaultPrevented) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'none';
      }
    };
    window.addEventListener('dragover', refuse);
    window.addEventListener('drop', refuse);
    return () => {
      window.removeEventListener('dragover', refuse);
      window.removeEventListener('drop', refuse);
    };
  }, []);

  return null;
}
