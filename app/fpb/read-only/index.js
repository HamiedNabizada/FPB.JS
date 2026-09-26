import CanvasLockModule from '@bpmn-io/diagram-js-canvas-lock';
import '@bpmn-io/diagram-js-canvas-lock/assets/canvas-lock.css';

import ReadOnly from './ReadOnly';
import ReadOnlyRules from './ReadOnlyRules';

export default {
  __depends__: [CanvasLockModule],
  __init__: ['readOnly', 'readOnlyRules'],
  readOnly: ['type', ReadOnly],
  readOnlyRules: ['type', ReadOnlyRules]
};
