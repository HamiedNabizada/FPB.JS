// tests/unit/palette/PaletteConstants.test.js
import { describe, it, expect } from 'vitest';

import {
  ELEMENT_TYPES,
  PALETTE_GROUPS,
  ELEMENT_ICONS,
  TOOL_ICONS,
  PALETTE_ENTRY_IDS,
  TOOLTIP_KEYS,
  FPB_ELEMENTS
} from '../../../app/fpb/palette/PaletteConstants.js';

describe('PaletteConstants', () => {

  // ============================================
  // ELEMENT_TYPES
  // ============================================

  describe('ELEMENT_TYPES', () => {

    it('defines all 6 FPB element types', () => {
      expect(Object.keys(ELEMENT_TYPES)).toHaveLength(6);
    });

    it('all types have fpb: prefix', () => {
      Object.values(ELEMENT_TYPES).forEach(type => {
        expect(type).toMatch(/^fpb:/);
      });
    });

    it('defines SystemLimit', () => {
      expect(ELEMENT_TYPES.SYSTEM_LIMIT).toBe('fpb:SystemLimit');
    });

    it('defines state types', () => {
      expect(ELEMENT_TYPES.PRODUCT).toBe('fpb:Product');
      expect(ELEMENT_TYPES.ENERGY).toBe('fpb:Energy');
      expect(ELEMENT_TYPES.INFORMATION).toBe('fpb:Information');
    });

    it('defines process types', () => {
      expect(ELEMENT_TYPES.PROCESS_OPERATOR).toBe('fpb:ProcessOperator');
      expect(ELEMENT_TYPES.TECHNICAL_RESOURCE).toBe('fpb:TechnicalResource');
    });

  });

  // ============================================
  // PALETTE_GROUPS
  // ============================================

  describe('PALETTE_GROUPS', () => {

    it('defines FPB group', () => {
      expect(PALETTE_GROUPS.FPB).toBe('fpb');
    });

    it('defines TOOLS group', () => {
      expect(PALETTE_GROUPS.TOOLS).toBe('tools');
    });

    it('defines ALIGN group', () => {
      expect(PALETTE_GROUPS.ALIGN).toBe('align');
    });

  });

  // ============================================
  // ELEMENT_ICONS
  // ============================================

  describe('ELEMENT_ICONS', () => {

    it('defines 6 element icons', () => {
      expect(Object.keys(ELEMENT_ICONS)).toHaveLength(6);
    });

    it('all icons follow icon-fpb-* naming convention', () => {
      Object.values(ELEMENT_ICONS).forEach(icon => {
        expect(icon).toMatch(/^icon-fpb-/);
      });
    });

    it('defines correct icon classes', () => {
      expect(ELEMENT_ICONS.SYSTEM_LIMIT).toBe('icon-fpb-systemlimit');
      expect(ELEMENT_ICONS.PRODUCT).toBe('icon-fpb-product');
      expect(ELEMENT_ICONS.ENERGY).toBe('icon-fpb-energy');
      expect(ELEMENT_ICONS.INFORMATION).toBe('icon-fpb-information');
      expect(ELEMENT_ICONS.PROCESS_OPERATOR).toBe('icon-fpb-processoperator');
      expect(ELEMENT_ICONS.TECHNICAL_RESOURCE).toBe('icon-fpb-technicalresource');
    });

  });

  // ============================================
  // TOOL_ICONS
  // ============================================

  describe('TOOL_ICONS', () => {

    it('defines selection tools', () => {
      expect(TOOL_ICONS.SELECT).toBe('palette-icon-select-tool');
      expect(TOOL_ICONS.LASSO).toBe('palette-icon-lasso-tool');
      expect(TOOL_ICONS.SPACE).toBe('palette-icon-space-tool');
      expect(TOOL_ICONS.HAND).toBe('palette-icon-hand-tool');
    });

    it('defines alignment icons', () => {
      expect(TOOL_ICONS.ALIGN_LEFT).toBe('palette-icon-align-left');
      expect(TOOL_ICONS.ALIGN_CENTER).toBe('palette-icon-align-center');
      expect(TOOL_ICONS.ALIGN_RIGHT).toBe('palette-icon-align-right');
      expect(TOOL_ICONS.ALIGN_TOP).toBe('palette-icon-align-top');
      expect(TOOL_ICONS.ALIGN_MIDDLE).toBe('palette-icon-align-middle');
      expect(TOOL_ICONS.ALIGN_BOTTOM).toBe('palette-icon-align-bottom');
    });

    it('defines distribution icons', () => {
      expect(TOOL_ICONS.DISTRIBUTE_HORIZONTAL).toBe('palette-icon-distribute-horizontal');
      expect(TOOL_ICONS.DISTRIBUTE_VERTICAL).toBe('palette-icon-distribute-vertical');
    });

    it('all tool icons follow palette-icon-* convention', () => {
      Object.values(TOOL_ICONS).forEach(icon => {
        expect(icon).toMatch(/^palette-icon-/);
      });
    });

  });

  // ============================================
  // PALETTE_ENTRY_IDS
  // ============================================

  describe('PALETTE_ENTRY_IDS', () => {

    describe('FPB Element IDs', () => {

      it('defines all 6 FPB element IDs', () => {
        expect(PALETTE_ENTRY_IDS.SYSTEM_LIMIT).toBe('fpb-systemlimit');
        expect(PALETTE_ENTRY_IDS.PRODUCT).toBe('fpb-product');
        expect(PALETTE_ENTRY_IDS.ENERGY).toBe('fpb-energy');
        expect(PALETTE_ENTRY_IDS.INFORMATION).toBe('fpb-information');
        expect(PALETTE_ENTRY_IDS.PROCESS_OPERATOR).toBe('fpb-processoperator');
        expect(PALETTE_ENTRY_IDS.TECHNICAL_RESOURCE).toBe('fpb-technicalresource');
      });

      it('FPB element IDs have fpb- prefix', () => {
        const fpbIds = [
          PALETTE_ENTRY_IDS.SYSTEM_LIMIT,
          PALETTE_ENTRY_IDS.PRODUCT,
          PALETTE_ENTRY_IDS.ENERGY,
          PALETTE_ENTRY_IDS.INFORMATION,
          PALETTE_ENTRY_IDS.PROCESS_OPERATOR,
          PALETTE_ENTRY_IDS.TECHNICAL_RESOURCE
        ];
        fpbIds.forEach(id => {
          expect(id).toMatch(/^fpb-/);
        });
      });

    });

    describe('Tool IDs', () => {

      it('defines tool separator', () => {
        expect(PALETTE_ENTRY_IDS.TOOL_SEPARATOR).toBe('tool-separator');
      });

      it('defines tool IDs', () => {
        expect(PALETTE_ENTRY_IDS.SELECT_TOOL).toBe('select-tool');
        expect(PALETTE_ENTRY_IDS.LASSO_TOOL).toBe('lasso-tool');
        expect(PALETTE_ENTRY_IDS.SPACE_TOOL).toBe('space-tool');
        expect(PALETTE_ENTRY_IDS.HAND_TOOL).toBe('hand-tool');
      });

    });

    describe('Align Tool IDs', () => {

      it('defines align separator', () => {
        expect(PALETTE_ENTRY_IDS.ALIGN_SEPARATOR).toBe('align-separator');
      });

      it('defines alignment IDs', () => {
        expect(PALETTE_ENTRY_IDS.ALIGN_LEFT).toBe('align-left');
        expect(PALETTE_ENTRY_IDS.ALIGN_CENTER).toBe('align-center');
        expect(PALETTE_ENTRY_IDS.ALIGN_RIGHT).toBe('align-right');
        expect(PALETTE_ENTRY_IDS.ALIGN_TOP).toBe('align-top');
        expect(PALETTE_ENTRY_IDS.ALIGN_MIDDLE).toBe('align-middle');
        expect(PALETTE_ENTRY_IDS.ALIGN_BOTTOM).toBe('align-bottom');
      });

      it('defines distribution IDs', () => {
        expect(PALETTE_ENTRY_IDS.DISTRIBUTE_HORIZONTAL).toBe('distribute-horizontal');
        expect(PALETTE_ENTRY_IDS.DISTRIBUTE_VERTICAL).toBe('distribute-vertical');
      });

    });

  });

  // ============================================
  // TOOLTIP_KEYS
  // ============================================

  describe('TOOLTIP_KEYS', () => {

    describe('FPB Element Tooltips', () => {

      it('defines element creation tooltips', () => {
        expect(TOOLTIP_KEYS.ADD_SYSTEM_LIMIT).toBe('Add System Limit');
        expect(TOOLTIP_KEYS.ADD_PRODUCT).toBe('Add Product');
        expect(TOOLTIP_KEYS.ADD_ENERGY).toBe('Add Energy');
        expect(TOOLTIP_KEYS.ADD_INFORMATION).toBe('Add Information');
        expect(TOOLTIP_KEYS.ADD_PROCESS_OPERATOR).toBe('Add Process Operator');
        expect(TOOLTIP_KEYS.ADD_TECHNICAL_RESOURCE).toBe('Add Technical Resource');
      });

      it('FPB tooltips start with "Add"', () => {
        const addTooltips = [
          TOOLTIP_KEYS.ADD_SYSTEM_LIMIT,
          TOOLTIP_KEYS.ADD_PRODUCT,
          TOOLTIP_KEYS.ADD_ENERGY,
          TOOLTIP_KEYS.ADD_INFORMATION,
          TOOLTIP_KEYS.ADD_PROCESS_OPERATOR,
          TOOLTIP_KEYS.ADD_TECHNICAL_RESOURCE
        ];
        addTooltips.forEach(tooltip => {
          expect(tooltip).toMatch(/^Add /);
        });
      });

    });

    describe('Tool Tooltips', () => {

      it('defines tool activation tooltips', () => {
        expect(TOOLTIP_KEYS.ACTIVATE_SELECT).toBe('Activate Select Tool');
        expect(TOOLTIP_KEYS.ACTIVATE_LASSO).toBe('Activate Lasso Tool');
        expect(TOOLTIP_KEYS.ACTIVATE_SPACE).toBe('Activate the create/remove space tool');
        expect(TOOLTIP_KEYS.ACTIVATE_HAND).toBe('Activate the hand tool');
      });

    });

    describe('Align Tooltips', () => {

      it('defines alignment tooltips', () => {
        expect(TOOLTIP_KEYS.ALIGN_LEFT).toBe('Align Left');
        expect(TOOLTIP_KEYS.ALIGN_CENTER).toBe('Align Center');
        expect(TOOLTIP_KEYS.ALIGN_RIGHT).toBe('Align Right');
        expect(TOOLTIP_KEYS.ALIGN_TOP).toBe('Align Top');
        expect(TOOLTIP_KEYS.ALIGN_MIDDLE).toBe('Align Middle');
        expect(TOOLTIP_KEYS.ALIGN_BOTTOM).toBe('Align Bottom');
      });

      it('defines distribution tooltips', () => {
        expect(TOOLTIP_KEYS.DISTRIBUTE_HORIZONTAL).toBe('Distribute Horizontally');
        expect(TOOLTIP_KEYS.DISTRIBUTE_VERTICAL).toBe('Distribute Vertically');
      });

    });

  });

  // ============================================
  // FPB_ELEMENTS Configuration
  // ============================================

  describe('FPB_ELEMENTS', () => {

    it('defines 6 FPB element configurations', () => {
      expect(Object.keys(FPB_ELEMENTS)).toHaveLength(6);
    });

    it('all entries have required properties', () => {
      Object.values(FPB_ELEMENTS).forEach(config => {
        expect(config).toHaveProperty('type');
        expect(config).toHaveProperty('group');
        expect(config).toHaveProperty('icon');
        expect(config).toHaveProperty('tooltip');
      });
    });

    it('all entries belong to FPB group', () => {
      Object.values(FPB_ELEMENTS).forEach(config => {
        expect(config.group).toBe(PALETTE_GROUPS.FPB);
      });
    });

    it('SystemLimit configuration is correct', () => {
      const config = FPB_ELEMENTS[PALETTE_ENTRY_IDS.SYSTEM_LIMIT];
      expect(config.type).toBe(ELEMENT_TYPES.SYSTEM_LIMIT);
      expect(config.icon).toBe(ELEMENT_ICONS.SYSTEM_LIMIT);
      expect(config.tooltip).toBe(TOOLTIP_KEYS.ADD_SYSTEM_LIMIT);
    });

    it('Product configuration is correct', () => {
      const config = FPB_ELEMENTS[PALETTE_ENTRY_IDS.PRODUCT];
      expect(config.type).toBe(ELEMENT_TYPES.PRODUCT);
      expect(config.icon).toBe(ELEMENT_ICONS.PRODUCT);
      expect(config.tooltip).toBe(TOOLTIP_KEYS.ADD_PRODUCT);
    });

    it('ProcessOperator configuration is correct', () => {
      const config = FPB_ELEMENTS[PALETTE_ENTRY_IDS.PROCESS_OPERATOR];
      expect(config.type).toBe(ELEMENT_TYPES.PROCESS_OPERATOR);
      expect(config.icon).toBe(ELEMENT_ICONS.PROCESS_OPERATOR);
      expect(config.tooltip).toBe(TOOLTIP_KEYS.ADD_PROCESS_OPERATOR);
    });

    it('types in config match ELEMENT_TYPES values', () => {
      Object.values(FPB_ELEMENTS).forEach(config => {
        expect(Object.values(ELEMENT_TYPES)).toContain(config.type);
      });
    });

    it('icons in config match ELEMENT_ICONS values', () => {
      Object.values(FPB_ELEMENTS).forEach(config => {
        expect(Object.values(ELEMENT_ICONS)).toContain(config.icon);
      });
    });

  });

});
