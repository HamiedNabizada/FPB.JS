/** @jsx h */
import { h, render } from '@bpmn-io/properties-panel/preact';

import ToolbarRoot from './ToolbarRoot';
import { createTooltips } from '../ui/Tooltip';

import './Toolbar.css';

/**
 * The toolbar of FPB.js (016f E1, Preact; until 2.0 it was the React
 * "layer panel"). The library builds it in `layerContainer` and still calls
 * it LayerOverview, so hosts keep their option and property.
 */
export default class Toolbar {
  constructor(options) {
    const {
      modeler,
      container,
      showNewModel = false
    } = options;
    this._container = container;
    // light, dark and the base values also when a host builds the toolbar
    // itself (getClasses().LayerOverview), as the properties panel does
    const theme = modeler.get('fpbTheme', false);
    if (theme) {
      theme.addContainer(container);
    }
    // lang for screen readers (016h T8)
    const i18n = modeler.get('fpbI18n', false);
    if (i18n) {
      i18n.addContainer(container);
    }
    // The import waits for this panel instead of waiting a fixed time
    modeler.get('eventBus').fire('ui.componentRegistered', { component: 'layerPanel' });
    // Ctrl+S on a button of the toolbar saves the model, not the page
    this._unbindKeys = modeler.get('fpbFiles').bindKeys(container);
    this._tooltips = createTooltips(theme, i18n);
    render(<ToolbarRoot modeler={modeler} showNewModel={showNewModel} tooltips={this._tooltips} />, container);
  }

  /** Unmounts the toolbar; its listeners on the modeler go with it */
  destroy() {
    if (this._container) {
      this._unbindKeys();
      render(null, this._container);
      this._tooltips.destroy();
      this._container = null;
    }
  }
}
