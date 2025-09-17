/**
 * Import Constants
 * 
 * Centralized constants for FPB JSON import functionality
 */

// FPB Element Types (for import validation)
export const FPB_TYPES = {
  PROJECT: 'fpb:Project',
  PROCESS: 'fpb:Process',
  SYSTEM_LIMIT: 'fpb:SystemLimit',
  PROCESS_OPERATOR: 'fpb:ProcessOperator',
  TECHNICAL_RESOURCE: 'fpb:TechnicalResource',
  PRODUCT: 'fpb:Product',
  INFORMATION: 'fpb:Information',
  ENERGY: 'fpb:Energy',
  FLOW: 'fpb:Flow',
  ALTERNATIVE_FLOW: 'fpb:AlternativeFlow',
  PARALLEL_FLOW: 'fpb:ParallelFlow',
  USAGE: 'fpb:Usage',
  CHARACTERISTICS: 'fpbch:Characteristics',
  VALIDITY_LIMITS: 'fpbch:ValidityLimits'
};

// Element type groups for easier processing
export const TYPE_GROUPS = {
  STATES: [FPB_TYPES.PRODUCT, FPB_TYPES.INFORMATION, FPB_TYPES.ENERGY],
  FLOWS: [FPB_TYPES.FLOW, FPB_TYPES.ALTERNATIVE_FLOW, FPB_TYPES.PARALLEL_FLOW],
  CONNECTIONS: [FPB_TYPES.FLOW, FPB_TYPES.ALTERNATIVE_FLOW, FPB_TYPES.PARALLEL_FLOW, FPB_TYPES.USAGE],
  SHAPES: [FPB_TYPES.SYSTEM_LIMIT, FPB_TYPES.PROCESS_OPERATOR, FPB_TYPES.TECHNICAL_RESOURCE, 
           FPB_TYPES.PRODUCT, FPB_TYPES.INFORMATION, FPB_TYPES.ENERGY]
};

// Import timing constants
export const IMPORT_TIMING = {
  UI_INITIALIZATION_DELAY: 2000 // ms - delay for UI components to initialize
};

// Default fallback values for missing visual information
export const FALLBACK_VALUES = {
  POSITION: {
    X_BASE: 100,
    Y_BASE: 100,
    X_RANDOM: 400,
    Y_RANDOM: 300
  },
  SIZE: {
    WIDTH: 50,
    HEIGHT: 50
  }
};

// Import error types
export const IMPORT_ERRORS = {
  INVALID_DATA_STRUCTURE: 'INVALID_DATA_STRUCTURE',
  MISSING_PROJECT_DEFINITION: 'MISSING_PROJECT_DEFINITION',
  MISSING_VISUAL_INFORMATION: 'MISSING_VISUAL_INFORMATION',
  DEPENDENCY_RESOLUTION_FAILED: 'DEPENDENCY_RESOLUTION_FAILED',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR'
};

// Event names used by importer
export const IMPORT_EVENTS = {
  IMPORT_REQUEST: 'FPBJS.import',
  IMPORT_ERROR: 'import.error',
  PROJECT_ADDED: 'dataStore.addedProjectDefinition',
  NEW_PROCESS: 'dataStore.newProcess',
  LAYER_PANEL_NEW_PROCESS: 'layerPanel.newProcess'
};