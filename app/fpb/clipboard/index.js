import SelectionModule from 'diagram-js/lib/features/selection';
import FpbCopyPaste from './FpbCopyPaste';
import PasteHandler from './PasteHandler';

function registerPaste(commandStack) {
  commandStack.registerHandler('fpb.paste', PasteHandler);
}
registerPaste.$inject = ['commandStack'];

export default {
  __depends__: [SelectionModule],
  __init__: [registerPaste, 'fpbCopyPaste'],
  fpbCopyPaste: ['type', FpbCopyPaste]
};
