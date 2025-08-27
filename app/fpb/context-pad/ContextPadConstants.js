/**
 * Context Pad Constants
 * 
 * Centralized constants for FPB Context Pad functionality
 */

// FPB Element Types
export const ELEMENT_TYPES = {
  STATE: 'fpb:State',
  PROCESS_OPERATOR: 'fpb:ProcessOperator', 
  TECHNICAL_RESOURCE: 'fpb:TechnicalResource',
  SYSTEM_LIMIT: 'fpb:SystemLimit',
  LABEL: 'label'
};

// Context Pad Icons
export const CONTEXT_PAD_ICONS = {
  REMOVE: 'context-pad-icon-remove',
  CONNECT: 'context-pad-icon-fpbconnection',
  PARALLEL_CONNECTION: 'context-pad-icon-fpbparallelconnection',
  ALTERNATIVE_CONNECTION: 'context-pad-icon-fpbalternativeconnection',
  USAGE: 'context-pad-icon-fpbusage',
  DECOMPOSE: 'context-pad-icon-fpbdecompose',
  COMPOSE: 'context-pad-icon-fpbcompose',
  SWITCH_UP: 'context-pad-icon-fpbswitchup'
};

// Flow Types and Hints
export const FLOW_HINTS = {
  FLOW: 'Flow',
  PARALLEL: 'Parallel',
  ALTERNATIVE: 'Alternative', 
  USAGE: 'Usage'
};

// Flow Element Types (for validation)
export const FLOW_TYPES = {
  ALTERNATIVE_FLOW: 'fpb:AlternativeFlow',
  PARALLEL_FLOW: 'fpb:ParallelFlow'
};

// Context Pad Entry Groups
export const ENTRY_GROUPS = {
  EDIT: 'edit'
};

// Context Pad Entry IDs
export const ENTRY_IDS = {
  DELETE: 'delete',
  CONNECT: 'connect',
  CONNECT_PARALLEL: 'connect_parallel', 
  CONNECT_ALTERNATIVE: 'connect_alternative',
  CONNECT_USAGE: 'connect_usage',
  DECOMPOSE: 'decompose',
  COMPOSE: 'compose'
};

// Translation Keys for Tooltips
export const TOOLTIP_KEYS = {
  REMOVE: 'Remove {type}',
  CONNECT_WITH_PROCESS_OPERATOR: 'Connect {type} with ProcessOperator',
  PARALLEL_USED: 'Parallel used {type}',
  ALTERNATIVE_PROCESS: 'Alternative Process',
  CONNECT_WITH_STATES: 'Connect {type} with Product, Energy or Information',
  PARALLEL_PROCESS: 'Parallel Process',
  CONNECT_PROCESS_OPERATOR_WITH_TR: 'Connect Process Operator with a Technical Resource',
  DECOMPOSE_PROCESS_OPERATOR: 'Decompose this ProcessOperator',
  CONNECT_TR_WITH_PROCESS_OPERATOR: 'Connect Technical Resource with a Process Operator',
  SWITCH_TO_PARENT: 'Switch to parent process',
  COMPOSE_SYSTEM_LIMIT: 'Compose SystemLimit',
  ALTERNATIVE_FLOW: 'Alternative Flow'
};

// Layout Constants
export const LAYOUT_CONSTANTS = {
  MIN_DISTANCE: 50, // Minimum distance for element positioning
  HALF_ELEMENT_OFFSET: 2 // Divisor for element positioning calculations
};