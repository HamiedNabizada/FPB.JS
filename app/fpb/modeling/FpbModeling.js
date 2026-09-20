import inherits from 'inherits';
import BaseModeling from 'diagram-js/lib/features/modeling/Modeling';
import UpdateLabelHandler from '../label/cmd/UpdateLabelHandler';
import UpdatePropertiesHandler from './cmd/UpdatePropertiesHandler';
import DecomposeProcessOperator from './cmd/DecomposeProcessOperator';
import ComposeProcess from './cmd/ComposeProcess';
import SwitchProcess from './cmd/SwitchProcess';
export default function Modeling(eventBus, elementFactory, commandStack, fpbRuleProvider) {
  BaseModeling.call(this, eventBus, elementFactory, commandStack);
  this._fpbRules = fpbRuleProvider;
}

inherits(Modeling, BaseModeling);
Modeling.$inject = [
  'eventBus',
  'elementFactory',
  'commandStack',
  'fpbRuleProvider'
];

Modeling.prototype.getHandlers = function () {
  const handlers = BaseModeling.prototype.getHandlers.call(this);
  handlers['element.updateLabel'] = UpdateLabelHandler;
  handlers['element.updateProperties'] = UpdatePropertiesHandler;
  handlers['processOperator.decompose'] = DecomposeProcessOperator;
  handlers['systemLimit.compose'] = ComposeProcess;
  handlers['process.switch'] = SwitchProcess;
  return handlers;
};



Modeling.prototype.updateLabel = function (element, newLabel, newBounds, hints) {
  this._commandStack.execute('element.updateLabel', {
    element: element,
    newLabel: newLabel,
    newBounds: newBounds,
    hints: hints || {}
  });
};


Modeling.prototype.connect = function (source, target, attrs, hints) {
  if (!attrs) {
    attrs = this._fpbRules.canConnect(source, target);
  }
  if (!attrs) {
    return;
  }

  return this.createConnection(source, target, attrs, source.parent, hints);
};

/**
 * Switch the canvas to another process (layer).
 *
 * `hints.fpbTransient` marks a switch that is only a means to an end, as in the
 * PDF export, which walks through every layer and returns to the starting one.
 * Such a walk keeps the undo history, see LayerUndoBoundary.
 */
Modeling.prototype.switchProcess = function (process, hints) {
  this._commandStack.execute('process.switch', {
    process: process,
    hints: hints || {}
  })
};

Modeling.prototype.composeProcess = function (element) {
  this._commandStack.execute('systemLimit.compose', {
    element: element
  });
}

Modeling.prototype.decomposeProcessOperator = function (element) {
  this._commandStack.execute('processOperator.decompose', {
    element: element
  });
}

Modeling.prototype.updateProperties = function (element, properties) {
  this._commandStack.execute('element.updateProperties', {
    element: element,
    properties: properties
  });
};