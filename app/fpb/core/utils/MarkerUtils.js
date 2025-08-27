/**
 * SVG Marker Utilities
 * 
 * Handles creation and management of SVG markers for arrows and connections
 */
import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate
} from 'tiny-svg';
import { query as domQuery } from 'min-dom';
import { assign } from 'min-dash';
import { MARKER_CONFIG, MARKER_TYPES } from '../FpbConstants';

export class MarkerManager {
  constructor(canvas, rendererId) {
    this.canvas = canvas;
    this.rendererId = rendererId;
    this.markers = {};
  }

  /**
   * Creates or retrieves a marker for the given type and colors
   */
  getMarker(type, fill, stroke) {
    const id = this._generateMarkerId(type, fill, stroke);
    if (!this.markers[id]) {
      this._createMarker(id, type, fill, stroke);
    }
    return `url(#${id})`;
  }

  /**
   * Adds a marker to the SVG defs
   */
  _addMarker(id, options) {
    const attrs = assign({}, MARKER_CONFIG.defaultAttrs, options.attrs);
    const ref = options.ref || { x: 0, y: 0 };
    const scale = options.scale || MARKER_CONFIG.scale;

    const marker = svgCreate('marker');
    svgAttr(options.element, attrs);
    svgAppend(marker, options.element);

    svgAttr(marker, {
      id: id,
      viewBox: MARKER_CONFIG.viewBox,
      refX: ref.x,
      refY: ref.y,
      markerWidth: 20 * scale,
      markerHeight: 20 * scale,
      orient: 'auto'
    });

    const defs = this._getDefs();
    svgAppend(defs, marker);
    this.markers[id] = marker;
  }

  /**
   * Creates a specific marker type
   */
  _createMarker(id, type, fill, stroke) {
    if (type === MARKER_TYPES.ARROW_END) {
      const arrowHead = svgCreate('path');
      svgAttr(arrowHead, { d: 'M 1 5 L 11 10 L 1 15 Z' });

      this._addMarker(id, {
        element: arrowHead,
        ref: { x: 11, y: 10 },
        attrs: { fill: stroke, stroke: stroke }
      });
    }
    
    if (type === MARKER_TYPES.ARROW_START) {
      const arrowHead = svgCreate('path');
      svgAttr(arrowHead, { d: 'M 11 5 L 1 10 L 11 15 Z' });

      this._addMarker(id, {
        element: arrowHead,
        ref: { x: 0, y: 10 },
        attrs: { fill: stroke, stroke: stroke }
      });
    }
  }

  /**
   * Gets or creates the SVG defs element
   */
  _getDefs() {
    let defs = domQuery('defs', this.canvas._svg);
    if (!defs) {
      defs = svgCreate('defs');
      svgAppend(this.canvas._svg, defs);
    }
    return defs;
  }

  /**
   * Generates a unique marker ID
   */
  _generateMarkerId(type, fill, stroke) {
    const escapedFill = this._colorEscape(fill);
    const escapedStroke = this._colorEscape(stroke);
    return `${type}-${escapedFill}-${escapedStroke}-${this.rendererId}`;
  }

  /**
   * Escapes color values for use in IDs
   */
  _colorEscape(str) {
    return str.replace(/[()\s,#]+/g, '_');
  }
}