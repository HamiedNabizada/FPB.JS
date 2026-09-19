/**
 * Stores the hover tooltip text on a shape.
 *
 * Not enumerable: the export serializes shapes as elementVisualInformation, and
 * a plain property ended up there for every element drawn on a visited layer.
 */
export function setTooltipText(element, text) {
  Object.defineProperty(element, '_tooltipText', {
    value: text,
    writable: true,
    configurable: true,
    enumerable: false
  });
}
