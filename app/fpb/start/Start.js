/** @jsx h */
import { h, render } from '@bpmn-io/properties-panel/preact';

import StartCard from './StartCard';
import { getCtrlKey } from '../info/keyboardShortcuts';

/**
 * How to begin on an empty canvas (016e V12): while the model has no
 * project, a card in the middle of the canvas says how to draw, opens a file
 * and leads to the notation. It goes with the first element or an import and
 * comes back with New model; it hides while an element is being placed, and
 * in read-only mode, where nothing can be begun. Off with the option
 * `startCard: false`.
 */
export default function Start(eventBus, canvas, injector, fpbjs, translate, config) {
  this._eventBus = eventBus;
  this._canvas = canvas;
  this._injector = injector;
  this._fpbjs = fpbjs;
  this._translate = translate;
  this._config = config || {};
  this._element = null;
  this._creating = false;

  if (this._config.startCard === false) {
    return;
  }

  const self = this;
  const update = function () {
    self._update();
  };

  eventBus.on(['import.done', 'import.error', 'model.new', 'commandStack.changed', 'readOnly.changed'], update);

  // the first element may go where the card stands
  eventBus.on(['create.init', 'create.start'], function () {
    self._creating = true;
    self._update();
  });
  eventBus.on('create.cleanup', function () {
    self._creating = false;
    self._update();
  });

  eventBus.on('diagram.destroy', function () {
    self._hide();
  });

  this._update();
}

Start.$inject = ['eventBus', 'canvas', 'injector', 'fpbjs', 'translate', 'config'];

/** Is the card on the canvas? */
Start.prototype.isShown = function () {
  return !!this._element;
};

Start.prototype._wanted = function () {
  const readOnly = this._injector.get('readOnly', false);
  return !this._creating
    && !(readOnly && readOnly.isEnabled())
    && !(this._fpbjs.getProcesses() || []).length;
};

Start.prototype._update = function () {
  if (this._wanted()) {
    this._show();
  } else {
    this._hide();
  }
};

Start.prototype._show = function () {
  if (!this._element) {
    const element = this._element = document.createElement('section');
    element.className = 'fpb-start';
    element.setAttribute('aria-label', this._translate('Start a model'));
    this._canvas.getContainer().appendChild(element);
  }
  const injector = this._injector;
  render(
    <StartCard
      translate={this._translate}
      canOpen={this._config.files !== false && !!injector.get('fpbFiles', false)}
      ctrlKey={getCtrlKey()}
      onOpen={() => injector.get('fpbFiles').open()}
      onNotation={() => injector.get('fpbInfo').open('notation')}
    />,
    this._element
  );
};

Start.prototype._hide = function () {
  if (this._element) {
    render(null, this._element);
    this._element.remove();
    this._element = null;
  }
};
