/** @jsx h */
import { h, createContext } from '@bpmn-io/properties-panel/preact';
import { useContext, useEffect, useRef } from '@bpmn-io/properties-panel/preact/hooks';

import Icon from '../ui/Icon';

/** The tooltips of the toolbar (ui/Tooltip.js), given by Toolbar */
export const TooltipContext = createContext(null);

// the delay of the palette tooltips of diagram-js
const HOVER_DELAY = 300;

function focusVisible(element) {
  try {
    return element.matches(':focus-visible');
  } catch (e) {
    return false;
  }
}

/**
 * A button of the toolbar: a symbol, its name for screen readers in
 * `aria-label` (016f V1) and beside it on hover or keyboard focus (V2);
 * `tip` is that text when it says more than the name (a shortcut).
 * `pressed` and `expanded` are left out when not given, so a plain button
 * does not announce a state.
 */
export function ToolbarButton(props) {
  const { id, label, tip, icon, onClick, disabled, pressed, expanded, children } = props;
  const tooltips = useContext(TooltipContext);
  const ref = useRef(null);
  const text = tip || label;

  // a button that goes away (AML file, layers) takes its tooltip with it
  useEffect(() => () => tooltips && tooltips.hide(ref.current), [tooltips]);
  // a name that changes while its tooltip shows (016g E2)
  useEffect(() => {
    if (tooltips) {
      tooltips.update(ref.current, text);
    }
  }, [tooltips, text]);

  return (
    <button
      ref={ref}
      type="button"
      id={id}
      class="fpb-toolbar-button"
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : String(pressed)}
      aria-expanded={expanded === undefined ? undefined : String(expanded)}
      disabled={disabled}
      onPointerEnter={(event) => {
        if (tooltips && event.pointerType !== 'touch') {
          tooltips.show(event.currentTarget, text, HOVER_DELAY);
        }
      }}
      onPointerLeave={(event) => tooltips && tooltips.hide(event.currentTarget)}
      onFocus={(event) => {
        if (tooltips && focusVisible(event.currentTarget)) {
          tooltips.show(event.currentTarget, text, 0);
        }
      }}
      onBlur={(event) => tooltips && tooltips.hide(event.currentTarget)}
      onClick={(event) => {
        if (tooltips) {
          tooltips.hide();
        }
        onClick(event);
      }}
    >
      <Icon icon={icon} />
      {children}
    </button>
  );
}
