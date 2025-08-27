/**
 * Connection Renderer
 * 
 * Handles rendering of all FPB connections (Flow, Usage)
 */
import { append as svgAppend } from 'tiny-svg';
import { createLine } from 'diagram-js/lib/util/RenderUtil';
import { COLORS, STROKE_WIDTHS, DASH_PATTERNS, MARKER_TYPES } from '../FpbConstants';

export class ConnectionRenderer {
  constructor(styles, markerManager) {
    this.styles = styles;
    this.markerManager = markerManager;
  }

  /**
   * Creates path data from connection waypoints
   */
  createPathFromConnection(connection) {
    const waypoints = connection.waypoints;
    let pathData = `m  ${waypoints[0].x},${waypoints[0].y}`;
    
    for (let i = 1; i < waypoints.length; i++) {
      pathData += `L${waypoints[i].x},${waypoints[i].y} `;
    }
    
    return pathData;
  }

  /**
   * Draws a path with given attributes
   */
  drawPath(parentGfx, pathData, attrs) {
    const defaultAttrs = {
      strokeWidth: STROKE_WIDTHS.CONNECTION,
      stroke: COLORS.FPB_STROKE
    };

    const computedAttrs = this.styles.computeStyle(
      Object.assign(defaultAttrs, attrs),
      ['no-fill']
    );

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    
    Object.keys(computedAttrs).forEach(key => {
      path.setAttribute(key, computedAttrs[key]);
    });

    svgAppend(parentGfx, path);
    return path;
  }

  /**
   * Renders an FPB Flow connection (with arrow at end)
   */
  drawFlow(parentGfx, element) {
    const pathData = this.createPathFromConnection(element);
    const attrs = {
      strokeLinejoin: 'round',
      markerEnd: this.markerManager.getMarker(
        MARKER_TYPES.ARROW_END, 
        'white', 
        COLORS.FPB_STROKE
      ),
      stroke: COLORS.FPB_STROKE,
      strokeWidth: STROKE_WIDTHS.CONNECTION
    };

    return this.drawPath(parentGfx, pathData, attrs);
  }

  /**
   * Renders an FPB Usage connection (dashed line with arrows at both ends)
   */
  drawUsage(parentGfx, element) {
    const attrs = {
      strokeLinejoin: 'round',
      markerStart: this.markerManager.getMarker(
        MARKER_TYPES.ARROW_START, 
        'white', 
        COLORS.FPB_STROKE
      ),
      markerEnd: this.markerManager.getMarker(
        MARKER_TYPES.ARROW_END, 
        'white', 
        COLORS.FPB_STROKE
      ),
      strokeDasharray: DASH_PATTERNS.USAGE,
      stroke: COLORS.FPB_STROKE,
      strokeWidth: STROKE_WIDTHS.CONNECTION
    };

    return svgAppend(parentGfx, createLine(element.waypoints, attrs));
  }

  /**
   * Generic connection renderer using createLine utility
   */
  drawConnection(parentGfx, element) {
    const attrs = {
      strokeLinejoin: 'round',
      markerEnd: this.markerManager.getMarker(
        MARKER_TYPES.ARROW_END, 
        'white', 
        COLORS.FPB_STROKE
      ),
      stroke: COLORS.FPB_STROKE,
      strokeWidth: STROKE_WIDTHS.CONNECTION
    };

    return svgAppend(parentGfx, createLine(element.waypoints, attrs));
  }
}