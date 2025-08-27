/**
 * Label Utilities
 * 
 * Common utility functions for label handling
 */

/**
 * Check if label text is empty or whitespace only
 */
export function isEmptyText(label) {
  return !label || !label.trim();
}

/**
 * Get the midpoint of an element's bounding box
 */
export function getElementMid(bbox) {
  return {
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2
  };
}

/**
 * Scale value by zoom factor
 */
export function scaleByZoom(value, zoom) {
  return value * zoom;
}

/**
 * Calculate bounds for positioned text box
 */
export function calculatePositionedBounds(bbox, textBoxSize, position, align, zoom) {
  const scaledWidth = scaleByZoom(textBoxSize.width, zoom);
  const scaledHeight = scaleByZoom(textBoxSize.height, zoom);
  
  let x, y;
  
  // Calculate X position based on alignment
  switch (align) {
    case 'left':
      x = bbox.x;
      break;
    case 'right':  
      x = bbox.x + bbox.width - scaledWidth;
      break;
    case 'center':
    default:
      x = bbox.x + (bbox.width - scaledWidth) / 2;
      break;
  }
  
  // Calculate Y position
  switch (position) {
    case 'top':
      y = bbox.y;
      break;
    case 'bottom':
      y = bbox.y + bbox.height - scaledHeight;
      break;
    case 'center':
    default:
      y = bbox.y + (bbox.height - scaledHeight) / 2;
      break;
  }
  
  return {
    x: x,
    y: y,
    width: scaledWidth,
    height: scaledHeight
  };
}

/**
 * Create text alignment style
 */
export function createTextAlignmentStyle(align, fontSize, lineHeight) {
  return {
    textAlign: align,
    fontSize: fontSize + 'px',
    lineHeight: lineHeight
  };
}

/**
 * Create external label style with padding
 */
export function createExternalLabelStyle(fontSize, lineHeight, paddingTop, paddingBottom) {
  return {
    fontSize: fontSize + 'px',
    lineHeight: lineHeight,
    paddingTop: paddingTop + 'px',
    paddingBottom: paddingBottom + 'px'
  };
}