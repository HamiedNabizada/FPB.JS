import { is, isAny } from '../help/utils';
import { STATE_TYPES, BRANCH_FLOW_TYPES } from './ChangeTypeHandler';

export const CHANGE_TYPE_MENU = 'fpb-change-type';

// Icons in the colors of the shapes (Product #ed2028, Energy #6e9ad1, Information #3050a2)
const SVG = (inner) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">' + inner + '</svg>';

const STATE_ENTRIES = [
  { type: 'fpb:Product', label: 'Product', imageHtml: SVG('<circle cx="10" cy="10" r="8" fill="#ed2028" stroke="#000"/>') },
  { type: 'fpb:Energy', label: 'Energy', imageHtml: SVG('<path d="M10 2l8 8-8 8-8-8z" fill="#6e9ad1" stroke="#000"/>') },
  { type: 'fpb:Information', label: 'Information', imageHtml: SVG('<path d="M5.5 2.5h9L19 10l-4.5 7.5h-9L1 10z" fill="#3050a2" stroke="#000"/>') }
];

// Same pictures as the context pad entries for drawing these connections
const BRANCH_ENTRIES = [
  { type: 'fpb:ParallelFlow', label: 'Parallel branching', imageUrl: 'data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0D%0A%3Csvg%20id%3D%22SVGRoot%22%20version%3D%221.1%22%20viewBox%3D%220%200%2025%2025%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0D%0A%20%3Cdefs%3E%0D%0A%20%20%3Cmarker%20id%3D%22TriangleInL%22%20overflow%3D%22visible%22%20orient%3D%22auto%22%3E%0D%0A%20%20%20%3Cpath%20transform%3D%22scale%28-.8%29%22%20d%3D%22m5.77%200-8.65%205v-10l8.65%205z%22%20fill-rule%3D%22evenodd%22%20stroke%3D%22%23000%22%20stroke-width%3D%221pt%22%2F%3E%0D%0A%20%20%3C%2Fmarker%3E%0D%0A%20%20%3Cmarker%20id%3D%22TriangleInL-8%22%20overflow%3D%22visible%22%20orient%3D%22auto%22%3E%0D%0A%20%20%20%3Cpath%20transform%3D%22scale%28-.8%29%22%20d%3D%22m5.77%200-8.65%205v-10z%22%20fill-rule%3D%22evenodd%22%20stroke%3D%22%23000%22%20stroke-width%3D%221pt%22%2F%3E%0D%0A%20%20%3C%2Fmarker%3E%0D%0A%20%3C%2Fdefs%3E%0D%0A%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-miterlimit%3D%222.2%22%3E%0D%0A%20%20%3Cpath%20d%3D%22m12.799%2011.533-0.0098-8.9845%22%20stroke-width%3D%22.99019%22%2F%3E%0D%0A%20%20%3Cpath%20d%3D%22m6.0455%2011.223%2013.245%200.01629%22%20stroke-width%3D%22.9653%22%2F%3E%0D%0A%20%20%3Cpath%20d%3D%22m6.5158%2018.541-0.010079-7.7641%22%20marker-start%3D%22url%28%23TriangleInL%29%22%20stroke-width%3D%22.93352%22%2F%3E%0D%0A%20%20%3Cpath%20d%3D%22m18.848%2018.539-0.01008-7.7641%22%20marker-start%3D%22url%28%23TriangleInL-8%29%22%20stroke-width%3D%22.93352%22%2F%3E%0D%0A%20%3C%2Fg%3E%0D%0A%3C%2Fsvg%3E' },
  { type: 'fpb:AlternativeFlow', label: 'Alternative branching', imageUrl: 'data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0D%0A%3Csvg%20id%3D%22SVGRoot%22%20version%3D%221.1%22%20viewBox%3D%220%200%2025%2025%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0D%0A%20%3Cdefs%3E%0D%0A%20%20%3Cmarker%20id%3D%22TriangleInM%22%20overflow%3D%22visible%22%20orient%3D%22auto%22%3E%0D%0A%20%20%20%3Cpath%20transform%3D%22scale%28-.4%29%22%20d%3D%22m5.77%200-8.65%205v-10l8.65%205z%22%20fill-rule%3D%22evenodd%22%20stroke%3D%22%23000%22%20stroke-width%3D%221pt%22%2F%3E%0D%0A%20%20%3C%2Fmarker%3E%0D%0A%20%20%3Cmarker%20id%3D%22TriangleInM-8%22%20overflow%3D%22visible%22%20orient%3D%22auto%22%3E%0D%0A%20%20%20%3Cpath%20transform%3D%22scale%28-.4%29%22%20d%3D%22m5.77%200-8.65%205v-10z%22%20fill-rule%3D%22evenodd%22%20stroke%3D%22%23000%22%20stroke-width%3D%221pt%22%2F%3E%0D%0A%20%20%3C%2Fmarker%3E%0D%0A%20%3C%2Fdefs%3E%0D%0A%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-linejoin%3D%22round%22%20stroke-miterlimit%3D%222.5%22%3E%0D%0A%20%20%3Cpath%20d%3D%22m9.8561%2018.205-8.3236-17.094%22%20marker-start%3D%22url%28%23TriangleInM%29%22%20stroke-width%3D%221.3328%22%2F%3E%0D%0A%20%20%3Cpath%20d%3D%22m14.802%2018.431%208.8712-17.262%22%20marker-start%3D%22url%28%23TriangleInM-8%29%22%20stroke-width%3D%221.2274%22%2F%3E%0D%0A%20%3C%2Fg%3E%0D%0A%3C%2Fsvg%3E' }
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
  const options = is(element, 'fpb:State') ? STATE_ENTRIES : (isAny(element, BRANCH_FLOW_TYPES) ? BRANCH_ENTRIES : []);
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
