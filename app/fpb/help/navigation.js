/**
 * Shows an element of any layer: switches to its layer if needed, scrolls to
 * it and selects it. Used by the search and the model check list.
 */
export function goToElement(services, process, elementId) {
  const { canvas, modeling, elementRegistry, selection } = services;
  if (process && process !== canvas.getRootElement()) {
    modeling.switchProcess(process);
  }
  const element = elementId && elementRegistry.get(elementId);
  if (element) {
    canvas.scrollToElement(element);
    selection.select(element);
  }
  canvas.focus();
  return element || null;
}
