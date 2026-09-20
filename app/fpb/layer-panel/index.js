import React from 'react';
import { createRoot } from 'react-dom/client';
//import 'bootstrap/dist/css/bootstrap.min.css';
import LayerPanel from './LayerPanel';
import ErrorBoundary from '../ErrorBoundary';
import { ErrorProvider } from '../context/ErrorContext';
import ImportNotificationBridge from '../components/ImportNotificationBridge';

export default class LayerOverview {
  constructor(options) {
    const {
      modeler,
      container,
      configPP
    } = options;
    // The import waits for this panel instead of waiting a fixed time
    modeler.get('eventBus').fire('ui.componentRegistered', { component: 'layerPanel' });
    const root = createRoot(container);
    root.render(
      <ErrorProvider>
        <ImportNotificationBridge modeler={modeler} />
        <ErrorBoundary>
          <LayerPanel modeler={modeler} config={configPP} />
        </ErrorBoundary>
      </ErrorProvider>
    );
  }
}

