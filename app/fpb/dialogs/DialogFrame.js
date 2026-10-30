/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';

import Icon from '../ui/Icon';

/**
 * The card of every dialog of FPB.js in the look of variant B (016c decision
 * 13, 016e V4): title with an optional icon, the cross, the content, buttons
 * with text at the bottom, the main action on the right. `titleId` comes
 * from fpbDialogs.open and names the dialog for screen readers.
 */
export default function DialogFrame(props) {
  const { title, titleId, icon, iconClass, onClose, closeLabel = 'Close', footer, children } = props;
  return (
    <div class="fpb-dialog-card">
      <header class="fpb-dialog-header">
        <h2 class="fpb-dialog-title" id={titleId}>
          {icon && <Icon icon={icon} className={iconClass ? 'fpb-dialog-icon ' + iconClass : 'fpb-dialog-icon'} />}
          <span>{title}</span>
        </h2>
        <button type="button" class="fpb-dialog-close" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          <Icon icon={faXmark} />
        </button>
      </header>
      <div class="fpb-dialog-body">{children}</div>
      {footer && <footer class="fpb-dialog-footer">{footer}</footer>}
    </div>
  );
}
