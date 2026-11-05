/** @jsx h */
import { h, render } from '@bpmn-io/properties-panel/preact';

import AmlOverviewDialog from './AmlOverviewDialog';
import { collectProcessShapes } from '../help/processShapes';
import { collectEntries } from '../search/SearchIndex';
import { goToElement } from '../help/navigation';

/**
 * Opens "AML file" (016e V7, T5) as a dialog of the modeler; the button of
 * the toolbar calls open() and shows only while a file is kept.
 */
export default function AmlOverviewService(eventBus, injector, translate) {
  this._eventBus = eventBus;
  this._injector = injector;
  this._translate = translate;
}

AmlOverviewService.$inject = ['eventBus', 'injector', 'translate'];

// drawn with the render of this module's own Preact: in the library the
// AML add-on is a bundle of its own (fpbjs/aml) with its own copy, and hooks
// only work with that copy (016e D1, final review)
AmlOverviewService.prototype.open = function () {
  const injector = this._injector;
  const props = {
    eventBus: this._eventBus,
    amlSupport: injector.get('amlSupport'),
    amlMarkers: injector.get('amlMarkers', false),
    translate: this._translate,
    goTo: (id) => this._goTo(id)
  };
  const eventBus = this._eventBus;
  return injector.get('fpbDialogs').mount(function (element, { close, titleId }) {
    const draw = () => render(<AmlOverviewDialog {...props} close={close} titleId={titleId} />, element);
    draw();
    // the overview speaks the new language at once (016h V3)
    eventBus.on('i18n.changed', draw);
    return () => {
      eventBus.off('i18n.changed', draw);
      render(null, element);
    };
  }, { className: 'fpb-dialog--wide aml-overview-modal' });
};

/** Shows an element of any layer: its copy on the open layer first */
AmlOverviewService.prototype._goTo = function (id) {
  const injector = this._injector;
  const canvas = injector.get('canvas');
  const entries = collectEntries(collectProcessShapes(injector.get('fpbjs').getProjectDefinition()));
  const root = canvas.getRootElement();
  const entry = entries.find((e) => e.id === id && e.process === root) || entries.find((e) => e.id === id);
  if (!entry) {
    return;
  }
  goToElement({
    canvas,
    modeling: injector.get('modeling'),
    elementRegistry: injector.get('elementRegistry'),
    selection: injector.get('selection')
  }, entry.process, entry.id);
};
