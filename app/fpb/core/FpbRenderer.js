/**
 * FPB Renderer - Refactored
 *
 * Main renderer class for FPB diagram elements.
 * Delegates specific rendering tasks to specialized modules.
 */
import inherits from 'inherits';
import { assign } from 'min-dash';
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { is } from '../help/utils';
import Ids from 'ids';

// Specialized renderers
import { MarkerManager } from './utils/MarkerUtils';
import { StateShapeRenderer } from './shapes/StateShapeRenderer';
import { ProcessShapeRenderer } from './shapes/ProcessShapeRenderer';
import { ConnectionRenderer } from './connections/ConnectionRenderer';
import { PathCalculator } from './paths/PathCalculator';

// Constants
import { ELEMENT_TYPES, COLORS, LABEL_CONFIG, LABEL_LIMITS } from './FpbConstants';

var TOOLTIP_DELAY = 400;

var RENDERER_IDS = new Ids();

export default function FpbRenderer(eventBus, styles, canvas, textRenderer, elementRegistry) {
  BaseRenderer.call(this, eventBus, 2000);

  // Initialize core components
  var rendererId = RENDERER_IDS.next();
  this.markerManager = new MarkerManager(canvas, rendererId);
  this.pathCalculator = new PathCalculator();

  // Initialize specialized renderers
  this.stateRenderer = new StateShapeRenderer(styles, textRenderer);
  this.processRenderer = new ProcessShapeRenderer(styles, textRenderer);
  this.connectionRenderer = new ConnectionRenderer(styles, this.markerManager, elementRegistry);

  // Store references for external label rendering
  this.textRenderer = textRenderer;
  this.styles = styles;

  // Re-render all connections after model changes so crossing bridges update
  this._elementRegistry = elementRegistry;
  this._eventBus = eventBus;
  this._updatingBridges = false;

  // Tooltip state
  this._tooltipEl = null;
  this._tooltipTimer = null;

  var self = this;

  eventBus.on('commandStack.changed', 100, function() {
    self._updateCrossingBridges();
  });

  // Hover tooltip system
  eventBus.on('element.hover', function(event) {
    var el = event.element;
    if (el._tooltipText) {
      clearTimeout(self._tooltipTimer);
      self._tooltipTimer = setTimeout(function() {
        self._showTooltip(el);
      }, TOOLTIP_DELAY);
    }
  });

  eventBus.on('element.out', function() {
    clearTimeout(self._tooltipTimer);
    self._hideTooltip();
  });

  eventBus.on([
    'canvas.viewbox.changing',
    'drag.start',
    'directEditing.activate'
  ], function() {
    clearTimeout(self._tooltipTimer);
    self._hideTooltip();
  });
}

inherits(FpbRenderer, BaseRenderer);

FpbRenderer.$inject = ['eventBus', 'styles', 'canvas', 'textRenderer', 'elementRegistry'];

/**
 * Re-render all connections so crossing bridges reflect current positions.
 */
FpbRenderer.prototype._updateCrossingBridges = function() {
  if (this._updatingBridges) return;
  this._updatingBridges = true;

  var connections = this._elementRegistry.filter(function(e) { return e.waypoints; });
  var eventBus = this._eventBus;

  connections.forEach(function(connection) {
    eventBus.fire('element.changed', { element: connection });
  });

  this._updatingBridges = false;
};

/**
 * Show tooltip near the element
 */
FpbRenderer.prototype._showTooltip = function(element) {
  this._hideTooltip();

  var gfx = this._elementRegistry.getGraphics(element);
  if (!gfx) return;

  var bbox = gfx.getBoundingClientRect();

  var tooltip = document.createElement('div');
  tooltip.className = 'fpb-tooltip';
  tooltip.textContent = element._tooltipText;
  tooltip.style.cssText =
    'position:fixed;' +
    'background:#333;color:#fff;' +
    'padding:5px 8px;border-radius:4px;' +
    'font-size:12px;font-family:Arial,sans-serif;' +
    'max-width:300px;word-wrap:break-word;' +
    'white-space:pre-line;' +
    'z-index:10000;pointer-events:none;' +
    'box-shadow:0 2px 6px rgba(0,0,0,0.25);';
  tooltip.style.left = bbox.left + 'px';
  tooltip.style.top = (bbox.bottom + 6) + 'px';

  document.body.appendChild(tooltip);
  this._tooltipEl = tooltip;
};

/**
 * Hide the currently visible tooltip
 */
FpbRenderer.prototype._hideTooltip = function() {
  if (this._tooltipEl) {
    this._tooltipEl.remove();
    this._tooltipEl = null;
  }
};

/**
 * Determines if this renderer can render the given element
 */
FpbRenderer.prototype.canRender = function(element) {
  return is(element, 'fpb:BaseElement');
};

