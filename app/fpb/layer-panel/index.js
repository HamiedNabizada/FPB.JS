import ReactDOM from 'react-dom';
import React from 'react';
//import 'bootstrap/dist/css/bootstrap.min.css';
import LayerPanel from './LayerPanel';


export default class LayerOverview {
  constructor(options) {
    const {
      modeler,
      container,
      configPP
    } = options;
    ReactDOM.render(
      <LayerPanel modeler={modeler} config={configPP} />,
      container
    );
  }
}