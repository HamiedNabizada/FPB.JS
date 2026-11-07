import DirectEditingModule from 'diagram-js-direct-editing';
import ContextPadModule from 'diagram-js/lib/features/context-pad';
import HoverTooltipModule from 'diagram-js/lib/features/hover-tooltip';
import SelectionModule from 'diagram-js/lib/features/selection';
import ConnectModule from 'diagram-js/lib/features/connect';
import CreateModule from 'diagram-js/lib/features/create';

import ContextPadProvider from './FpbContextPadProvider';
import FpbDelete from './FpbDelete';
import AmlLinks from './AmlLinks';
import ContextPadPosition from './ContextPadPosition';
import ContextPadTooltips from './ContextPadTooltips';
import ReconnectQuestion from './ReconnectQuestion';

export default {
  __depends__: [
    DirectEditingModule,
    ContextPadModule,
    HoverTooltipModule,
    SelectionModule,
    ConnectModule,
    CreateModule
  ],
  __init__: [ 'fpbDelete', 'fpbReconnectQuestion', 'contextPadProvider', 'contextPadPosition', 'contextPadTooltips' ],
  fpbAmlLinks: [ 'type', AmlLinks ],
  fpbDelete: [ 'type', FpbDelete ],
  fpbReconnectQuestion: [ 'type', ReconnectQuestion ],
  contextPadProvider: [ 'type', ContextPadProvider ],
  contextPadPosition: [ 'type', ContextPadPosition ],
  contextPadTooltips: [ 'type', ContextPadTooltips ]
};