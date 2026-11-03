import { tooltipPosition } from './tooltipPosition';

import './Tooltip.css';

/**
 * The names of the toolbar buttons beside them (016f E1, V2, T2). One
 * element under <body>, as the dialogs: the overflow of a host's column
 * cannot cut it off. Screen readers hear the name from the button, so the
 * tooltip is hidden from them. Escape hides it and goes on to whoever else
 * listens.
 */
export function createTooltips(theme) {
  let host = null;
  let tip = null;
  let anchor = null;
  let timer = null;

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      hide();
    }
  };

  function element() {
    if (!host) {
      host = document.createElement('div');
      host.className = 'fpb-toolbar-tips';
      tip = document.createElement('div');
      tip.className = 'fpb-toolbar-tip';
      tip.setAttribute('aria-hidden', 'true');
      tip.hidden = true;
      host.appendChild(tip);
      document.body.appendChild(host);
      if (theme) {
        theme.addContainer(host);
      }
    }
    return tip;
  }

  function render(target, text) {
    if (anchor !== target || !target.isConnected) {
      return;
    }
    const tooltip = element();
    tooltip.textContent = text;
    tooltip.className = 'fpb-toolbar-tip';
    tooltip.hidden = false;
    const position = tooltipPosition(
      target.getBoundingClientRect(),
      { width: tooltip.offsetWidth, height: tooltip.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );
    tooltip.classList.add('fpb-toolbar-tip--' + position.placement);
    tooltip.style.left = position.left + 'px';
    tooltip.style.top = position.top + 'px';
    document.addEventListener('keydown', onKeyDown);
  }

  /** Show `text` beside `target`, after `delay` ms (0: at once) */
  function show(target, text, delay) {
    clearTimeout(timer);
    anchor = target;
    if (delay) {
      timer = setTimeout(() => render(target, text), delay);
    } else {
      render(target, text);
    }
  }

  /** Hide the tooltip; with `target`, only if it belongs to that element */
  function hide(target) {
    if (target && target !== anchor) {
      return;
    }
    clearTimeout(timer);
    anchor = null;
    if (tip) {
      tip.hidden = true;
    }
    document.removeEventListener('keydown', onKeyDown);
  }

  function destroy() {
    hide();
    if (host) {
      host.remove();
      host = null;
      tip = null;
    }
  }

  return { show, hide, destroy };
}
