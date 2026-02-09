import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for handling confirmation dialogs triggered by diagram-js events
 * @param {Object} modeler - The modeler instance
 * @returns {Object} Confirmation state and handlers
 */
export const useConfirmation = (modeler) => {
  const [confirmationData, setConfirmationData] = useState(null);

  useEffect(() => {
    if (!modeler) return;

    const handleConfirmationRequired = (event) => {
      setConfirmationData({
        title: event.title,
        message: event.message,
        details: event.details,
        isBlocked: event.isBlocked || false,
        action: event.action
      });
    };

    modeler.on('confirmation.required', handleConfirmationRequired);

    return () => {
      modeler.off('confirmation.required', handleConfirmationRequired);
    };
  }, [modeler]);

  const handleConfirm = useCallback(() => {
    if (confirmationData && confirmationData.action) {
      const eventBus = modeler.get('eventBus');
      eventBus.fire('confirmation.confirmed', {
        action: confirmationData.action
      });
    }
    setConfirmationData(null);
  }, [modeler, confirmationData]);

  const handleCancel = useCallback(() => {
    if (confirmationData && confirmationData.action) {
      const eventBus = modeler.get('eventBus');
      eventBus.fire('confirmation.cancelled', {
        action: confirmationData.action
      });
    }
    setConfirmationData(null);
  }, [modeler, confirmationData]);

  return {
    showConfirmation: !!confirmationData,
    confirmationData,
    handleConfirm,
    handleCancel
  };
};
