/**
 * The rules of the message stack (016e V1), free of the page: a message
 * with the id of one already shown replaces it in place, at most `max` are
 * kept, and only plain information goes away by itself.
 */

const MAX = 5;
const SHORT = 8000;

export function addNote(notes, note, max = MAX) {
  const index = notes.findIndex((n) => n.id === note.id);
  if (index !== -1) {
    const next = notes.slice();
    next[index] = note;
    return next;
  }
  const next = notes.concat([note]);
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Milliseconds until the message goes by itself, 0 when it stays */
export function timeoutOf(note) {
  if (typeof note.timeout === 'number') {
    return note.timeout;
  }
  if (note.type !== 'info' && note.type !== 'success') {
    return 0;
  }
  return hasActions(note) ? 0 : SHORT;
}

function hasActions(note) {
  return (note.actions || []).length > 0
    || (note.items || []).some((item) => (item.actions || []).length > 0);
}
