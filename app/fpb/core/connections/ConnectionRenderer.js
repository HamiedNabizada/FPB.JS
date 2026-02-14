/**
 * Connection Renderer
 *
 * Handles rendering of all FPB connections (Flow, Usage).
 * Detects crossing points between connections and renders
 * semicircle bridge arcs for visual clarity.
 */
import { append as svgAppend, create as svgCreate, attr as svgAttr } from 'tiny-svg';
import { createLine } from 'diagram-js/lib/util/RenderUtil';
import { COLORS, STROKE_WIDTHS, DASH_PATTERNS, MARKER_TYPES } from '../FpbConstants';

var BRIDGE_RADIUS = 7;

export class ConnectionRenderer {
  constructor(styles, markerManager, elementRegistry) {
    this.styles = styles;
    this.markerManager = markerManager;
    this._elementRegistry = elementRegistry;
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
   * Find crossing points where horizontal segments of this connection
   * intersect with vertical segments of other connections.
   * Returns a map: { segmentIndex: [{x, y}, ...] }
   */
  _findCrossings(connection) {
    if (!this._elementRegistry) return {};

    var waypoints = connection.waypoints;
    if (!waypoints || waypoints.length < 2) return {};

    var allConnections = this._elementRegistry.filter(function(e) {
      return e.waypoints && e !== connection;
    });

    var crossingMap = {};

    for (var i = 0; i < waypoints.length - 1; i++) {
      var x1 = waypoints[i].x, y1 = waypoints[i].y;
      var x2 = waypoints[i + 1].x, y2 = waypoints[i + 1].y;

      // Only check horizontal segments (dy ≈ 0)
      if (Math.abs(y2 - y1) > 1) continue;

      var hY = y1;
      var hMinX = Math.min(x1, x2);
      var hMaxX = Math.max(x1, x2);
      var segCrossings = [];

      for (var j = 0; j < allConnections.length; j++) {
        var other = allConnections[j];
        if (!other.waypoints || other.waypoints.length < 2) continue;

        for (var k = 0; k < other.waypoints.length - 1; k++) {
          var ox1 = other.waypoints[k].x, oy1 = other.waypoints[k].y;
          var ox2 = other.waypoints[k + 1].x, oy2 = other.waypoints[k + 1].y;

          // Only check vertical segments of other connections (dx ≈ 0)
          if (Math.abs(ox2 - ox1) > 1) continue;

          var vX = ox1;
          var vMinY = Math.min(oy1, oy2);
          var vMaxY = Math.max(oy1, oy2);

          // Strict interior crossing with enough margin for bridge arc
          if (vX > hMinX + BRIDGE_RADIUS && vX < hMaxX - BRIDGE_RADIUS &&
              hY > vMinY + BRIDGE_RADIUS && hY < vMaxY - BRIDGE_RADIUS) {
            segCrossings.push({ x: vX, y: hY });
          }
        }
      }

      if (segCrossings.length > 0) {
        // Sort along segment direction
        var direction = x2 > x1 ? 1 : -1;
        segCrossings.sort(function(a, b) { return direction * (a.x - b.x); });

        // Filter out crossings too close to each other
        var filtered = [segCrossings[0]];
        for (var m = 1; m < segCrossings.length; m++) {
          if (Math.abs(segCrossings[m].x - filtered[filtered.length - 1].x) >= 2 * BRIDGE_RADIUS) {
            filtered.push(segCrossings[m]);
          }
        }

        crossingMap[i] = filtered;
      }
    }

    return crossingMap;
  }

  /**
   * Build SVG path data with semicircle bridge arcs at crossing points.
   * Bridges arc upward (visually above the crossing).
   */
  _buildPathWithBridges(waypoints, crossingMap) {
    var r = BRIDGE_RADIUS;
    var d = 'M ' + waypoints[0].x + ',' + waypoints[0].y;

    for (var i = 0; i < waypoints.length - 1; i++) {
      var nextWp = waypoints[i + 1];

      if (crossingMap[i]) {
        var direction = nextWp.x > waypoints[i].x ? 1 : -1;
        // sweep 0 = counter-clockwise = arc above for L→R
        // sweep 1 = clockwise = arc above for R→L
        var sweep = direction > 0 ? 0 : 1;
        var y = waypoints[i].y;
        var crossings = crossingMap[i];

        for (var j = 0; j < crossings.length; j++) {
          var pt = crossings[j];
          d += ' L ' + (pt.x - direction * r) + ',' + y;
          d += ' A ' + r + ',' + r + ' 0 0,' + sweep + ' ' + (pt.x + direction * r) + ',' + y;
        }
        d += ' L ' + nextWp.x + ',' + nextWp.y;
      } else {
        d += ' L ' + nextWp.x + ',' + nextWp.y;
      }
    }

    return d;
  }

  /**
   * Create an SVG path element with bridge arcs and append it.
   */
  _drawConnectionWithBridges(parentGfx, element, attrs) {
    var crossingMap = this._findCrossings(element);

    if (Object.keys(crossingMap).length > 0) {
      var pathData = this._buildPathWithBridges(element.waypoints, crossingMap);
      var path = svgCreate('path');
      svgAttr(path, Object.assign({ d: pathData, fill: 'none' }, attrs));
      svgAppend(parentGfx, path);
      return path;
    }

    return svgAppend(parentGfx, createLine(element.waypoints, attrs));
  }

  /**
   * Renders an FPB Flow connection (with arrow at end)
   */
  drawFlow(parentGfx, element) {
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

    return this._drawConnectionWithBridges(parentGfx, element, attrs);
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

    return this._drawConnectionWithBridges(parentGfx, element, attrs);
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