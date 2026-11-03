/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import Icon from '../ui/Icon';

/**
 * A button of the toolbar: a symbol, its name for screen readers in
 * `aria-label` (016f V1). `pressed` and `expanded` are left out when not
 * given, so a plain button does not announce a state.
 */
export function ToolbarButton(props) {
  const { id, label, icon, onClick, disabled, pressed, expanded, children } = props;
  return (
    <button
      type="button"
      id={id}
      class="fpb-toolbar-button"
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : String(pressed)}
      aria-expanded={expanded === undefined ? undefined : String(expanded)}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon icon={icon} />
      {children}
    </button>
  );
}
