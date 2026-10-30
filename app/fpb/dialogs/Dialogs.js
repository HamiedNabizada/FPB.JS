/** @jsx h */
import { h, render } from '@bpmn-io/properties-panel/preact';

import ConfirmDialog from './ConfirmDialog';

/**
 * The dialogs of the modeler (016e V4, T2): each a native <dialog> opened
 * with showModal, so the rest of the page waits, Escape cancels and nothing
 * behind it takes a click. They live in an element of their own under
 * <body>, which follows light and dark like the containers of FPB.js; the
 * wheel and touch handlers of the canvas do not reach them there.
 *
 * open(Component, props, { className }) renders <Component {...props}
 * close titleId /> and returns { close(result), closed }, a promise of the
 * result; Escape and close() without a result give undefined.
 * confirm(options) asks one question after the other and resolves true for
 * the named answer, false otherwise.
 */
export default function Dialogs(eventBus, injector, translate) {
  this._translate = translate;
  this._theme = injector.get('fpbTheme', false);
  this._host = null;
  this._open = new Set();
  this._count = 0;
  this._questions = Promise.resolve();
  this._destroyed = false;

  const self = this;
  eventBus.on('diagram.destroy', function () {
    self._destroyed = true;
    self._open.forEach((handle) => handle.close(undefined));
    if (self._host) {
      self._host.remove();
      self._host = null;
    }
  });
}

Dialogs.$inject = ['eventBus', 'injector', 'translate'];

Dialogs.prototype.open = function (Component, props = {}, options = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = options.className ? 'fpb-dialog ' + options.className : 'fpb-dialog';
  const titleId = 'fpb-dialog-title-' + (++this._count);
  dialog.setAttribute('aria-labelledby', titleId);
  this._hostElement().appendChild(dialog);

  // given back on close ourselves: the browser does not in every case
  const opener = document.activeElement;
  let resolve;
  const closed = new Promise((r) => {
    resolve = r;
  });
  let done = false;
  const handle = {
    close: (result) => {
      if (done) {
        return;
      }
      done = true;
      this._open.delete(handle);
      if (dialog.open) {
        dialog.close();
      }
      render(null, dialog);
      dialog.remove();
      if (!this._destroyed && opener && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus();
      }
      resolve(result);
    },
    closed
  };

  dialog.addEventListener('cancel', function (event) {
    event.preventDefault();
    handle.close(undefined);
  });

  this._open.add(handle);
  render(<Component {...props} close={handle.close} titleId={titleId} />, dialog);
  dialog.showModal();
  return handle;
};

Dialogs.prototype.confirm = function (options = {}) {
  // one question after the other, in the order they were asked
  const answer = this._questions.then(() => {
    if (this._destroyed) {
      return false;
    }
    return this.open(ConfirmDialog, { options, translate: this._translate }, { className: 'fpb-confirm' })
      .closed.then((result) => result === true);
  });
  this._questions = answer.catch(() => false);
  return answer;
};

Dialogs.prototype._hostElement = function () {
  if (!this._host) {
    const host = this._host = document.createElement('div');
    host.className = 'fpb-dialogs';
    document.body.appendChild(host);
    if (this._theme) {
      this._theme.addContainer(host);
    }
  }
  return this._host;
};
