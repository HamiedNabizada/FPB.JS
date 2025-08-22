import React from 'react';
import { createRoot } from 'react-dom/client';
//import 'bootstrap/dist/css/bootstrap.min.css';
import LayerPanel from './LayerPanel';
import ErrorBoundary from '../ErrorBoundary';
import { ErrorProvider } from '../context/ErrorContext';

export default class LayerOverview {
  constructor(options) {
    const {
      modeler,
      container,
      configPP
    } = options;
    const root = createRoot(container);
    root.render(
      <ErrorProvider>
        <ErrorBoundary>
          <LayerPanel modeler={modeler} config={configPP} />
        </ErrorBoundary>
      </ErrorProvider>
    );
  }
}

