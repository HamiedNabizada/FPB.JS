import ReactDOM from 'react-dom';
import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import PropertiesView from './PropertiesView';


export default class PropertiesPanel {

  constructor(options) {

    const {
      modeler,
      container,
      configPP
    } = options;
    ReactDOM.render(
      <PropertiesView modeler={modeler} config={configPP} />,
      container
    );
  }
}