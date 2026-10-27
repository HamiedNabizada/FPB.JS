import { is } from '../help/utils';
import { collectProcessShapes } from '../help/processShapes';
import { buildTree, pathTo, isRootProcess } from './tree';

// what can change the layers, their names or the current one (016d T2);
// commandStack.changed covers commands that drop a decomposition without a
// layerPanel event, and undo and redo
const CHANGES = [
  'commandStack.changed',
  'layerPanel.newProcess',
  'layerPanel.processDeleted',
  'layerPanel.reset',
  'layerPanel.processSwitched',
  'import.done',
  'fpb.projectChanged'
];

/**
 * The layers of the model for the breadcrumbs, the tree in Layers and the
 * keyboard (016d T1). Every switch goes through modeling.switchProcess, so
 * the undo boundary, the hint and the view of a layer are the same whichever
 * way the user takes. Fires `layers.changed` when the tree or the current
 * layer may have changed.
 */
export default function Layers(eventBus, canvas, modeling, fpbjs) {
  this._eventBus = eventBus;
  this._canvas = canvas;
  this._modeling = modeling;
  this._fpbjs = fpbjs;

  const changed = () => eventBus.fire('layers.changed');
  eventBus.on(CHANGES, changed);
  // renaming a decomposed operator renames its layer
  eventBus.on('elements.changed', function (event) {
    const renamed = (event.elements || []).some((element) =>
      element && element.businessObject && element.businessObject.decomposedView);
    if (renamed) {
      changed();
    }
  });
}

Layers.$inject = ['eventBus', 'canvas', 'modeling', 'fpbjs'];

/** The process root shapes (the data store holds business objects) */
Layers.prototype._processes = function () {
  return collectProcessShapes(this._fpbjs.getProjectDefinition());
};

Layers.prototype.getTree = function () {
  return buildTree(this._processes());
};

/** The layer on the canvas, or null before a model is there */
Layers.prototype.getCurrent = function () {
  const root = this._canvas.getRootElement();
  return root && is(root, 'fpb:Process') ? root : null;
};

Layers.prototype.getPath = function () {
  return pathTo(this.getCurrent());
};

/** Number of layers in the model */
Layers.prototype.count = function () {
  const count = (nodes) => nodes.reduce((sum, node) => sum + 1 + count(node.children), 0);
  return count(this.getTree());
};

/** Show `process` on the canvas; false if it is already there */
Layers.prototype.open = function (process) {
  const current = this.getCurrent();
  if (!process || (current && current.id === process.id)) {
    return false;
  }
  this._modeling.switchProcess(process);
  return true;
};

/** The layer above the current one; false on the top layer */
Layers.prototype.openParent = function () {
  const current = this.getCurrent();
  if (!current || isRootProcess(current)) {
    return false;
  }
  return this.open(current.businessObject.parent);
};

/** The layer of a decomposed process operator; false for any other element */
Layers.prototype.openDecomposition = function (element) {
  const view = element && element.businessObject && element.businessObject.decomposedView;
  return view ? this.open(view) : false;
};
