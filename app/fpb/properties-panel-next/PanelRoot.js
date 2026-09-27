/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { PropertiesPanel } from '@bpmn-io/properties-panel';
import { useEffect, useMemo, useState } from '@bpmn-io/properties-panel/preact/hooks';

import { is } from '../help/utils';
import { ServicesContext } from './context';
import { headerProvider } from './header';
import { getGroups } from './groups';

const placeholderProvider = {
  getEmpty: () => ({ text: 'Select an element to edit its properties.' }),
  getMultiple: () => ({ text: 'Multiple elements are selected. Select a single element to edit its properties.' })
};

// Open and closed groups are kept while the selection changes
const LAYOUT = { groups: {} };

/**
 * The element the panel shows: the selected one, the layer when nothing is
 * selected, a list when several are.
 */
function currentElement(modeler) {
  const selected = modeler.get('selection').get();

  if (selected.length > 1) {
    return selected;
  }

  if (selected.length === 1) {
    const element = selected[0];
    return element.labelTarget || element;
  }

  const root = modeler.get('canvas').getRootElement();
  return is(root, 'fpb:Process') ? root : null;
}

function concerns(element, changed) {
  if (!element) {
    return false;
  }
  const shown = Array.isArray(element) ? element : [element];
  return changed.some((e) => shown.includes(e) || shown.includes(e.labelTarget));
}

export default function PanelRoot(props) {
  const { modeler } = props;
  const eventBus = modeler.get('eventBus');

  const [element, setElement] = useState(() => currentElement(modeler));
  const [, setRevision] = useState(0);

  const services = useMemo(() => ({
    getService: (name, strict) => modeler.get(name, strict)
  }), [modeler]);

  useEffect(() => {
    const refresh = () => setElement(currentElement(modeler));
    const changed = (event) => {
      if (concerns(element, event.elements || [])) {
        setRevision((revision) => revision + 1);
      }
    };

    const refreshEvents = ['selection.changed', 'root.set', 'import.done', 'model.new', 'layerPanel.processSwitched'];
    refreshEvents.forEach((name) => eventBus.on(name, refresh));
    eventBus.on('elements.changed', changed);

    return () => {
      refreshEvents.forEach((name) => eventBus.off(name, refresh));
      eventBus.off('elements.changed', changed);
    };
  }, [modeler, eventBus, element]);

  const groups = element && !Array.isArray(element) ? getGroups(element) : [];

  return (
    <ServicesContext.Provider value={services}>
      <PropertiesPanel
        element={element}
        groups={groups}
        headerProvider={headerProvider}
        placeholderProvider={placeholderProvider}
        layoutConfig={LAYOUT}
        eventBus={eventBus}
      />
    </ServicesContext.Provider>
  );
}
