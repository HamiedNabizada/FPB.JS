import React, { useState, useEffect, memo } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const ErrorNotification = memo(({ error, onDismiss, autoHide = true, hideDelay = 5000 }) => {
  const [show, setShow] = useState(!!error);

  useEffect(() => {
    if (error) {
      setShow(true);
      if (autoHide) {
        const timer = setTimeout(() => {
          setShow(false);
          if (onDismiss) onDismiss();
        }, hideDelay);
        return () => clearTimeout(timer);
      }
    }
  }, [error, autoHide, hideDelay, onDismiss]);

  const handleDismiss = () => {
    setShow(false);
    if (onDismiss) onDismiss();
  };

  if (!show || !error) return null;

  return (
    <Alert 
      variant="danger" 
      dismissible 
      onClose={handleDismiss}
      className="position-fixed"
      style={{ 
        top: '20px', 
        right: '20px', 
        zIndex: 9999,
        minWidth: '300px',
        maxWidth: '500px'
      }}
    >
      <Alert.Heading>
        <FontAwesomeIcon icon="exclamation-triangle" className="me-2" />
        Import Error
      </Alert.Heading>
      <p>{error.message || error}</p>
      {error.details && (
        <details>
          <summary>Technical Details</summary>
          <pre style={{ fontSize: '0.8em', marginTop: '0.5rem' }}>
            {error.details}
          </pre>
        </details>
      )}
      <hr />
      <div className="d-flex justify-content-end">
        <Button variant="outline-danger" size="sm" onClick={handleDismiss}>
          <FontAwesomeIcon icon="times" className="me-1" />
          Dismiss
        </Button>
      </div>
    </Alert>
  );
});

export default ErrorNotification;