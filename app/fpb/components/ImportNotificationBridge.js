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

  return null;
}
