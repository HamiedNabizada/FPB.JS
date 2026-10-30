import InfoDialog from './InfoDialog';

/**
 * The dialog "FPB.js Information" (016e V6, T5): about, keyboard shortcuts,
 * help. open() shows the tab chosen last, open(tab) that tab ('about',
 * 'shortcuts', 'help').
 */
export default function Info(fpbDialogs, translate) {
  this._dialogs = fpbDialogs;
  this._translate = translate;
  this._tab = 'about';
}

Info.$inject = ['fpbDialogs', 'translate'];

Info.prototype.open = function (tab) {
  if (tab) {
    this._tab = tab;
  }
  return this._dialogs.open(InfoDialog, {
    translate: this._translate,
    initialTab: this._tab,
    onTab: (chosen) => {
      this._tab = chosen;
    }
  }, { className: 'fpb-dialog--wide fpb-info-dialog' });
};
