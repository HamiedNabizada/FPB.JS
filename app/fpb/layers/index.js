import Layers from './Layers';
import Breadcrumbs from './Breadcrumbs';
import LayerViews from './LayerViews';
import LayerShortcuts from './LayerShortcuts';

/** Layers of a model: service, breadcrumbs, view per layer, shortcuts (016d) */
export default {
  __init__: ['fpbLayers', 'breadcrumbs', 'layerViews', 'layerShortcuts'],
  fpbLayers: ['type', Layers],
  breadcrumbs: ['type', Breadcrumbs],
  layerViews: ['type', LayerViews],
  layerShortcuts: ['type', LayerShortcuts]
};
