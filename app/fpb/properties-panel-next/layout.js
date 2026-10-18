/**
 * Which groups are open, kept while the panel is hidden (its body unmounts)
 * and across reloads (016b V11).
 */
const KEY = 'fpbjs.propertiesPanel.layout';
let current = null;

export function loadLayout() {
  if (!current) {
    try {
      const stored = window.localStorage.getItem(KEY);
      current = stored ? JSON.parse(stored) : { groups: {} };
    } catch (error) {
      current = { groups: {} };
    }
  }
  return current;
}

export function saveLayout(layout) {
  current = layout;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(layout));
  } catch (error) {
    // only a convenience
  }
}
