/**
 * FPB.JS Rendering Constants
 * 
 * Centralized configuration for colors, sizes, and rendering parameters
 * used throughout the FPB diagram rendering system.
 */

export const COLORS = {
  FPB_PRODUCT: '#ed2028',
  FPB_ENERGY: '#6e9ad1',
  FPB_INFORMATION: '#3050a2',
  FPB_PROCESS_OPERATOR: '#13ae4d',
  FPB_TECHNICAL_RESOURCE: '#888889',
  FPB_STROKE: '#000000'
};

export const STROKE_WIDTHS = {
  DEFAULT: 2,
  CONNECTION: 2
};

export const MARKER_CONFIG = {
  viewBox: '0 0 20 20',
  scale: 0.5,
  defaultAttrs: {
    fill: 'black',
    strokeWidth: 1,
    strokeLinecap: 'round',
    strokeDasharray: [10000, 1] // Safari/Chrome/Firefox dash array fix
  }
};

export const DASH_PATTERNS = {
  SYSTEM_LIMIT: '10, 12',
  USAGE: '10, 12'
};

export const LABEL_CONFIG = {
  defaultWidth: 100,
  padding: {
    default: 5,
    processOperator: {
      top: (element, name) => {
        const topPadding = element._textRenderer?.getInternalLabelPadding(element, name) || 18;
        // Handle edge case for long names
        return (name.length >= 19 && topPadding === 18) ? topPadding * 2 : topPadding;
      },
      bottom: 5,
      left: 5,
      right: 3
    }
  }
};

export const ELEMENT_TYPES = {
  PRODUCT: 'fpb:Product',
  ENERGY: 'fpb:Energy', 
  INFORMATION: 'fpb:Information',
  PROCESS_OPERATOR: 'fpb:ProcessOperator',
  TECHNICAL_RESOURCE: 'fpb:TechnicalResource',
  SYSTEM_LIMIT: 'fpb:SystemLimit',
  FLOW: 'fpb:Flow',
  ALTERNATIVE_FLOW: 'fpb:AlternativeFlow',
  PARALLEL_FLOW: 'fpb:ParallelFlow',
  USAGE: 'fpb:Usage'
};

export const MARKER_TYPES = {
  ARROW_END: 'Arrow-At-End',
  ARROW_START: 'Arrow-At-Start'
};