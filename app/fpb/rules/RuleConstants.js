/**
 * FPB Rules Constants
 * 
 * Centralized constants for FPB modeling rules and element types
 */

// Element Type Constants
export const ELEMENT_TYPES = {
  // States
  PRODUCT: 'fpb:Product',
  ENERGY: 'fpb:Energy', 
  INFORMATION: 'fpb:Information',
  
  // Process Elements
  PROCESS_OPERATOR: 'fpb:ProcessOperator',
  TECHNICAL_RESOURCE: 'fpb:TechnicalResource',
  SYSTEM_LIMIT: 'fpb:SystemLimit',
  
  // Connections
  FLOW: 'fpb:Flow',
  PARALLEL_FLOW: 'fpb:ParallelFlow',
  ALTERNATIVE_FLOW: 'fpb:AlternativeFlow',
  USAGE: 'fpb:Usage',
  
  // Meta Types
  PROCESS: 'fpb:Process',
  LABEL: 'label'
};

// Element Groups for easier rule definition
export const ELEMENT_GROUPS = {
  STATES: [
    ELEMENT_TYPES.PRODUCT,
    ELEMENT_TYPES.ENERGY,
    ELEMENT_TYPES.INFORMATION
  ],
  
  PROCESS_ELEMENTS: [
    ELEMENT_TYPES.PROCESS_OPERATOR,
    ELEMENT_TYPES.TECHNICAL_RESOURCE,
    ELEMENT_TYPES.SYSTEM_LIMIT
  ],
  
  CONNECTIONS: [
    ELEMENT_TYPES.FLOW,
    ELEMENT_TYPES.PARALLEL_FLOW,
    ELEMENT_TYPES.ALTERNATIVE_FLOW,
    ELEMENT_TYPES.USAGE
  ],
  
  FLOWS: [
    ELEMENT_TYPES.FLOW,
    ELEMENT_TYPES.PARALLEL_FLOW,
    ELEMENT_TYPES.ALTERNATIVE_FLOW
  ],
  
  // Elements that must be inside SystemLimit
  INSIDE_SYSTEM_LIMIT: [
    ELEMENT_TYPES.PRODUCT,
    ELEMENT_TYPES.ENERGY,
    ELEMENT_TYPES.INFORMATION,
    ELEMENT_TYPES.PROCESS_OPERATOR
  ],
  
  // Elements that must be outside SystemLimit
  OUTSIDE_SYSTEM_LIMIT: [
    ELEMENT_TYPES.TECHNICAL_RESOURCE
  ]
};

// Flow Hint Constants
export const FLOW_HINTS = {
  PARALLEL: 'Parallel',
  ALTERNATIVE: 'Alternative',
  USAGE: 'Usage'
};

// Rule Priority Constants
export const RULE_PRIORITIES = {
  HIGH: 1500
};