import React, { memo } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/**
 * Shows what the importer had to skip, drop or arrange on its own. Stays
 * until dismissed: unlike an error it is easy to miss and there is nothing
 * to retry, the user may want to fix the file afterwards.
 */
const ImportReportNotification = memo(({ report, onDismiss }) => {
  const warnings = (report && report.warnings) || [];
  const check = report && report.check;
  const findings = check ? check.error + check.warning : 0;

  if (!report || (warnings.length === 0 && findings === 0)) {
    return null;
  }

  const summary = warnings.length
    ? `Import completed with ${warnings.length} ${warnings.length === 1 ? 'note' : 'notes'}`
    : 'Import completed';

  return (
    <Alert
      variant="warning"
      dismissible
      onClose={onDismiss}
      className="position-fixed import-report"
      style={{
        top: '20px',
        right: '20px',
        zIndex: 9998,
        minWidth: '320px',
        maxWidth: '560px',
        maxHeight: '70vh',
        overflowY: 'auto'
      }}
    >
      <Alert.Heading>
        <FontAwesomeIcon icon="exclamation-triangle" className="me-2" />
        {summary}
      </Alert.Heading>
      <ul className="mb-2 ps-3">
        {warnings.map((warning, index) => (
          <li key={index} className="mb-2">
            <div>{warning.message}</div>
            {warning.hint && (
              <div className="small text-muted">{warning.hint}</div>
            )}
            {warning.details && (
              <details>
                <summary className="small">Technical details</summary>
                <pre style={{ fontSize: '0.8em', marginTop: '0.25rem' }}>{warning.details}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
      {findings > 0 && (
        <div className="mb-2 import-report-check">
          <div>
            Model check (VDI 3682): {check.error} {check.error === 1 ? 'error' : 'errors'},{' '}
            {check.warning} {check.warning === 1 ? 'warning' : 'warnings'}
          </div>
          {report.onOpenCheck && (
            <Button variant="outline-warning" size="sm" className="mt-1" onClick={report.onOpenCheck}>
              Show findings
            </Button>
          )}
        </div>
      )}
      <div className="d-flex justify-content-end">
        <Button variant="outline-warning" size="sm" onClick={onDismiss}>
          <FontAwesomeIcon icon="times" className="me-1" />
          Dismiss
        </Button>
      </div>
    </Alert>
  );
});

export default ImportReportNotification;
