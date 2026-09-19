const MARGIN = 4;

// Elements drawn on top of the canvas: the palette on the left, the panels on
// the right. They are not part of the canvas box, so they have to be subtracted.
const OVERLAYS = '.djs-palette, .side-panels';

/**
 * Keeps the context pad inside the visible canvas.
 *
 * diagram-js puts the pad to the right of the element without looking at the
 * edges of the drawing area. On narrow windows and on phones the panels sit
 * over the right of the canvas and swallowed the entries of a pad reaching
 * under them. If there is no room on the right, the pad moves to the left of
 * the element, and if it does not fit there either, below it (above it as a
 * last resort). It must not cover the element itself: a second tap on the
 * element has to reach the element, not the pad.
 */
export default function ContextPadPosition(eventBus, canvas, scheduler) {
  let target = null;

  eventBus.on(['contextPad.open', 'contextPad.show'], function (event) {
    target = event.current && event.current.target;
    correct();
  });
  eventBus.on('canvas.viewbox.changed', correct);
  eventBus.on('contextPad.close', function () {
    target = null;
  });

  function correct() {
    // after diagram-js has placed the pad, which it schedules as well
    scheduler.schedule(function () {
      clamp(canvas.getContainer(), target);
    }, 'FpbContextPadPosition');
  }
}

ContextPadPosition.$inject = ['eventBus', 'canvas', 'scheduler'];

function clamp(container, target) {
  const pad = container.querySelector('.djs-context-pad.open');
  if (!pad) {
    return;
  }
  const padBox = pad.getBoundingClientRect();
  const containerBox = container.getBoundingClientRect();
  const free = freeArea(container, containerBox);

  let shiftX = 0;
  const overRight = padBox.right - (free.right - MARGIN);
  if (overRight > 0) {
    const targetBox = targetRect(container, target);
    const leftOfTarget = targetBox && targetBox.left - padBox.width - MARGIN;
    shiftX = (leftOfTarget !== null && leftOfTarget >= free.left)
      ? leftOfTarget - padBox.left
      : -overRight;
  } else {
    const overLeft = (free.left + MARGIN) - padBox.left;
    shiftX = overLeft > 0 ? overLeft : 0;
  }

  const overBottom = padBox.bottom - (containerBox.bottom - MARGIN);
  const overTop = (containerBox.top + MARGIN) - padBox.top;
  let shiftY = overBottom > 0 ? -overBottom : (overTop > 0 ? overTop : 0);

  // Still on top of the element (no room to the side): move it out of the way
  const targetBox = targetRect(container, target);
  if (targetBox && overlaps(shift(padBox, shiftX, shiftY), targetBox)) {
    const below = targetBox.bottom + MARGIN - padBox.top;
    const above = targetBox.top - MARGIN - padBox.bottom;
    shiftY = padBox.bottom + below <= containerBox.bottom - MARGIN ? below : above;
  }

  if (!shiftX && !shiftY) {
    return;
  }
  pad.style.left = parseFloat(pad.style.left || 0) + shiftX + 'px';
  pad.style.top = parseFloat(pad.style.top || 0) + shiftY + 'px';
}

function shift(box, dx, dy) {
  return { left: box.left + dx, right: box.right + dx, top: box.top + dy, bottom: box.bottom + dy };
}

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Box of the element the pad belongs to, or null for a multi selection. */
function targetRect(container, target) {
  const element = Array.isArray(target) ? null : target;
  if (!element || !element.id) {
    return null;
  }
  const node = container.querySelector('[data-element-id="' + element.id + '"]');
  return node ? node.getBoundingClientRect() : null;
}

/** Horizontal range of the canvas that no overlay covers. */
function freeArea(container, containerBox) {
  const middle = containerBox.left + containerBox.width / 2;
  let left = containerBox.left;
  let right = containerBox.right;
  Array.prototype.forEach.call(container.ownerDocument.querySelectorAll(OVERLAYS), function (overlay) {
    const box = overlay.getBoundingClientRect();
    if (!box.width || !box.height) {
      return;
    }
    if (box.right <= middle) {
      left = Math.max(left, box.right);
    } else if (box.left >= middle) {
      right = Math.min(right, box.left);
    }
  });
  return { left: left, right: right };
}
