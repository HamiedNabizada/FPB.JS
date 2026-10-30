/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { faCircleExclamation } from '@fortawesome/free-solid-svg-icons/faCircleExclamation';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo';
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons/faCircleCheck';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';

import Icon from '../ui/Icon';

const ICONS = {
  error: faCircleExclamation,
  warning: faTriangleExclamation,
  info: faCircleInfo,
  success: faCircleCheck
};

function Details(props) {
  return (
    <details class="fpb-notification-details">
      <summary>{props.translate('Technical details')}</summary>
      <pre>{props.text}</pre>
    </details>
  );
}

function Actions(props) {
  const { actions, onRun } = props;
  if (!actions || !actions.length) {
    return null;
  }
  return (
    <div class="fpb-notification-actions">
      {actions.map((action, index) => (
        <button
          key={index}
          type="button"
          class={action.primary ? 'fpb-notification-action is-primary' : 'fpb-notification-action'}
          aria-label={action.ariaLabel}
          onClick={() => onRun(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function Card(props) {
  const { note, service, translate } = props;
  const hold = (reason, on) => service.hold(note.id, reason, on);
  const run = (action) => {
    action.run();
    if (action.dismiss) {
      service.dismiss(note.id);
    }
  };
  // the time stops while the pointer rests on the card or a button in it
  // has the focus
  const blur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      hold('focus', false);
    }
  };
  return (
    <div
      class={`fpb-notification fpb-notification--${note.type}`}
      data-id={note.id}
      role={note.type === 'error' ? 'alert' : undefined}
      onMouseEnter={() => hold('pointer', true)}
      onMouseLeave={() => hold('pointer', false)}
      onFocusCapture={() => hold('focus', true)}
      onBlurCapture={blur}
    >
      <Icon icon={ICONS[note.type] || faCircleInfo} className="fpb-notification-icon" />
      <div class="fpb-notification-body">
        {note.title && <div class="fpb-notification-title">{note.title}</div>}
        {note.message && <div class="fpb-notification-message">{note.message}</div>}
        {note.items && note.items.length > 0 && (
          <ul class="fpb-notification-items">
            {note.items.map((item, index) => (
              <li key={index}>
                <div class="fpb-notification-item-message">{item.message}</div>
                {item.hint && <div class="fpb-notification-hint">{item.hint}</div>}
                {item.details && <Details text={item.details} translate={translate} />}
                <Actions actions={item.actions} onRun={run} />
              </li>
            ))}
          </ul>
        )}
        {note.details && <Details text={note.details} translate={translate} />}
        <Actions actions={note.actions} onRun={run} />
      </div>
      <button
        type="button"
        class="fpb-notification-close"
        aria-label={translate('Dismiss')}
        title={translate('Dismiss')}
        onClick={() => service.close(note.id)}
      >
        <Icon icon={faXmark} />
      </button>
    </div>
  );
}

/** The cards of the message stack, oldest first: the newest sits in the corner */
export default function NotificationStack(props) {
  const { notes, service, translate } = props;
  return notes.map((note) => <Card key={note.id} note={note} service={service} translate={translate} />);
}
