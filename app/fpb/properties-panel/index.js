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
    const root = createRoot(container);
    root.render(
      <ErrorBoundary>
        <PropertiesView modeler={modeler} config={configPP} />
      </ErrorBoundary>
    );
  }
}

