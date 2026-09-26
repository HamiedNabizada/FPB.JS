import { useEffect, useState } from 'react';

import { isReadOnly } from './ReadOnly';

/**
 * Whether the modeler is read-only, for the React panels; follows
 * `readOnly.changed`.
 */
export default function useReadOnly(modeler) {
  const [readOnly, setReadOnly] = useState(() => isReadOnly(modeler));

  useEffect(() => {
    const eventBus = modeler.get('eventBus');
    const update = (event) => {
      setReadOnly(event.readOnly);
    };

    setReadOnly(isReadOnly(modeler));
    eventBus.on('readOnly.changed', update);
    return () => eventBus.off('readOnly.changed', update);
  }, [modeler]);

  return readOnly;
}
