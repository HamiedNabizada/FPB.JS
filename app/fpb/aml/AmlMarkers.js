/**
 * Optional marks on the canvas for elements that carry more from the kept AML
 * file than FPD (feature 028). Off by default, so the diagram looks as the FPB
 * always does; switched on in the AML file overview and remembered in the
 * browser. HTML overlays: they are not part of the SVG, PNG or PDF export.
 */

const OVERLAY_TYPE = 'fpb-aml-marker';
const STORAGE_KEY = 'fpbjs.amlMarkers';

export default function AmlMarkers(eventBus, overlays, elementRegistry, amlSupport) {
  this._eventBus = eventBus;
  this._overlays = overlays;
  this._elementRegistry = elementRegistry;
  this._amlSupport = amlSupport;
  this._enabled = readStored();

  const self = this;
  // after a layer switch: root.set comes before the shapes of the layer are added
  eventBus.on(['aml.indexChanged', 'aml.sourceChanged', 'import.done', 'layerPanel.processSwitched'], function () {
    self._render();
  });
}

AmlMarkers.$inject = ['eventBus', 'overlays', 'elementRegistry', 'amlSupport'];

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
  this._elementRegistry.forEach(function (element) {
    const entry = !element.labelTarget && !element.waypoints && index.get(element.id);
    if (!entry || !(entry.attributes.length || entry.interfaces.length || entry.links.length)) {
      return;
    }
    const marker = document.createElement('div');
    marker.className = 'fpb-aml-marker';
    marker.textContent = 'AML';
    marker.title = describe(entry);
    // bottom right, out of the way of labels above and of the model check marks top right
    overlays.add(element, OVERLAY_TYPE, { position: { bottom: 4, right: 4 }, html: marker });
  });
};

function describe(entry) {
  const parts = [];
  if (entry.attributes.length) {
    parts.push(entry.attributes.length + (entry.attributes.length === 1 ? ' attribute' : ' attributes'));
  }
  if (entry.interfaces.length) {
    parts.push(entry.interfaces.length + (entry.interfaces.length === 1 ? ' interface' : ' interfaces'));
  }
  if (entry.links.length) {
    parts.push(entry.links.length + (entry.links.length === 1 ? ' link' : ' links'));
  }
  return 'More from the AML file: ' + parts.join(', ') + '. See "AML (read only)" in the properties panel.';
}

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (error) {
    return false;
  }
}
