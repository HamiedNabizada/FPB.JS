/** @jsx h */

import { h, render } from '@bpmn-io/properties-panel/preact';
import { useEffect, useRef, useState } from '@bpmn-io/properties-panel/preact/hooks';

import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
import './FpbPropertiesPanel.css';

import PanelRoot from './PanelRoot';

const OPEN_KEY = 'fpbjs.propertiesPanel.open';

function initiallyOpen() {
  try {
    const stored = window.localStorage.getItem(OPEN_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
  } catch (error) {
    // storage blocked: closed, as the old panel started
  }
  return false;
}

function Shell(props) {
  const { modeler } = props;
  const [open, setOpen] = useState(initiallyOpen);

  const pendingEntry = useRef(null);

  useEffect(() => {
    // Mounted: whoever waits for the interface (the import) can go on
    modeler.get('eventBus').fire('ui.componentReady', { component: 'propertiesPanel' });
  }, [modeler]);

  useEffect(() => {
    const eventBus = modeler.get('eventBus');
    // The model check opens the panel at a finding (016b V7)
    const onOpen = (event) => {
      pendingEntry.current = (event && event.entry) || null;
      setOpen(true);
    };
    eventBus.on('propertiesPanel.open', onOpen);
    return () => eventBus.off('propertiesPanel.open', onOpen);
  }, [modeler]);

  useEffect(() => {
    if (open && pendingEntry.current) {
      const entry = pendingEntry.current;
      pendingEntry.current = null;
      // after the body has rendered its entries
      setTimeout(() => modeler.get('eventBus').fire('propertiesPanel.showEntry', { id: entry }), 0);
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, String(next));
    } catch (error) {
      // only a convenience
    }
  };

  const label = open ? 'Hide properties' : 'Show properties';

  return (
    <div class={'fpb-properties' + (open ? ' open' : '')}>
      <button
        type="button"
        id="propertiesPanelToggle"
        class="fpb-properties-toggle"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d={open ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
      {open && (
        <div class="fpb-properties-body">
          <PanelRoot modeler={modeler} />
        </div>
      )}
    </div>
  );
}

/**
 * Properties panel on @bpmn-io/properties-panel (Preact), see FPB.JS_Docs
 * Geplante-Features/016. The only properties panel since phase B3, which
 * removed the React panel that stood here before.
 */
export default class FpbPropertiesPanel {
  constructor(options) {
    const { modeler, container } = options;

    // The import waits for this panel instead of waiting a fixed time
    modeler.get('eventBus').fire('ui.componentRegistered', { component: 'propertiesPanel' });

    // light or dark like the rest of the modeler, also when a host builds the
    // panel itself (getClasses); the facade registers the container as well
    const theme = modeler.get('fpbTheme', false);
    if (theme) {
      theme.addContainer(container);
    }

    this._container = container;
    render(<Shell modeler={modeler} />, container);
  }

  destroy() {
    render(null, this._container);
  }
}
