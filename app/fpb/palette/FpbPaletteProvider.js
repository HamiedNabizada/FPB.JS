import { assign } from 'min-dash';

// Import constants and utilities
import { 
  FPB_ELEMENTS, 
  PALETTE_GROUPS, 
  PALETTE_ENTRY_IDS, 
  TOOL_ICONS, 
  TOOLTIP_KEYS 
} from './PaletteConstants';
import { 
  PaletteActionBuilder, 
  FpbElementBuilder, 
  ToolActionHandlers 
} from './PaletteUtils';

export default function FpbPaletteProvider(create, elementFactory, lassoTool,
  palette, spaceTool, handTool, translate) {
  this._create = create;
  this._elementFactory = elementFactory;
  this._lassoTool = lassoTool;
  this._palette = palette;
  this._spaceTool = spaceTool;
  this._handTool = handTool;
  this._translate = translate;

  palette.registerProvider(this);
}

FpbPaletteProvider.$inject = [
  'create',
  'elementFactory',
  'lassoTool',
  'palette',
  'spaceTool',
  'handTool',
  'translate'
];


FpbPaletteProvider.prototype.getPaletteEntries = function () {
  const create = this._create;
  const elementFactory = this._elementFactory;
  const spaceTool = this._spaceTool;
  const lassoTool = this._lassoTool;
  const handTool = this._handTool;
  const translate = this._translate;

  // Build FPB element entries using utility
  const fpbElements = FpbElementBuilder.buildElementEntries(
    FPB_ELEMENTS, 
    create, 
    elementFactory, 
    translate
  );

  // Build tool entries using action builder
  const toolEntries = {
    [PALETTE_ENTRY_IDS.TOOL_SEPARATOR]: PaletteActionBuilder.createSeparator(
      PALETTE_GROUPS.TOOLS
    ),
    
    [PALETTE_ENTRY_IDS.LASSO_TOOL]: PaletteActionBuilder.createToolAction(
      PALETTE_GROUPS.TOOLS,
      TOOL_ICONS.LASSO,
      translate(TOOLTIP_KEYS.ACTIVATE_LASSO),
      ToolActionHandlers.createLassoHandler(lassoTool)
    ),
    
    [PALETTE_ENTRY_IDS.SPACE_TOOL]: PaletteActionBuilder.createToolAction(
      PALETTE_GROUPS.TOOLS,
      TOOL_ICONS.SPACE,
      translate(TOOLTIP_KEYS.ACTIVATE_SPACE),
      ToolActionHandlers.createSpaceHandler(spaceTool)
    ),
    
    [PALETTE_ENTRY_IDS.HAND_TOOL]: PaletteActionBuilder.createToolAction(
      PALETTE_GROUPS.TOOLS,
      TOOL_ICONS.HAND,
      translate(TOOLTIP_KEYS.ACTIVATE_HAND),
      ToolActionHandlers.createHandHandler(handTool)
    )
  };

  // Combine all entries
  return assign({}, fpbElements, toolEntries);
};