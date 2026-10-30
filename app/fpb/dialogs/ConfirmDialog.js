/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation';

import DialogFrame from './DialogFrame';

/**
 * A question before an action with consequences (016c decision 13, 016e
 * V5): the answer is named after the action ("Remove", "Delete", "Place on
 * boundary"), red when it destroys something; a blocked action has only
 * "OK". Cancel has the focus. `data-answer` marks the buttons for tests and
 * helpers, whatever their names.
 */
export default function ConfirmDialog(props) {
  const { options, translate, close, titleId, descriptionId } = props;
  const { title, message, details, confirmLabel, danger, blocked } = options;
  const footer = blocked
    ? (
      <button type="button" class="fpb-button fpb-button--primary" data-answer="cancel" autofocus onClick={() => close(false)}>
        {translate('OK')}
      </button>
    )
    : [
      <button key="cancel" type="button" class="fpb-button fpb-button--quiet" data-answer="cancel" autofocus onClick={() => close(false)}>
        {translate('Cancel')}
      </button>,
      <button key="confirm" type="button" class={danger ? 'fpb-button fpb-button--danger' : 'fpb-button fpb-button--primary'} data-answer="confirm" onClick={() => close(true)}>
        {confirmLabel || translate('Confirm')}
      </button>
    ];
  return (
    <DialogFrame
      title={title || translate('Confirmation required')}
      titleId={titleId}
      icon={faTriangleExclamation}
      iconClass={blocked ? 'fpb-dialog-icon-danger' : 'fpb-dialog-icon-warning'}
      onClose={() => close(false)}
      closeLabel={translate('Close')}
      footer={footer}
    >
      <div id={descriptionId}>
        {message && <p>{message}</p>}
        {details && <p class="fpb-dialog-details">{details}</p>}
      </div>
    </DialogFrame>
  );
}
