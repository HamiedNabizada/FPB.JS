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
 *
 * Examples (V13) are files of the host, named by the option `examples`
 * (`[{ title, description, url }]`); the web app brings four. They open like
 * a dropped file, so they are never saved into their source.
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
  // the example being loaded, its button is off meanwhile
  this._loading = null;

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

/** The examples to offer: those in AML only with the AML module */
Start.prototype.examples = function () {
  const examples = Array.isArray(this._config.examples) ? this._config.examples : [];
  const aml = !!this._injector.get('amlSupport', false);
  return examples.filter((example) => example && example.url && (aml || !/\.aml$/i.test(example.url)));
};

/**
 * Loads an example and opens it as a file. A failed load says so in the
 * message stack; the card stays.
 *
 * @return {Promise<boolean>} true when the file went to the importer
 */
Start.prototype.openExample = function (example) {
  const translate = this._translate;
  const name = decodeURIComponent(String(example.url).split(/[?#]/)[0].split('/').pop()) || 'example.json';
  this._loading = example;
  this._update();
  return fetch(example.url).then((response) => {
    if (!response.ok) {
      throw new Error(translate('The server answered {status}.', { status: String(response.status) }));
    }
    return response.text();
  }).then((text) => {
    this._loading = null;
    this._update();
    return this._injector.get('fpbFiles').openFile(new File([text], name));
  }, (error) => {
    this._loading = null;
    this._update();
    this._injector.get('fpbNotifications').show({
      key: 'start.example',
      type: 'error',
      title: translate('The example could not be loaded'),
      message: example.title,
      details: (error && error.message) || String(error)
    });
    return false;
  });
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
      examples={this.examples()}
      loading={this._loading}
      onExample={(example) => this.openExample(example)}
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
