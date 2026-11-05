import { markText } from '../i18n/markText';

/**
 * Optional marks on the canvas for elements that carry more from the kept AML
 * file than FPD (feature 028). Off by default, so the diagram looks as the FPB
 * always does; switched on in the AML file overview and remembered in the
 * browser. HTML overlays: they are not part of the SVG, PNG or PDF export.
 */

const OVERLAY_TYPE = 'fpb-aml-marker';
const STORAGE_KEY = 'fpbjs.amlMarkers';

export default function AmlMarkers(eventBus, overlays, elementRegistry, amlSupport, translate) {
  this._eventBus = eventBus;
  this._translate = translate;
  this._overlays = overlays;
  this._elementRegistry = elementRegistry;
  this._amlSupport = amlSupport;
  this._enabled = readStored();

  const self = this;
  // after a layer switch: root.set comes before the shapes of the layer are added
  eventBus.on(['aml.indexChanged', 'aml.sourceChanged', 'import.done', 'layerPanel.processSwitched', 'i18n.changed'], function () {
    self._render();
  });
}

AmlMarkers.$inject = ['eventBus', 'overlays', 'elementRegistry', 'amlSupport', 'translate'];

AmlMarkers.prototype.isEnabled = function () {
  return this._enabled;
};

AmlMarkers.prototype.setEnabled = function (enabled) {
  this._enabled = !!enabled;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(this._enabled));
  } catch (error) {
    // only a convenience
  }
  this._render();
  this._eventBus.fire('aml.markersChanged', { enabled: this._enabled });
};

AmlMarkers.prototype._render = function () {
  this._overlays.remove({ type: OVERLAY_TYPE });
  const index = this._amlSupport.getIndex();
  if (!this._enabled || !index) {
    return;
  }
  const overlays = this._overlays;
  const translate = this._translate;
  this._elementRegistry.forEach(function (element) {
    const entry = !element.labelTarget && !element.waypoints && index.get(element.id);
    if (!entry || !(entry.attributes.length || entry.interfaces.length || entry.links.length)) {
      return;
    }
    const marker = document.createElement('div');
    marker.className = 'fpb-aml-marker';
    marker.textContent = 'AML';
    marker.title = describe(entry, translate);
    // bottom right, out of the way of labels above and of the model check marks top right
    overlays.add(element, OVERLAY_TYPE, { position: { bottom: 4, right: 4 }, html: marker });
  });
};

/** Attributes, interfaces and links as words ('2 attributes, 1 link') */
export function describeAmlCounts(attributes, interfaces, links, translate) {
  const part = (n, one, many) => (n === 1 ? translate(one) : translate(many, { count: n }));
  const parts = [];
  if (attributes) {
    parts.push(part(attributes, markText('1 attribute'), markText('{count} attributes')));
  }
  if (interfaces) {
    parts.push(part(interfaces, markText('1 interface'), markText('{count} interfaces')));
  }
  if (links) {
    parts.push(part(links, markText('1 link'), markText('{count} links')));
  }
  return parts.join(', ');
}

function describe(entry, translate) {
  return translate('More from the AML file: {parts}. See "AML (read only)" in the properties panel.', {
    parts: describeAmlCounts(entry.attributes.length, entry.interfaces.length, entry.links.length, translate)
  });
}

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (error) {
    return false;
  }
}
