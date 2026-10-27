import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks';

import { useService } from './context';

/**
 * Is the editor in read-only mode (027)? Follows readOnly.changed, so an
 * open panel locks and unlocks at once. Without the read-only module: false.
 */
export function usePanelReadOnly() {
  const readOnly = useService('readOnly', false);
  const eventBus = useService('eventBus');
  const [locked, setLocked] = useState(() => !!(readOnly && readOnly.isEnabled()));

  useEffect(() => {
    const update = (event) => setLocked(!!event.readOnly);
    eventBus.on('readOnly.changed', update);
    return () => eventBus.off('readOnly.changed', update);
  }, [eventBus]);

  return locked;
}
