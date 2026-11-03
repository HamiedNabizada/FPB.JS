const SPACE = 8;

/**
 * Where a tooltip of `size` goes next to `anchor` (a DOMRect) in a window of
 * `viewport` (016f E1, V2): left of the anchor with 8 px space, vertically
 * centred and kept in the window; right of it when the left has no room.
 */
export function tooltipPosition(anchor, size, viewport) {
  let placement = 'left';
  let left = anchor.left - SPACE - size.width;
  if (left < SPACE) {
    placement = 'right';
    left = anchor.left + anchor.width + SPACE;
  }
  const centred = anchor.top + anchor.height / 2 - size.height / 2;
  const top = Math.max(SPACE, Math.min(centred, viewport.height - SPACE - size.height));
  return { left, top, placement };
}
