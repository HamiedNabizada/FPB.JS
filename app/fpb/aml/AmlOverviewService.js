import AmlOverviewDialog from './AmlOverviewDialog';
import { collectProcessShapes } from '../help/processShapes';
import { collectEntries } from '../search/SearchIndex';
import { goToElement } from '../help/navigation';

/**
 * Opens "AML file" (016e V7, T5) as a dialog of the modeler; the button of
 * the React toolbar calls open() and shows only while a file is kept.
 */
export default function AmlOverviewService(eventBus, injector, translate) {
  this._eventBus = eventBus;
  this._injector = injector;
  this._translate = translate;
}

AmlOverviewService.$inject = ['eventBus', 'injector', 'translate'];

AmlOverviewService.prototype.open = function () {
  const injector = this._injector;
  return injector.get('fpbDialogs').open(AmlOverviewDialog, {
    eventBus: this._eventBus,
    amlSupport: injector.get('amlSupport'),
    amlMarkers: injector.get('amlMarkers', false),
    translate: this._translate,
    goTo: (id) => this._goTo(id)
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
