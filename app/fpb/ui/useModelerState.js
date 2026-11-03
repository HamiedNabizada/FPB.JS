import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks';

/**
 * A value of the modeler for a part of the interface, read again whenever
 * one of `events` fires (016f E1): toolbar and panels follow the services
 * instead of keeping copies of their own.
 */
export function useModelerState(modeler, events, read) {
  const [value, setValue] = useState(read);

  useEffect(() => {
    const eventBus = modeler.get('eventBus');
    // block body: a listener that returns a value stops the event
    const update = () => {
      setValue(() => read());
    };
    eventBus.on(events, update);
    // something may have changed between the first render and now
    update();
    return () => eventBus.off(events, update);
  }, [modeler]);

  return value;
}
