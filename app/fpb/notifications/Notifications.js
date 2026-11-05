/** @jsx h */
import { h, render } from '@bpmn-io/properties-panel/preact';

import { addNote, timeoutOf } from './list';
import NotificationStack from './NotificationStack';

// below this width of the canvas the stack takes the free width (CSS is-narrow)
const NARROW = 640;

/**
 * The message stack (016e V1, T1): every message that belongs to no element
 * (import errors and reports, the browser backup, hints of the canvas) as a
 * card at the bottom right of the canvas. Part of the modeler, so a host
 * without layer panel sees them too (R10).
 *
 * show({ key, type, title, message, items, details, actions, timeout,
 * onDismiss }) returns the id of the message: the key if given, so the same
 * key replaces a message instead of stacking it. onDismiss runs when the
 * user closes the message with its cross.
 *
 * Inside the canvas (role "application") the stack is a document, so a
 * screen reader reads the messages; it says each one once, politely, also
 * errors (016g D4).
 */
export default function Notifications(eventBus, canvas, translate) {
  this._eventBus = eventBus;
  this._canvas = canvas;
  this._translate = translate;
  this._notes = [];
  this._timers = new Map();
  this._held = new Map();
  this._count = 0;

  const section = this._section = document.createElement('section');
  section.className = 'fpb-notifications';
  section.setAttribute('role', 'document');
  section.setAttribute('aria-label', translate('Messages'));
  section.setAttribute('aria-live', 'polite');
  // diagram-js takes the wheel on its container: over a message it scrolls
  // the message, not the canvas
  section.addEventListener('wheel', function (event) {
    event.stopPropagation();
  });
  const container = canvas.getContainer();
  container.appendChild(section);

  const layout = function () {
    section.classList.toggle('is-narrow', container.clientWidth > 0 && container.clientWidth < NARROW);
  };
  if (typeof ResizeObserver !== 'undefined') {
    this._observer = new ResizeObserver(layout);
    this._observer.observe(container);
  }
  eventBus.on('canvas.resized', layout);

  // its own texts (name, Dismiss, Technical details) in the new language;
  // the messages keep the language they came in (016h V3)
  const stack = this;
  eventBus.on('i18n.changed', function () {
    section.setAttribute('aria-label', translate('Messages'));
    stack._render();
  });
  layout();

  const self = this;
  eventBus.on('diagram.destroy', function () {
    self._timers.forEach((timer) => clearTimeout(timer));
    self._timers.clear();
    if (self._observer) {
      self._observer.disconnect();
    }
    render(null, section);
    section.remove();
  });

  this._render();
}

Notifications.$inject = ['eventBus', 'canvas', 'translate'];

Notifications.prototype.show = function (options) {
  const id = options.key || 'note-' + (++this._count);
  const note = Object.assign({}, options, { id });
  delete note.key;
  this._notes = addNote(this._notes, note);
  // messages pushed out of the stack take their timers and their hold with
  // them: one that comes back goes by itself again (016g D1)
  this._timers.forEach((timer, timerId) => {
    if (!this._notes.some((n) => n.id === timerId)) {
      this._stop(timerId);
    }
  });
  this._held.forEach((reasons, heldId) => {
    if (!this._notes.some((n) => n.id === heldId)) {
      this._held.delete(heldId);
    }
  });
  this._schedule(note);
  this._changed();
  return id;
};

Notifications.prototype.dismiss = function (id) {
  if (!this._notes.some((n) => n.id === id)) {
    return;
  }
  this._stop(id);
  this._held.delete(id);
  this._notes = this._notes.filter((n) => n.id !== id);
  this._changed();
};

/**
 * Closed by the user (the cross): onDismiss of the message runs first. With
 * `restoreFocus` (the cross was used with the keyboard) the focus goes to
 * the cross of the message now in its place, else the one before, else to
 * the canvas (016g D3).
 */
Notifications.prototype.close = function (id, options) {
  const note = this._notes.find((n) => n.id === id);
  const index = this._notes.findIndex((n) => n.id === id);
  if (note && typeof note.onDismiss === 'function') {
    note.onDismiss();
  }
  this.dismiss(id);
  if (options && options.restoreFocus && index !== -1) {
    const cards = this._section.querySelectorAll('.fpb-notification');
    const card = cards[index] || cards[index - 1];
    const cross = card && card.querySelector('.fpb-notification-close');
    if (cross) {
      cross.focus();
    } else {
      this._canvas.focus();
    }
  }
};

Notifications.prototype.clear = function () {
  this._timers.forEach((timer) => clearTimeout(timer));
  this._timers.clear();
  this._held.clear();
  this._notes = [];
  this._changed();
};

Notifications.prototype.list = function () {
  return this._notes.slice();
};

/**
 * The time of a message stops while the pointer rests on it or the focus is
 * in it ('pointer', 'focus'), and starts anew when both are gone.
 */
Notifications.prototype.hold = function (id, reason, on) {
  const reasons = this._held.get(id) || new Set();
  if (on) {
    reasons.add(reason);
    this._held.set(id, reasons);
    this._stop(id);
    return;
  }
  reasons.delete(reason);
  if (reasons.size) {
    return;
  }
  this._held.delete(id);
  const note = this._notes.find((n) => n.id === id);
  if (note) {
    this._schedule(note);
  }
};

Notifications.prototype._schedule = function (note) {
  this._stop(note.id);
  const ms = timeoutOf(note);
  if (!ms || this._held.has(note.id)) {
    return;
  }
  this._timers.set(note.id, setTimeout(() => this.dismiss(note.id), ms));
};

Notifications.prototype._stop = function (id) {
  const timer = this._timers.get(id);
  if (timer) {
    clearTimeout(timer);
    this._timers.delete(id);
  }
};

Notifications.prototype._changed = function () {
  this._render();
  this._eventBus.fire('notifications.changed', { notes: this.list() });
};

Notifications.prototype._render = function () {
  render(<NotificationStack notes={this._notes} service={this} translate={this._translate} />, this._section);
};
