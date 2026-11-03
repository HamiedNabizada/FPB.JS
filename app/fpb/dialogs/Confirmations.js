/**
 * Answers confirmation.required with a question of the modeler (016e T3),
 * so a host without layer panel gets it too, and fires
 * confirmation.confirmed or confirmation.cancelled with its action, as the
 * React dialog did before.
 *
 * Default priority, registered with the modeler: it runs before listeners
 * a host adds later with the same priority. In diagram-js any listener that
 * returns a value stops the event, so a lower priority would let a host's
 * `(e) => list.push(e)` swallow the question.
 *
 * A host that asks itself creates the modeler with `confirmations: false`.
 * One that answers anyway (confirmation.confirmed or .cancelled with the
 * same action) withdraws the question of the modeler, so the action runs
 * once (016e D1, final review). A question that cannot be shown counts as
 * Cancel, so nothing waits for it (016g D2).
 */
export default function Confirmations(eventBus, fpbDialogs, config) {
  if (config && config.confirmations === false) {
    return;
  }
  const asked = new Map();
  let answering = false;

  eventBus.on('confirmation.required', function (event) {
    const action = event.action;
    const withdrawn = new AbortController();
    if (action) {
      asked.set(action, withdrawn);
    }
    fpbDialogs.confirm({
      title: event.title,
      message: event.message,
      details: event.details,
      confirmLabel: event.confirmLabel,
      danger: event.confirmVariant === 'danger',
      blocked: !!event.isBlocked
    }, { signal: withdrawn.signal }).catch(function (error) {
      console.error('FPB.js could not show the question', error);
      return false;
    }).then(function (confirmed) {
      if (!action || withdrawn.signal.aborted) {
        return;
      }
      asked.delete(action);
      answering = true;
      try {
        eventBus.fire(confirmed ? 'confirmation.confirmed' : 'confirmation.cancelled', { action });
      } finally {
        answering = false;
      }
    });
  });

  // someone else answered: the question of the modeler is withdrawn
  eventBus.on(['confirmation.confirmed', 'confirmation.cancelled'], function (event) {
    const withdrawn = !answering && event.action && asked.get(event.action);
    if (withdrawn) {
      asked.delete(event.action);
      withdrawn.abort();
    }
  });
}

Confirmations.$inject = ['eventBus', 'fpbDialogs', 'config'];
