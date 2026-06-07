import React from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/**
 * A confirmation modal for actions with layer-wide consequences
 */
const ConfirmationModal = ({ show, onConfirm, onCancel, title, message, details, isBlocked }) => {
  return (
    <Modal show={show} onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <FontAwesomeIcon icon="exclamation-triangle" className={`me-2 ${isBlocked ? 'text-danger' : 'text-warning'}`} />
          {title || 'Confirmation required'}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p>{message}</p>
        {details && (
          <div className={`alert ${isBlocked ? 'alert-warning' : 'alert-secondary'}`} role="alert">
            <small>{details}</small>
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        {isBlocked ? (
          <Button variant="primary" onClick={onCancel}>
            OK
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onCancel}>
              <FontAwesomeIcon icon="times" className="me-1" />
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm}>
              <FontAwesomeIcon icon="check" className="me-1" />
              Yes, proceed
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default ConfirmationModal;
