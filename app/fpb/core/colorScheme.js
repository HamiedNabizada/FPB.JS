import { COLORS } from './FpbConstants';

/**
 * The colour scheme of the elements, switchable at runtime.
 *
 * VDI 3682 gives the element types their colours, and FPB.JS draws them that
 * way. Two of those colours fall together for people with a colour vision
 * deficiency: measured as the distance in CIE Lab after simulating the three
 * common types, product (red) and process operator (green) end up 21 apart
 * under deuteranopia, energy and process operator 18 apart under tritanopia.
 * Anything below roughly 25 is easy to confuse.
 *
 * The accessible scheme keeps four of the five colours nearly where they were
 * and moves the green of the process operator, which is the one that has to
 * give way: it now differs in lightness as well, not only in hue. The smallest
 * distance over normal vision and all three deficiencies rises from 18 to 30.
 * The values come from a search over the colour families (see the scratchpad
 * scripts named in FPB.JS_Docs), so red stays red and blue stays blue.
 *
 * The scheme is a matter of display, not of the model: nothing of it is saved
 * with the process. It is remembered in localStorage, like the theme.
 */
export const SCHEMES = {
  standard: {
    FPB_PRODUCT: COLORS.FPB_PRODUCT,
    FPB_ENERGY: COLORS.FPB_ENERGY,
    FPB_INFORMATION: COLORS.FPB_INFORMATION,
    FPB_PROCESS_OPERATOR: COLORS.FPB_PROCESS_OPERATOR,
    FPB_TECHNICAL_RESOURCE: COLORS.FPB_TECHNICAL_RESOURCE,
    FPB_STROKE: COLORS.FPB_STROKE
  },
  accessible: {
    FPB_PRODUCT: '#E50026',
    FPB_ENERGY: '#79B3EC',
    FPB_INFORMATION: '#3956AC',
    FPB_PROCESS_OPERATOR: '#4DFF97',
    FPB_TECHNICAL_RESOURCE: '#8C8C8C',
    FPB_STROKE: COLORS.FPB_STROKE
  }
};

export const DEFAULT_SCHEME = 'standard';

let active = DEFAULT_SCHEME;

/** Colours to draw with right now. */
export function colors() {
  return SCHEMES[active] || SCHEMES[DEFAULT_SCHEME];
}

export function getScheme() {
  return active;
}

/**
 * Switch the scheme. Returns whether it changed, so the caller can redraw
 * only when needed.
 */
export function setScheme(name) {
  const next = SCHEMES[name] ? name : DEFAULT_SCHEME;

  if (next === active) {
    return false;
  }
  active = next;
  return true;
}
