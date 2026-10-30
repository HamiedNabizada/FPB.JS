/**
 * Answers confirmation.required with a question of the modeler (016e T3),
 * so a host without layer panel gets it too, and fires
 * confirmation.confirmed or confirmation.cancelled with its action, as the
 * React dialog did before. A host that asks itself listens with a priority
 * above 1000 and returns false.
 *
 * Default priority, registered with the modeler: it runs before listeners
 * a host adds later with the same priority. In diagram-js any listener that
 * returns a value stops the event, so a lower priority would let a host's
 * `(e) => list.push(e)` swallow the question.
 */
export default function Confirmations(eventBus, fpbDialogs) {
  eventBus.on('confirmation.required', function (event) {
    const action = event.action;
    fpbDialogs.confirm({
      title: event.title,
      message: event.message,
      details: event.details,
      confirmLabel: event.confirmLabel,
      danger: event.confirmVariant === 'danger',
      blocked: !!event.isBlocked
    }).then(function (confirmed) {
      if (action) {
        eventBus.fire(confirmed ? 'confirmation.confirmed' : 'confirmation.cancelled', { action });
      }
    });
  });
}

Confirmations.$inject = ['eventBus', 'fpbDialogs'];