/**
 * Renders external labels for elements
 */
FpbRenderer.prototype.renderExternalLabel = function(parentGfx, element) {
  var semantic = element.businessObject;
  var box = {
    width: Math.max(element.width, LABEL_CONFIG.externalLabelWidth),
    height: element.height,
    x: element.x,
    y: element.y
  };

  var labelOptions = {
    box: box,
    fitBox: true,
    align: 'left',
    style: assign(
      {},
      this.textRenderer.getExternalStyle(),
      {
        fill: COLORS.FPB_STROKE
      }
    )
  };

  var text = this.textRenderer.createText(semantic.name || '', labelOptions);

  // Truncate to max lines
  var maxLines = LABEL_LIMITS.EXTERNAL_LABEL.maxLines;
  var wasTruncated = false;
  var tspans = text.querySelectorAll('tspan');

  if (tspans.length > maxLines) {
    for (var i = tspans.length - 1; i >= maxLines; i--) {
      text.removeChild(tspans[i]);
    }
    var lastTspan = tspans[maxLines - 1];
    lastTspan.textContent = lastTspan.textContent.trimEnd() + '\u2026';
    wasTruncated = true;
  }

  // Store tooltip text on element for hover system
  var longName = semantic.identification?.longName;

  if (longName && wasTruncated) {
    element._tooltipText = semantic.name + '\n' + longName;
  } else if (longName) {
    element._tooltipText = longName;
  } else if (wasTruncated) {
    element._tooltipText = semantic.name;
  } else {
    element._tooltipText = null;
  }

  parentGfx.appendChild(text);
  return text;
};

/**
 * Main shape rendering dispatcher
 */
FpbRenderer.prototype.drawShape = function(parentGfx, element) {
  var type = element.type;

  // Handle labels
  if (type === 'label') {
    return this.renderExternalLabel(parentGfx, element);
  }

  // Delegate to state renderers
  if (is(element, ELEMENT_TYPES.PRODUCT)) {
    return this.stateRenderer.drawProduct(parentGfx, element);
  }
  if (is(element, ELEMENT_TYPES.ENERGY)) {
    return this.stateRenderer.drawEnergy(parentGfx, element);
  }
  if (is(element, ELEMENT_TYPES.INFORMATION)) {
    return this.stateRenderer.drawInformation(parentGfx, element);
  }

  // Delegate to process renderers
  if (is(element, ELEMENT_TYPES.PROCESS_OPERATOR)) {
    return this.processRenderer.drawProcessOperator(parentGfx, element);
  }
  if (is(element, ELEMENT_TYPES.TECHNICAL_RESOURCE)) {
    return this.processRenderer.drawTechnicalResource(parentGfx, element);
  }
  if (is(element, ELEMENT_TYPES.SYSTEM_LIMIT)) {
    return this.processRenderer.drawSystemLimit(parentGfx, element);
  }

  console.warn('FpbRenderer: Unknown shape type:', type);
};

/**
 * Main connection rendering dispatcher
 */
FpbRenderer.prototype.drawConnection = function(parentGfx, element) {
  if (is(element, ELEMENT_TYPES.USAGE)) {
    return this.connectionRenderer.drawUsage(parentGfx, element);
  }

  if (is(element, ELEMENT_TYPES.FLOW) ||
      is(element, ELEMENT_TYPES.PARALLEL_FLOW) ||
      is(element, ELEMENT_TYPES.ALTERNATIVE_FLOW)) {
    return this.connectionRenderer.drawFlow(parentGfx, element);
  }

  console.warn('FpbRenderer: Unknown connection type:', element.type);
};

/**
 * Path calculation dispatcher for hit detection
 */
FpbRenderer.prototype.getShapePath = function(shape) {
  if (is(shape, ELEMENT_TYPES.PRODUCT)) {
    return this.pathCalculator.getProductPath(shape);
  }
  if (is(shape, ELEMENT_TYPES.ENERGY)) {
    return this.pathCalculator.getEnergyPath(shape);
  }
  if (is(shape, ELEMENT_TYPES.INFORMATION)) {
    return this.pathCalculator.getInformationPath(shape);
  }
  if (is(shape, ELEMENT_TYPES.PROCESS_OPERATOR)) {
    return this.pathCalculator.getProcessOperatorPath(shape);
  }
  if (is(shape, ELEMENT_TYPES.TECHNICAL_RESOURCE)) {
    return this.pathCalculator.getTechnicalResourcePath(shape);
  }
  if (is(shape, ELEMENT_TYPES.SYSTEM_LIMIT)) {
    return this.pathCalculator.getSystemLimitPath(shape);
  }

  console.warn('FpbRenderer: Unknown shape path type:', shape.type);
};