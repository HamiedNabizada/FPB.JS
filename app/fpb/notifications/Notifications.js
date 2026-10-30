/** @jsx h */
import { h, render } from '@bpmn-io/properties-panel/preact';

import { addNote, timeoutOf } from './list';
import NotificationStack from './NotificationStack';

/**
 * The message stack (016e V1, T1): every message that belongs to no element
 * (import errors and reports, the browser backup, hints of the canvas) as a
 * card at the bottom right of the canvas. Part of the modeler, so a host
 * without layer panel sees them too (R10).
 *
 * show({ key, type, title, message, items, details, actions, timeout })
 * returns the id of the message: the key if given, so the same key replaces
 * a message instead of stacking it.
 */
export default function Notifications(eventBus, canvas, translate) {
  this._eventBus = eventBus;
  this._translate = translate;
  this._notes = [];
  this._timers = new Map();
  this._held = new Map();
  this._count = 0;

  const section = this._section = document.createElement('section');
  section.className = 'fpb-notifications';
  section.setAttribute('aria-label', translate('Messages'));
  section.setAttribute('aria-live', 'polite');
  // diagram-js takes the wheel on its container: over a message it scrolls
  // the message, not the canvas
  section.addEventListener('wheel', function (event) {
    event.stopPropagation();
  });
  canvas.getContainer().appendChild(section);

  const self = this;
  eventBus.on('diagram.destroy', function () {
    self._timers.forEach((timer) => clearTimeout(timer));
    self._timers.clear();
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
  // messages pushed out of the stack take their timers with them
  this._timers.forEach((timer, timerId) => {
    if (!this._notes.some((n) => n.id === timerId)) {
      this._stop(timerId);
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
