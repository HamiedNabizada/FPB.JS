import { describe, it, expect } from 'vitest';

import { tooltipPosition } from '../../../app/fpb/ui/tooltipPosition.js';

/**
 * Where the name of a toolbar button appears (016f E1, V2): left of the
 * button with 8 px space, vertically centred, within the window; right of
 * it only when the left side has no room.
 */

const anchor = (left, top, width = 40, height = 40) => ({ left, top, width, height, right: left + width, bottom: top + height });
const viewport = { width: 1440, height: 860 };
const size = { width: 120, height: 24 };

describe('tooltipPosition', () => {

  it('puts the name left of the button, vertically centred', () => {
    expect(tooltipPosition(anchor(1300, 100), size, viewport)).toEqual({ left: 1300 - 8 - 120, top: 100 + 20 - 12, placement: 'left' });
  });

  it('puts the name right of a button near the left edge', () => {
    expect(tooltipPosition(anchor(40, 100), size, viewport)).toEqual({ left: 40 + 40 + 8, top: 108, placement: 'right' });
  });

  // 016g E3
  it('right of the anchor the tooltip stays in the window', () => {
    expect(tooltipPosition(anchor(5, 100, 30, 30), { width: 280, height: 20 }, { width: 300, height: 600 }))
      .toEqual({ left: 12, top: 105, placement: 'right' });
  });

  it('keeps the name within the window at the bottom and at the top', () => {
    expect(tooltipPosition(anchor(1300, 846, 40, 14), size, viewport).top).toBe(860 - 8 - 24);
    expect(tooltipPosition(anchor(1300, -30), size, viewport).top).toBe(8);
  });
});
