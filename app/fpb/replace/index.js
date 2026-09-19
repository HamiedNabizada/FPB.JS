import PopupMenuModule from 'diagram-js/lib/features/popup-menu';
import ChangeTypeHandler from './ChangeTypeHandler';
import ChangeTypeMenuProvider from './ChangeTypeMenuProvider';
import './PopupMenu.css';

function registerChangeType(commandStack) {
  commandStack.registerHandler('fpb.changeType', ChangeTypeHandler);
}
registerChangeType.$inject = ['commandStack'];

export default {
  __depends__: [PopupMenuModule],
  __init__: [registerChangeType, 'changeTypeMenuProvider'],
  changeTypeMenuProvider: ['type', ChangeTypeMenuProvider]
};
