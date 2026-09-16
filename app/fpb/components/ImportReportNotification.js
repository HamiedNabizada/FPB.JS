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
  if (!report || !report.warnings || report.warnings.length === 0) {
    return null;
  }

  const { warnings } = report;

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
        Import completed with {warnings.length} {warnings.length === 1 ? 'note' : 'notes'}
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
