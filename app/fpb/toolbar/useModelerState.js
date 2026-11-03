import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks';

/**
 * A value of the modeler for the toolbar, read again whenever one of
 * `events` fires (016f E1): the toolbar follows the services instead of
 * keeping a copy of its own.
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
