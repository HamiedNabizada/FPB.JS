/** @jsx h */

import { h, render } from '@bpmn-io/properties-panel/preact';
import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks';

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

  useEffect(() => {
    // Mounted: whoever waits for the interface (the import) can go on
    modeler.get('eventBus').fire('ui.componentReady', { component: 'propertiesPanel' });
  }, [modeler]);

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
 * Geplante-Features/016. Replaces the React panel in app/fpb/properties-panel.
 */
export default class FpbPropertiesPanel {
  constructor(options) {
    const { modeler, container } = options;

    // The import waits for this panel instead of waiting a fixed time
    modeler.get('eventBus').fire('ui.componentRegistered', { component: 'propertiesPanel' });

    this._container = container;
    render(<Shell modeler={modeler} />, container);
  }

  destroy() {
    render(null, this._container);
  }
}
