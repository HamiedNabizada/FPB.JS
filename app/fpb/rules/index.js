import RulesModule from 'diagram-js/lib/features/rules';

import FpbRules from './FpbRuleProvider';

export default {
  __depends__: [
    RulesModule
  ],
  __init__: [ 'fpbRuleProvider' ],
  fpbRuleProvider: [ 'type', FpbRules ]
};
