/**
 * Puts the title of a palette entry back as a tooltip on hover.
 *
 * FpbPaletteProvider gives every entry a title ("Add Product", "Activate the
 * hand tool"), but diagram-js 15 renders it only as `aria-label`. A screen
 * reader hears it, the mouse does not: hovering an icon showed nothing any
 * more. The palette is the one place in the app where the icons carry no text
 * beside them, so hovering is how you find out what they do.
 *
 * The title is read back from what the palette rendered, so there is only one
 * source for the wording.
 */
export default function PaletteTooltips(eventBus, palette) {
  const self = this;

  this._palette = palette;

  eventBus.on(['canvas.init', 'palette.changed'], function () {
    self._addTitles();
  });
}

PaletteTooltips.$inject = ['eventBus', 'palette'];

PaletteTooltips.prototype._addTitles = function () {
  const container = this._palette._container;

  if (!container) {
    return;
  }

  Array.prototype.forEach.call(container.querySelectorAll('.entry'), function (entry) {
    const label = entry.getAttribute('aria-label');

    if (label && !entry.getAttribute('title')) {
      entry.setAttribute('title', label);
    }
  });
};
