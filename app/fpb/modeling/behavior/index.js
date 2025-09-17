import LabelBehavior from './LabelBehavior';
import ModelingFeedback from './ModelingFeedback';
import DataBehavior from './DataBehavior'
import ReplaceConnectionBehavior from './ReplaceConnectionBehavior';
import SystemLimitSmartResizeHandler from './SystemLimitSmartResizeHandler';
import SystemLimitDropFeedbackBlocker from './SystemLimitDropFeedbackBlocker';
import FpbFactory from '../FpbFactory';

export default {
  __init__: [
    'modelingFeedback',
    'labelBehavior',
    'replaceConnectionBehavior',
    'dataBehavior',
    'systemLimitSmartResizeHandler',
    'systemLimitDropFeedbackBlocker'
  ],
  __depends__: [
    FpbFactory
  ],
  modelingFeedback: ['type', ModelingFeedback],
  labelBehavior: ['type', LabelBehavior],
  replaceConnectionBehavior: [ 'type', ReplaceConnectionBehavior ],
  dataBehavior: ['type', DataBehavior],
  systemLimitSmartResizeHandler: ['type', SystemLimitSmartResizeHandler],
  systemLimitDropFeedbackBlocker: ['type', SystemLimitDropFeedbackBlocker]
};