import { elementIcon } from '../help/menuIcons';
import { APPEND_MENU } from './FpbAppend';

/**
 * Entries of the append menu (context pad entry "Append"), shown when there is
 * more than one option.
 */
export default function AppendMenuProvider(popupMenu, fpbAppend, translate) {
  this._fpbAppend = fpbAppend;
  this._translate = translate;
  popupMenu.registerProvider(APPEND_MENU, this);
}

AppendMenuProvider.$inject = ['popupMenu', 'fpbAppend', 'translate'];

AppendMenuProvider.prototype.getPopupMenuEntries = function (element) {
  const fpbAppend = this._fpbAppend;
  const translate = this._translate;
  const entries = {};
  fpbAppend.getOptions(element).forEach(function (option) {
    entries['append-' + option.type] = {
      label: translate(option.label),
      imageHtml: elementIcon(option.type),
      action: function () {
        fpbAppend.append(element, option.type);
      }
    };
  });
  return entries;
};
