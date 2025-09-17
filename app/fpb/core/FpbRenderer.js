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
import { ELEMENT_TYPES, COLORS } from './FpbConstants';

const RENDERER_IDS = new Ids();

export default function FpbRenderer(eventBus, styles, canvas, textRenderer) {
  BaseRenderer.call(this, eventBus, 2000);

  // Initialize core components
  const rendererId = RENDERER_IDS.next();
  this.markerManager = new MarkerManager(canvas, rendererId);
  this.pathCalculator = new PathCalculator();

  // Initialize specialized renderers
  this.stateRenderer = new StateShapeRenderer(styles, textRenderer);
  this.processRenderer = new ProcessShapeRenderer(styles, textRenderer);
  this.connectionRenderer = new ConnectionRenderer(styles, this.markerManager);

  // Store references for external label rendering
  this.textRenderer = textRenderer;
  this.styles = styles;
}

inherits(FpbRenderer, BaseRenderer);

FpbRenderer.$inject = ['eventBus', 'styles', 'canvas', 'textRenderer'];

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
  const semantic = element.businessObject;
  const box = {
    width: element.width,
    height: element.height,
    x: element.x,
    y: element.y
  };

  const labelOptions = {
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

  const text = this.textRenderer.createText(semantic.name || '', labelOptions);
  parentGfx.appendChild(text);
  return text;
};

/**
 * Main shape rendering dispatcher
 */
FpbRenderer.prototype.drawShape = function(parentGfx, element) {
  const type = element.type;

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