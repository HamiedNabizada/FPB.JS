import { is, isAny } from '../help/utils';
import { STATE_TYPES, BRANCH_FLOW_TYPES } from './ChangeTypeHandler';
import { elementIcon, BRANCH_ICONS } from '../help/menuIcons';

export const CHANGE_TYPE_MENU = 'fpb-change-type';

// Built when the menu opens, so the icons follow the colour scheme
const stateEntries = () => [
  { type: 'fpb:Product', label: 'Product', imageHtml: elementIcon('fpb:Product') },
  { type: 'fpb:Energy', label: 'Energy', imageHtml: elementIcon('fpb:Energy') },
  { type: 'fpb:Information', label: 'Information', imageHtml: elementIcon('fpb:Information') }
];

const BRANCH_ENTRIES = [
  { type: 'fpb:ParallelFlow', label: 'Parallel branching', imageHtml: BRANCH_ICONS['fpb:ParallelFlow'] },
  { type: 'fpb:AlternativeFlow', label: 'Alternative branching', imageHtml: BRANCH_ICONS['fpb:AlternativeFlow'] }
];

/**
 * Entries of the type change menu (context pad entry "Change type").
 */
export default function ChangeTypeMenuProvider(popupMenu, modeling, commandStack) {
  this._commandStack = commandStack;
  popupMenu.registerProvider(CHANGE_TYPE_MENU, this);
}

ChangeTypeMenuProvider.$inject = ['popupMenu', 'modeling', 'commandStack'];

/** Whether the element offers a type change at all. */
export function canChangeType(element) {
  return isAny(element, STATE_TYPES) || isAny(element, BRANCH_FLOW_TYPES);
}

ChangeTypeMenuProvider.prototype.getPopupMenuEntries = function (element) {
  const commandStack = this._commandStack;
  const options = is(element, 'fpb:State') ? stateEntries() : (isAny(element, BRANCH_FLOW_TYPES) ? BRANCH_ENTRIES : []);
  const entries = {};
  options.forEach(function (option) {
    const current = element.type === option.type;
    entries['change-to-' + option.type] = {
      label: option.label,
      imageHtml: option.imageHtml,
      imageUrl: option.imageUrl,
      active: current,
      disabled: current,
      action: function () {
        if (!current) {
          commandStack.execute('fpb.changeType', { element: element, newType: option.type });
        }
      }
    };
  });
  return entries;
};
