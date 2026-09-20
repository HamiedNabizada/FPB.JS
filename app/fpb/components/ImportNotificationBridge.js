import { useEffect, useRef } from 'react';
import { useError } from '../context/ErrorContext';

/**
 * Forwards importer events to the notifications. Lives next to the provider
 * so it is registered as long as the panel exists; the import dialog itself is
 * only mounted while the panel is expanded, and an import may also come in
 * through the library API while it is collapsed.
 */
export default function ImportNotificationBridge({ modeler }) {
  const { showError, showReport } = useError();
  const warnungen = useRef([]);

  useEffect(() => {
    const eventBus = modeler.get('eventBus');
    const handleError = (event) => showError(event.message, event.details);
    const handleReport = (event) => {
      warnungen.current = event.warnings || [];
      showReport(event);
    };

    // After the import the model check runs; its result belongs in the report,
    // otherwise a file that imports cleanly but breaks rules says nothing.
    const handleDone = () => {
      const validation = modeler.get('fpbValidation', false);
      const counts = validation ? validation.run() && validation.getCounts() : null;
      showReport({
        warnings: warnungen.current,
        check: counts,
        onOpenCheck: validation ? () => validation.openPanel() : null
      });
      warnungen.current = [];
    };

    eventBus.on('import.error', handleError);
    eventBus.on('import.report', handleReport);
    eventBus.on('import.done', handleDone);

    return () => {
      eventBus.off('import.error', handleError);
      eventBus.off('import.report', handleReport);
      eventBus.off('import.done', handleDone);
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
