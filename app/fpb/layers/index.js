import Layers from './Layers';
import Breadcrumbs from './Breadcrumbs';
import LayerViews from './LayerViews';
import LayerShortcuts from './LayerShortcuts';

/**
 * Layers of a model: service, breadcrumbs, view per layer, shortcuts (016d);
 * all with the prefix fpb, so a host module cannot replace them by chance
 * (016g C3)
 */
export default {
  __init__: ['fpbLayers', 'fpbBreadcrumbs', 'fpbLayerViews', 'fpbLayerShortcuts'],
  fpbLayers: ['type', Layers],
  fpbBreadcrumbs: ['type', Breadcrumbs],
  fpbLayerViews: ['type', LayerViews],
  fpbLayerShortcuts: ['type', LayerShortcuts]
};
