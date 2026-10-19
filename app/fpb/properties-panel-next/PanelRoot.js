/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { PropertiesPanel } from '@bpmn-io/properties-panel';
import { useEffect, useErrorBoundary, useMemo, useState } from '@bpmn-io/properties-panel/preact/hooks';

import { is } from '../help/utils';
import { ServicesContext } from './context';
import { headerProvider } from './header';
import { getGroups } from './groups';
import { loadLayout, saveLayout } from './layout';
import { FindingsContext } from './findingsContext';
import { findingsFor, fieldFindings } from './findings';

const placeholderProvider = {
  getEmpty: () => ({ text: 'Select an element to edit its properties.' }),
  getMultiple: () => ({ text: 'Multiple elements are selected. Select a single element to edit its properties.' })
};

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

  // An entry that throws must not leave a blank panel (the old panel had an
  // ErrorBoundary as well)
  const [failure, resetFailure] = useErrorBoundary((error) => console.error('[FPB.JS] properties panel', error));

  const [element, setElement] = useState(() => currentElement(modeler));
  const [, setRevision] = useState(0);

  // findings of the model check, for the panel and its fields (016b V7)
  const validation = modeler.get('fpbValidation', false);
  const [issues, setIssues] = useState(() => (validation ? validation.getIssues() : []));

  useEffect(() => {
    const update = (event) => setIssues(event.issues || []);
    eventBus.on('fpbValidation.changed', update);
    return () => eventBus.off('fpbValidation.changed', update);
  }, [eventBus]);

  const services = useMemo(() => ({
    getService: (name, strict) => modeler.get(name, strict)
  }), [modeler]);

  useEffect(() => {
    const refresh = () => setElement(currentElement(modeler));
    const changed = (event) => {
      // the numbers of a layer change with any element on it (016b T10)
      const isLayer = element && !Array.isArray(element) && is(element, 'fpb:Process');
      if (isLayer || concerns(element, event.elements || [])) {
        setRevision((revision) => revision + 1);
      }
    };
    const redraw = () => setRevision((revision) => revision + 1);

    const refreshEvents = ['selection.changed', 'root.set', 'import.done', 'model.new', 'layerPanel.processSwitched'];
    refreshEvents.forEach((name) => eventBus.on(name, refresh));
    eventBus.on('elements.changed', changed);
    eventBus.on('fpb.projectChanged', redraw);

    return () => {
      refreshEvents.forEach((name) => eventBus.off(name, refresh));
      eventBus.off('elements.changed', changed);
      eventBus.off('fpb.projectChanged', redraw);
    };
  }, [modeler, eventBus, element]);

  const root = modeler.get('canvas').getRootElement();
  const findings = findingsFor(issues, element, root);
  const groups = element && !Array.isArray(element) ? getGroups(element, modeler.get('translate'), findings) : [];

  if (failure) {
    const translate = modeler.get('translate');
    return (
      <div class="fpb-properties-failure" role="alert">
        <p>{translate('The properties panel ran into an error.')}</p>
        <button type="button" class="fpb-field-button" onClick={resetFailure}>{translate('Try again')}</button>
      </div>
    );
  }

  return (
    <ServicesContext.Provider value={services}>
      <FindingsContext.Provider value={fieldFindings(findings)}>
        <PropertiesPanel
          element={element}
          groups={groups}
          headerProvider={headerProvider}
          placeholderProvider={placeholderProvider}
          layoutConfig={loadLayout()}
          layoutChanged={saveLayout}
          eventBus={eventBus}
        />
      </FindingsContext.Provider>
    </ServicesContext.Provider>
  );
}
