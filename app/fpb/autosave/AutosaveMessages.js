/**
 * The browser backup in the message stack (016e V3): the backups of tabs
 * that are gone (closed, reloaded, crashed) are offered, nothing is loaded
 * without the user's choice. A backup is restored into this tab unless this
 * tab has unsaved work of its own; then it opens in a new tab, so neither
 * model is lost. Also says when the browser refuses to keep a backup.
 * Part of the modeler, so a host without layer panel sees it too.
 */
export default function AutosaveMessages(eventBus, autosave, injector, translate) {
  const notifications = injector.get('fpbNotifications');

  const offer = function (pending, dirty) {
    if (!pending || !pending.length) {
      notifications.dismiss('autosave.pending');
      return;
    }
    const one = pending.length === 1;
    notifications.show({
      key: 'autosave.pending',
      type: 'info',
      title: one
        ? translate('Unsaved model found')
        : translate('{count} unsaved models found', { count: String(pending.length) }),
      message: one
        ? translate('This browser still holds a model that was not downloaded.')
        : translate('This browser still holds models that were not downloaded.'),
      items: pending.map((backup) => ({
        message: backup.title,
        hint: backup.savedAt ? new Date(backup.savedAt).toLocaleString() : undefined,
        actions: [
          {
            label: translate('Discard'),
            ariaLabel: translate('Discard {title}', { title: backup.title }),
            run: () => autosave.discard(backup.id)
          },
          dirty
            ? {
              label: translate('Open in new tab'),
              ariaLabel: translate('Open {title} in a new tab', { title: backup.title }),
              primary: true,
              run: () => autosave.openInNewTab(backup.id)
            }
            : {
              label: translate('Restore'),
              ariaLabel: translate('Restore {title}', { title: backup.title }),
              primary: true,
              run: () => autosave.restore(backup.id)
            }
        ]
      }))
    });
  };

  eventBus.on('autosave.changed', function (event) {
    offer(event.pending || [], event.dirty);
  });

  eventBus.on('autosave.failed', function () {
    notifications.show({
      key: 'autosave.failed',
      type: 'warning',
      message: translate('This browser could not keep a backup of your model. Download it to keep your changes safe.')
    });
  });

  offer(autosave.getPending(), autosave.isDirty());
}

AutosaveMessages.$inject = ['eventBus', 'autosave', 'injector', 'translate'];
