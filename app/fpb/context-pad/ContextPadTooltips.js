import { html } from 'diagram-js/lib/ui';

const ENTRY_SELECTOR = '.entry';
const ENTRY_GAP = 8;

/**
 * Shows the title of a context pad entry in the same tooltip the palette uses.
 *
 * The context pad writes its titles into the `title` attribute, so they came as
 * the tooltip of the browser: a different look, a different delay, and in a
 * different place than the tooltip of the palette, which diagram-js draws
 * itself since version 15. The `hover-tooltip` module it brought along is
 * reusable, so the pad now uses it too.
 *
 * The title moves to `aria-label` on the way. It keeps the entries readable for
 * a screen reader and, more prosaically, stops the browser from showing its own
 * tooltip next to ours.
 */
export default function ContextPadTooltips(eventBus, contextPad, hoverTooltip) {
  this._contextPad = contextPad;

  const self = this;
  let registered = false;

  eventBus.on('contextPad.open', function () {
    const container = contextPad._container;

    if (!container) {
      return;
    }

    if (!registered) {
      registered = true;
      self._register(container, hoverTooltip);
    }
    self._moveTitles(container);
  });
}

ContextPadTooltips.$inject = ['eventBus', 'contextPad', 'hoverTooltip'];

ContextPadTooltips.prototype._register = function (container, hoverTooltip) {
  hoverTooltip.add({
    container: container,
    selector: ENTRY_SELECTOR,
    getContent: function (target) {
      const title = target.getAttribute('aria-label');

      return title ? html`<span class="djs-palette-tooltip-label">${title}</span>` : null;
    },
    getPosition: function (target) {
      const bounds = target.getBoundingClientRect();

      // Above the entry: the pad sits close to the element, and to its right
      // there is often the edge of the drawing area.
      return {
        x: bounds.left + bounds.width / 2,
        y: bounds.top - ENTRY_GAP,
        placement: 'top'
      };
    }
  });
};

ContextPadTooltips.prototype._moveTitles = function (container) {
  Array.prototype.forEach.call(container.querySelectorAll(ENTRY_SELECTOR), function (entry) {
    const title = entry.getAttribute('title');

    if (title) {
      entry.setAttribute('aria-label', title);
      entry.removeAttribute('title');
    }
  });
};
