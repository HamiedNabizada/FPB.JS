/**
 * Palette Constants
 * 
 * Centralized constants for FPB Palette functionality
 */

// FPB Element Types
export const ELEMENT_TYPES = {
  SYSTEM_LIMIT: 'fpb:SystemLimit',
  PRODUCT: 'fpb:Product',
  ENERGY: 'fpb:Energy',
  INFORMATION: 'fpb:Information',
  PROCESS_OPERATOR: 'fpb:ProcessOperator',
  TECHNICAL_RESOURCE: 'fpb:TechnicalResource'
};

// Palette Groups
export const PALETTE_GROUPS = {
  FPB: 'fpb',
  TOOLS: 'tools'
};

// Icon Classes for FPB Elements
export const ELEMENT_ICONS = {
  SYSTEM_LIMIT: 'icon-fpb-systemlimit',
  PRODUCT: 'icon-fpb-product',
  ENERGY: 'icon-fpb-energy',
  INFORMATION: 'icon-fpb-information',
  PROCESS_OPERATOR: 'icon-fpb-processoperator',
  TECHNICAL_RESOURCE: 'icon-fpb-technicalresource'
};

// Tool Icon Classes
export const TOOL_ICONS = {
  LASSO: 'palette-icon-lasso-tool',
  SPACE: 'palette-icon-space-tool',
  HAND: 'palette-icon-hand-tool'
};

// Palette Entry IDs
export const PALETTE_ENTRY_IDS = {
  // FPB Elements
  SYSTEM_LIMIT: 'fpb-systemlimit',
  PRODUCT: 'fpb-product',
  ENERGY: 'fpb-energy',
  INFORMATION: 'fpb-information',
  PROCESS_OPERATOR: 'fpb-processoperator',
  TECHNICAL_RESOURCE: 'fpb-technicalresource',
  
  // Tools
  TOOL_SEPARATOR: 'tool-separator',
  LASSO_TOOL: 'lasso-tool',
  SPACE_TOOL: 'space-tool',
  HAND_TOOL: 'hand-tool'
};

// Translation Keys
export const TOOLTIP_KEYS = {
  // FPB Elements
  ADD_SYSTEM_LIMIT: 'Add System Limit',
  ADD_PRODUCT: 'Add Product',
  ADD_ENERGY: 'Add Energy',
  ADD_INFORMATION: 'Add Information',
  ADD_PROCESS_OPERATOR: 'Add Process Operator',
  ADD_TECHNICAL_RESOURCE: 'Add Technical Resource',
  
  // Tools
  ACTIVATE_LASSO: 'Activate Lasso Tool',
  ACTIVATE_SPACE: 'Activate the create/remove space tool',
  ACTIVATE_HAND: 'Activate the hand tool'
};

// FPB Element Configuration
export const FPB_ELEMENTS = {
  [PALETTE_ENTRY_IDS.SYSTEM_LIMIT]: {
    type: ELEMENT_TYPES.SYSTEM_LIMIT,
    group: PALETTE_GROUPS.FPB,
    icon: ELEMENT_ICONS.SYSTEM_LIMIT,
    tooltip: TOOLTIP_KEYS.ADD_SYSTEM_LIMIT
  },
  [PALETTE_ENTRY_IDS.PRODUCT]: {
    type: ELEMENT_TYPES.PRODUCT,
    group: PALETTE_GROUPS.FPB,
    icon: ELEMENT_ICONS.PRODUCT,
    tooltip: TOOLTIP_KEYS.ADD_PRODUCT
  },
  [PALETTE_ENTRY_IDS.ENERGY]: {
    type: ELEMENT_TYPES.ENERGY,
    group: PALETTE_GROUPS.FPB,
    icon: ELEMENT_ICONS.ENERGY,
    tooltip: TOOLTIP_KEYS.ADD_ENERGY
  },
  [PALETTE_ENTRY_IDS.INFORMATION]: {
    type: ELEMENT_TYPES.INFORMATION,
    group: PALETTE_GROUPS.FPB,
    icon: ELEMENT_ICONS.INFORMATION,
    tooltip: TOOLTIP_KEYS.ADD_INFORMATION
  },
  [PALETTE_ENTRY_IDS.PROCESS_OPERATOR]: {
    type: ELEMENT_TYPES.PROCESS_OPERATOR,
    group: PALETTE_GROUPS.FPB,
    icon: ELEMENT_ICONS.PROCESS_OPERATOR,
    tooltip: TOOLTIP_KEYS.ADD_PROCESS_OPERATOR
  },
  [PALETTE_ENTRY_IDS.TECHNICAL_RESOURCE]: {
    type: ELEMENT_TYPES.TECHNICAL_RESOURCE,
    group: PALETTE_GROUPS.FPB,
    icon: ELEMENT_ICONS.TECHNICAL_RESOURCE,
    tooltip: TOOLTIP_KEYS.ADD_TECHNICAL_RESOURCE
  }
};