import Layers from './Layers';
import Breadcrumbs from './Breadcrumbs';

/** Layers of a model: service, breadcrumbs, view per layer, shortcuts (016d) */
export default {
  __init__: ['fpbLayers', 'breadcrumbs'],
  fpbLayers: ['type', Layers],
  breadcrumbs: ['type', Breadcrumbs]
};
