import DirectEditingModule from 'diagram-js-direct-editing';
import ContextPadModule from 'diagram-js/lib/features/context-pad';
import SelectionModule from 'diagram-js/lib/features/selection';
import ConnectModule from 'diagram-js/lib/features/connect';
import CreateModule from 'diagram-js/lib/features/create';

import ContextPadProvider from './FpbContextPadProvider';
import FpbDelete from './FpbDelete';
import ContextPadPosition from './ContextPadPosition';

export default {
  __depends__: [
    DirectEditingModule,
    ContextPadModule,
    SelectionModule,
    ConnectModule,
    CreateModule
  ],
  __init__: [ 'fpbDelete', 'contextPadProvider', 'contextPadPosition' ],
  fpbDelete: [ 'type', FpbDelete ],
  contextPadProvider: [ 'type', ContextPadProvider ],
  contextPadPosition: [ 'type', ContextPadPosition ]
};