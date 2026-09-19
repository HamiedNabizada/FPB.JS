import OverlaysModule from 'diagram-js/lib/features/overlays';
import SelectionModule from 'diagram-js/lib/features/selection';
import FpbValidation from './FpbValidation';

export default {
  __depends__: [OverlaysModule, SelectionModule],
  __init__: ['fpbValidation'],
  fpbValidation: ['type', FpbValidation]
};
