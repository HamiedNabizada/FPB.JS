/** @jsx h */

import { h, render } from '@bpmn-io/properties-panel/preact';
import { useEffect, useRef, useState } from '@bpmn-io/properties-panel/preact/hooks';
import { createPortal } from '@bpmn-io/properties-panel/preact/compat';

import { useModelerState } from '../ui/useModelerState';

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

/** Where the sheets stand (016f E2); without the module, no sheets */
function readSheets(modeler) {
  const sheets = modeler.get('fpbSheets', false);
  return sheets
    ? { active: sheets.isActive(), current: sheets.current(), body: sheets.body() }
    : { active: false, current: null, body: null };
}

function Shell(props) {
  const { modeler } = props;
  const [open, setOpen] = useState(initiallyOpen);
  const sheet = useModelerState(modeler, 'sheets.changed', () => readSheets(modeler));
  const inSheet = sheet.active && sheet.current === 'properties' && sheet.body;
  // what the user sees: the sheet on narrow touch screens, else the side
  const visible = sheet.active ? !!inSheet : open;

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
      const sheets = modeler.get('fpbSheets', false);
      if (sheets && sheets.isActive()) {
        // one sheet at a time: the properties take the place of the list
        sheets.open('properties', { title: modeler.get('translate')('Properties') });
        return;
      }
      setOpen(true);
    };
    eventBus.on('propertiesPanel.open', onOpen);
    return () => eventBus.off('propertiesPanel.open', onOpen);
  }, [modeler]);

  useEffect(() => {
    if (visible && pendingEntry.current) {
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

  if (sheet.active) {
    // the side shows nothing; the body goes into the sheet
    return inSheet ? createPortal(
      <div class="fpb-properties fpb-properties--sheet">
        <div class="fpb-properties-body">
          <PanelRoot modeler={modeler} />
        </div>
      </div>,
      sheet.body
    ) : null;
  }

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

    // Ctrl+S in a field saves the model, not the page (016e D2); the field
    // hands over what was typed before the key reaches the container
    const files = modeler.get('fpbFiles', false);
    this._unbindKeys = files ? files.bindKeys(container) : function () {};

    this._container = container;
    render(<Shell modeler={modeler} />, container);
  }

  destroy() {
    this._unbindKeys();
    render(null, this._container);
  }
}
