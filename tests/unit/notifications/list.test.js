import { describe, it, expect } from 'vitest';

import { addNote, timeoutOf } from '../../../app/fpb/notifications/list.js';

/**
 * The message stack (016e V1): a message with the id of one already shown
 * replaces it in place, at most five are kept, and only plain information
 * goes away by itself.
 */

const note = (id, type = 'info', more = {}) => Object.assign({ id, type, title: id }, more);

describe('addNote', () => {

  it('adds a message at the end', () => {
    const notes = addNote(addNote([], note('a')), note('b'));
    expect(notes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('replaces a message with the same id in its place', () => {
    let notes = [note('a'), note('b'), note('c')];
    notes = addNote(notes, note('b', 'error', { title: 'new' }));
    expect(notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(notes[1].title).toBe('new');
    expect(notes[1].type).toBe('error');
  });

  it('keeps at most five, the oldest goes', () => {
    let notes = [];
    ['1', '2', '3', '4', '5', '6'].forEach((id) => {
      notes = addNote(notes, note(id));
    });
    expect(notes.map((n) => n.id)).toEqual(['2', '3', '4', '5', '6']);
  });

  it('does not change the list it was given', () => {
    const notes = [note('a')];
    addNote(notes, note('b'));
    expect(notes.map((n) => n.id)).toEqual(['a']);
  });
});

describe('timeoutOf', () => {

  const action = { label: 'Go', run() {} };

  it('lets information and success go after 8 seconds', () => {
    expect(timeoutOf(note('a', 'info'))).toBe(8000);
    expect(timeoutOf(note('a', 'success'))).toBe(8000);
  });

  it('keeps errors and warnings', () => {
    expect(timeoutOf(note('a', 'error'))).toBe(0);
    expect(timeoutOf(note('a', 'warning'))).toBe(0);
  });

  it('keeps information with a button, also a button of an item', () => {
    expect(timeoutOf(note('a', 'info', { actions: [action] }))).toBe(0);
    expect(timeoutOf(note('a', 'info', { items: [{ message: 'x', actions: [action] }] }))).toBe(0);
  });

  it('takes a given time', () => {
    expect(timeoutOf(note('a', 'error', { timeout: 3000 }))).toBe(3000);
    expect(timeoutOf(note('a', 'info', { timeout: 0 }))).toBe(0);
  });
});
