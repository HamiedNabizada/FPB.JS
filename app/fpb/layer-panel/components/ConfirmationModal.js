import React from 'react';
import Modal from 'react-bootstrap/Modal';
import { useThemeAttributes } from '../hooks/useThemeAttributes';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/**
 * A question before an action with consequences (016c decision 13): the
 * answer is named after the action ("Remove", "Delete", "Place on
 * boundary"), red when it destroys something. `data-answer` marks the
 * buttons for tests and helpers, whatever their names.
 */
const ConfirmationModal = ({
  show, onConfirm, onCancel, title, message, details, isBlocked, modeler,
  confirmLabel = 'Confirm', confirmVariant = 'primary'
}) => {
  const themeAttributes = useThemeAttributes(modeler);
  return (
    <Modal show={show} onHide={onCancel} centered className="fpb-dialog" {...themeAttributes}>
      <Modal.Header closeButton closeLabel="Close">
        <Modal.Title>
          <FontAwesomeIcon icon="exclamation-triangle" className={`me-2 ${isBlocked ? 'fpb-dialog-icon-danger' : 'fpb-dialog-icon-warning'}`} />
          {title || 'Confirmation required'}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p>{message}</p>
        {details && (
          <p className="fpb-dialog-details">{details}</p>
        )}
      </Modal.Body>

      <Modal.Footer>
        {isBlocked ? (
          <Button variant="primary" onClick={onCancel} autoFocus data-answer="cancel">
            OK
          </Button>
        ) : (
          <>
            <Button variant="link" className="fpb-dialog-cancel" onClick={onCancel} autoFocus data-answer="cancel">
              Cancel
            </Button>
            <Button variant={confirmVariant} onClick={onConfirm} data-answer="confirm">
              {confirmLabel}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default ConfirmationModal;
