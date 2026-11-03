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
 * open(Component, props, { className, role, described }) renders
 * <Component {...props} close titleId descriptionId /> with the Preact of FPB.js and returns { close(result),
 * closed }, a promise of the result; Escape and close() without a result
 * give undefined. mount(fn, { className }) leaves the drawing to the caller:
 * fn(element, { close, titleId }) returns a function that clears it. Add-on
 * bundles with their own copy of Preact (fpbjs/aml) and hosts use mount,
 * since hooks only work with the render of their own copy.
 * confirm(options, { signal }) asks one question after the other and
 * resolves true for the named answer, false otherwise; an AbortSignal
 * withdraws the question (false), whether it waits or is open.
 *
 * A dialog that fails to render leaves nothing behind: the error goes to
 * the caller and `closed` gives undefined. After the modeler is destroyed
 * nothing opens any more (016g D2).
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
  return this.mount(function (element, { close, titleId, descriptionId }) {
    render(<Component {...props} close={close} titleId={titleId} descriptionId={descriptionId} />, element);
    return () => render(null, element);
  }, options);
};

Dialogs.prototype.mount = function (mount, options = {}) {
  if (this._destroyed) {
    return { close: function () {}, closed: Promise.resolve(undefined) };
  }
  const dialog = document.createElement('dialog');
  dialog.className = options.className ? 'fpb-dialog ' + options.className : 'fpb-dialog';
  const titleId = 'fpb-dialog-title-' + (++this._count);
  const descriptionId = titleId + '-description';
  dialog.setAttribute('aria-labelledby', titleId);
  // a question (alertdialog) is read with what it says, not only its title
  if (options.role) {
    dialog.setAttribute('role', options.role);
  }
  if (options.described) {
    dialog.setAttribute('aria-describedby', descriptionId);
  }
  this._hostElement().appendChild(dialog);

  // given back on close ourselves: the browser does not in every case
  const opener = document.activeElement;
  let resolve;
  const closed = new Promise((r) => {
    resolve = r;
  });
  let done = false;
  let unmount = null;
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
      if (unmount) {
        unmount();
      }
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
  try {
    unmount = mount(dialog, { close: handle.close, titleId, descriptionId }) || null;
    dialog.showModal();
  } catch (error) {
    done = true;
    this._open.delete(handle);
    dialog.remove();
    resolve(undefined);
    throw error;
  }
  return handle;
};

Dialogs.prototype.confirm = function (options = {}, { signal } = {}) {
  // one question after the other, in the order they were asked
  const answer = this._questions.then(() => {
    if (this._destroyed || (signal && signal.aborted)) {
      return false;
    }
    const handle = this.open(ConfirmDialog, { options, translate: this._translate }, {
      className: 'fpb-confirm',
      role: 'alertdialog',
      described: true
    });
    if (signal) {
      const withdraw = () => handle.close(false);
      signal.addEventListener('abort', withdraw, { once: true });
      handle.closed.then(() => signal.removeEventListener('abort', withdraw));
    }
    return handle.closed.then((result) => result === true);
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
