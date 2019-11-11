import BehaviorModule from './behavior';
import RulesModule from '../rules';


import CommandModule from 'diagram-js/lib/command';
import TooltipsModule from 'diagram-js/lib/features/tooltips';
import LabelSupportModule from 'diagram-js/lib/features/label-support';
import AttachSupportModule from 'diagram-js/lib/features/attach-support';
import SelectionModule from 'diagram-js/lib/features/selection';
import ChangeSupportModule from 'diagram-js/lib/features/change-support';
import SpaceToolModule from 'diagram-js/lib/features/space-tool';


import FpbFactory from './FpbFactory';
import FpbElementFactory from './FpbElementFactory';
import FpbUpdater from './FpbUpdater';
import FpbModeling from './FpbModeling';
import FpbLayouter from './FpbLayouter';
import CroppingConnectionDocking from 'diagram-js/lib/layout/CroppingConnectionDocking';


export default {
  __init__: [
    'modeling',
    'fpbUpdater'
  ],
  __depends__: [
    BehaviorModule,
    RulesModule,
    CommandModule,
    TooltipsModule,
    LabelSupportModule,
    AttachSupportModule,
    SelectionModule,
    ChangeSupportModule,
    SpaceToolModule
  ],

  fpbFactory: [ 'type', FpbFactory ],
  fpbUpdater: [ 'type', FpbUpdater ],
  elementFactory: [ 'type', FpbElementFactory ],
  modeling: [ 'type', FpbModeling ],
  layouter: [ 'type', FpbLayouter ],
  connectionDocking: [ 'type', CroppingConnectionDocking ]
};