import KeyboardModule from 'diagram-js/lib/features/keyboard';
import SelectionModule from 'diagram-js/lib/features/selection';
import FpbSearch from './FpbSearch';

export default {
  __depends__: [
    KeyboardModule,
    SelectionModule
  ],
  __init__: ['fpbSearch'],
  fpbSearch: ['type', FpbSearch]
};
