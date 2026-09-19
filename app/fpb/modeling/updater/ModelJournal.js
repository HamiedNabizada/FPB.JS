import {
  add as collectionAdd,
  remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

/**
 * Journal of the business model changes made by an updater while a command runs.
 *
 * diagram-js reverts the canvas of its commands, not the FPB model the updaters
 * maintain next to it (elementsContainer, incoming/outgoing, isAssignedTo,
 * inTandemWith, child layers). The updaters route every change through the
 * tracked helpers below; undo replays the journal backwards. Outside of
 * runJournaled the helpers behave like the plain collection functions.
 */

let activeJournal = null;

export function runJournaled(fn) {
  const previous = activeJournal;
  const journal = activeJournal = [];
  try {
    fn();
  } finally {
    activeJournal = previous;
  }
  return journal;
}

export function revertJournal(journal) {
  for (let i = (journal || []).length - 1; i >= 0; i--) {
    const entry = journal[i];
    if (entry.op === 'add') {
      collectionRemove(entry.collection, entry.element);
    } else if (entry.op === 'remove') {
      if (entry.collection.indexOf(entry.element) === -1) {
        entry.collection.splice(Math.min(entry.idx, entry.collection.length), 0, entry.element);
      }
    } else if (entry.op === 'set') {
      entry.target[entry.key] = entry.old;
    } else if (entry.op === 'undo') {
      entry.fn();
    }
  }
}

export function addTracked(collection, element, idx) {
  if (!collection || !element || collection.indexOf(element) !== -1) {
    collectionAdd(collection, element, idx);
    return;
  }
  collectionAdd(collection, element, idx);
  if (activeJournal) {
    activeJournal.push({ op: 'add', collection: collection, element: element });
  }
}

export function removeTracked(collection, element) {
  const idx = collectionRemove(collection, element);
  if (idx !== -1 && activeJournal) {
    activeJournal.push({ op: 'remove', collection: collection, element: element, idx: idx });
  }
  return idx;
}

export function setTracked(target, key, value) {
  const old = target[key];
  target[key] = value;
  if (activeJournal && old !== value) {
    activeJournal.push({ op: 'set', target: target, key: key, old: old });
  }
}

/** Registers what undo has to do for a side effect that is not a model change (events). */
export function onRevert(fn) {
  if (activeJournal) {
    activeJournal.push({ op: 'undo', fn: fn });
  }
}
