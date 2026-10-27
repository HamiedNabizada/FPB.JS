// Lowest zoom after fitting, as the zoom scroll range starts at 0.2.
export const MIN_FIT_ZOOM = 0.3;

/**
 * Shows the whole layer: fit-viewport never zooms in beyond 1, a very large
 * layer stays readable at MIN_FIT_ZOOM. Used after an import and on the
 * first visit of a layer (016d V3).
 */
export function fitToViewport(canvas) {
  canvas.zoom('fit-viewport', 'auto');
  if (canvas.zoom() < MIN_FIT_ZOOM) {
    canvas.zoom(MIN_FIT_ZOOM, 'auto');
  }
}
