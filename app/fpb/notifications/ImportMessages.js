/**
 * The importer's messages in the stack (016e V3, T4): an error, and after an
 * import that went through the report of what was skipped or arranged, with
 * the result of the model check. Part of the modeler, so a host without
 * layer panel sees them too (R10).
 *
 * Also refuses files dropped outside the import dialog: the browser would
 * open them and leave the page, with the unsaved model.
 */
export default function ImportMessages(eventBus, injector, translate) {
  const notifications = injector.get('fpbNotifications');
  let warnings = [];
  // notes of an AML import (feature 028), shown with the report of that import
  let amlNotes = [];

  // a new import starts: the error of the one before no longer applies
  // (016e D1, final review)
  eventBus.on('FPBJS.import', function () {
    notifications.dismiss('import.error');
  });

  eventBus.on('import.error', function (event) {
    amlNotes = [];
    notifications.show({
      key: 'import.error',
      type: 'error',
      title: translate('Import Error'),
      message: event.message,
      details: event.details || undefined
    });
  });

  // shown at once: an AML file without FPD content sends no import.done;
  // import.done then replaces it with the full report
  eventBus.on('import.report', function (event) {
    warnings = event.warnings || [];
    if (warnings.length) {
      showReport(warnings, null);
    }
  });

  eventBus.on('aml.importNotes', function (event) {
    amlNotes = event.notes || [];
  });

  // After the import the model check runs; its result belongs in the report,
  // otherwise a file that imports cleanly but breaks rules says nothing
  eventBus.on('import.done', function () {
    const notes = amlNotes.concat(warnings);
    warnings = [];
    amlNotes = [];
    const validation = injector.get('fpbValidation', false);
    showReport(notes, validation ? validation.run() && validation.getCounts() : null);
  });

  function showReport(notes, check) {
    const validation = injector.get('fpbValidation', false);
    const findings = check ? check.error + check.warning : 0;
    if (!notes.length && !findings) {
      notifications.dismiss('import.report');
      return;
    }
    notifications.show({
      key: 'import.report',
      type: 'warning',
      title: notes.length
        ? translate('Import completed with {count} {notes}', {
          count: String(notes.length),
          notes: notes.length === 1 ? translate('note') : translate('notes')
        })
        : translate('Import completed'),
      message: findings ? describeCheck(check, translate) : undefined,
      items: notes.map((note) => ({
        message: note.message,
        hint: note.hint || undefined,
        details: note.details || undefined
      })),
      // a host without the list of the modeler shows the findings itself
      actions: findings && validation && validation.hasList()
        ? [{ label: translate('Show findings'), run: () => validation.openPanel() }]
        : undefined
    });
  }

  // The import dialog handles its own drops first (defaultPrevented);
  // everywhere else a dragged file is refused
  const refuse = function (event) {
    const files = event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files');
    if (files && !event.defaultPrevented) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    }
  };
  window.addEventListener('dragover', refuse);
  window.addEventListener('drop', refuse);
  eventBus.on('diagram.destroy', function () {
    window.removeEventListener('dragover', refuse);
    window.removeEventListener('drop', refuse);
  });
}

ImportMessages.$inject = ['eventBus', 'injector', 'translate'];

// numbers as text: translate() leaves a placeholder with 0 unfilled
function describeCheck(check, translate) {
  return translate('Model check (VDI 3682): {errors} {errorWord}, {warnings} {warningWord}', {
    errors: String(check.error),
    errorWord: check.error === 1 ? translate('error') : translate('errors'),
    warnings: String(check.warning),
    warningWord: check.warning === 1 ? translate('warning') : translate('warnings')
  });
}
