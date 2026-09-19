import PopupMenuModule from 'diagram-js/lib/features/popup-menu';
import SelectionModule from 'diagram-js/lib/features/selection';
import FpbAppend from './FpbAppend';
import AppendHandler from './AppendHandler';
import AppendMenuProvider from './AppendMenuProvider';

function registerAppend(commandStack) {
  commandStack.registerHandler('fpb.append', AppendHandler);
}
registerAppend.$inject = ['commandStack'];

export default {
  __depends__: [PopupMenuModule, SelectionModule],
  __init__: [registerAppend, 'fpbAppend', 'appendMenuProvider'],
  fpbAppend: ['type', FpbAppend],
  appendMenuProvider: ['type', AppendMenuProvider]
};
