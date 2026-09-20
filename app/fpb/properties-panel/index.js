import React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import PropertiesView from './PropertiesView';
import ErrorBoundary from '../ErrorBoundary';

export default class PropertiesPanel {

  constructor(options) {

    const {
      modeler,
      container,
      configPP
    } = options;
    // The import waits for this panel instead of waiting a fixed time
    modeler.get('eventBus').fire('ui.componentRegistered', { component: 'propertiesPanel' });
    const root = createRoot(container);
    root.render(
      <ErrorBoundary>
        <PropertiesView modeler={modeler} config={configPP} />
      </ErrorBoundary>
    );
  }
}

