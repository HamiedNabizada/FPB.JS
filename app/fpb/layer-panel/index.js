import React from 'react';
import { createRoot } from 'react-dom/client';
// Bootstrap 5 for the layer panel and the dialogs, with either properties
// panel; the web app no longer loads Bootstrap 4 from a CDN (016c)
import 'bootstrap/dist/css/bootstrap.min.css';
import LayerPanel from './LayerPanel';
import ErrorBoundary from '../ErrorBoundary';
import { ErrorProvider } from '../context/ErrorContext';
import ImportNotificationBridge from '../components/ImportNotificationBridge';
import AutosaveNotice from '../components/AutosaveNotice';

export default class LayerOverview {
  constructor(options) {
    const {
      modeler,
      container,
      configPP
    } = options;
    // The import waits for this panel instead of waiting a fixed time
    modeler.get('eventBus').fire('ui.componentRegistered', { component: 'layerPanel' });
    const root = this._root = createRoot(container);
    root.render(
      <ErrorProvider>
        <ImportNotificationBridge modeler={modeler} />
        <AutosaveNotice modeler={modeler} />
        <ErrorBoundary>
          <LayerPanel modeler={modeler} config={configPP} />
        </ErrorBoundary>
      </ErrorProvider>
    );
  }

  /** Unmounts the panel; its listeners on the modeler go with it */
  destroy() {
    if (this._root) {
      this._root.unmount();
      this._root = null;
    }
  }
}

