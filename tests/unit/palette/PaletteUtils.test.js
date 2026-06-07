// tests/unit/palette/PaletteUtils.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  PaletteActionBuilder,
  FpbElementBuilder,
  ToolActionHandlers
} from '../../../app/fpb/palette/PaletteUtils.js';

describe('PaletteUtils', () => {

  // ============================================
  // PaletteActionBuilder
  // ============================================

  describe('PaletteActionBuilder', () => {

    describe('createElementAction', () => {

      let mockCreate;
      let mockElementFactory;

      beforeEach(() => {
        mockCreate = {
          start: vi.fn()
        };
        mockElementFactory = {
          createShape: vi.fn().mockReturnValue({ type: 'fpb:Product' })
        };
      });

      it('returns object with required properties', () => {
        const result = PaletteActionBuilder.createElementAction(
          'fpb:Product',
          'fpb',
          'icon-fpb-product',
          'Add Product',
          {},
          mockCreate,
          mockElementFactory
        );

        expect(result).toHaveProperty('group');
        expect(result).toHaveProperty('className');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('action');
      });

      it('sets group correctly', () => {
        const result = PaletteActionBuilder.createElementAction(
          'fpb:Product',
          'fpb',
          'icon-fpb-product',
          'Add Product',
          {},
          mockCreate,
          mockElementFactory
        );

        expect(result.group).toBe('fpb');
      });

      it('sets className correctly', () => {
        const result = PaletteActionBuilder.createElementAction(
          'fpb:Product',
          'fpb',
          'icon-fpb-product',
          'Add Product',
          {},
          mockCreate,
          mockElementFactory
        );

        expect(result.className).toBe('icon-fpb-product');
      });

      it('sets provided title', () => {
        const result = PaletteActionBuilder.createElementAction(
          'fpb:Product',
          'fpb',
          'icon-fpb-product',
          'Add Product',
          {},
          mockCreate,
          mockElementFactory
        );

        expect(result.title).toBe('Add Product');
      });

      it('generates default title from type when not provided', () => {
        const result = PaletteActionBuilder.createElementAction(
          'fpb:Product',
          'fpb',
          'icon-fpb-product',
          null,  // No title provided
          {},
          mockCreate,
          mockElementFactory
        );

        expect(result.title).toBe('Create Product');
      });

      it('action has dragstart and click handlers', () => {
        const result = PaletteActionBuilder.createElementAction(
          'fpb:Product',
          'fpb',
          'icon-fpb-product',
          'Add Product',
          {},
          mockCreate,
          mockElementFactory
        );

        expect(result.action).toHaveProperty('dragstart');
        expect(result.action).toHaveProperty('click');
        expect(typeof result.action.dragstart).toBe('function');
        expect(typeof result.action.click).toBe('function');
      });

      it('click handler creates shape and starts create', () => {
        const result = PaletteActionBuilder.createElementAction(
          'fpb:Product',
          'fpb',
          'icon-fpb-product',
          'Add Product',
          {},
          mockCreate,
          mockElementFactory
        );

        const mockEvent = { clientX: 100, clientY: 200 };
        result.action.click(mockEvent);

        expect(mockElementFactory.createShape).toHaveBeenCalledWith({ type: 'fpb:Product' });
        expect(mockCreate.start).toHaveBeenCalledWith(mockEvent, { type: 'fpb:Product' });
      });

      it('passes options to createShape', () => {
        const options = { width: 150, height: 80 };
        const result = PaletteActionBuilder.createElementAction(
          'fpb:ProcessOperator',
          'fpb',
          'icon-fpb-processoperator',
          'Add Process Operator',
          options,
          mockCreate,
          mockElementFactory
        );

        result.action.click({});

        expect(mockElementFactory.createShape).toHaveBeenCalledWith({
          type: 'fpb:ProcessOperator',
          width: 150,
          height: 80
        });
      });

    });

    describe('createToolAction', () => {

      it('returns object with required properties', () => {
        const clickHandler = vi.fn();
        const result = PaletteActionBuilder.createToolAction(
          'tools',
          'palette-icon-select-tool',
          'Activate Select Tool',
          clickHandler
        );

        expect(result).toHaveProperty('group');
        expect(result).toHaveProperty('className');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('action');
      });

      it('sets group correctly', () => {
        const result = PaletteActionBuilder.createToolAction(
          'tools',
          'palette-icon-select-tool',
          'Activate Select Tool',
          vi.fn()
        );

        expect(result.group).toBe('tools');
      });

      it('action only has click handler', () => {
        const clickHandler = vi.fn();
        const result = PaletteActionBuilder.createToolAction(
          'tools',
          'palette-icon-select-tool',
          'Activate Select Tool',
          clickHandler
        );

        expect(result.action).toHaveProperty('click');
        expect(result.action.click).toBe(clickHandler);
        expect(result.action).not.toHaveProperty('dragstart');
      });

    });

    describe('createSeparator', () => {

      it('returns separator object', () => {
        const result = PaletteActionBuilder.createSeparator('tools');

        expect(result).toHaveProperty('group');
        expect(result).toHaveProperty('separator');
      });

      it('sets separator to true', () => {
        const result = PaletteActionBuilder.createSeparator('tools');

        expect(result.separator).toBe(true);
      });

      it('sets group correctly', () => {
        const result = PaletteActionBuilder.createSeparator('align');

        expect(result.group).toBe('align');
      });

    });

  });

  // ============================================
  // FpbElementBuilder
  // ============================================

  describe('FpbElementBuilder', () => {

    describe('buildElementEntries', () => {

      let mockCreate;
      let mockElementFactory;
      let mockTranslate;

      beforeEach(() => {
        mockCreate = { start: vi.fn() };
        mockElementFactory = {
          createShape: vi.fn().mockImplementation(opts => opts)
        };
        mockTranslate = vi.fn().mockImplementation(text => `Translated: ${text}`);
      });

      it('builds entries for each element in config', () => {
        const elementConfig = {
          'fpb-product': {
            type: 'fpb:Product',
            group: 'fpb',
            icon: 'icon-fpb-product',
            tooltip: 'Add Product'
          },
          'fpb-energy': {
            type: 'fpb:Energy',
            group: 'fpb',
            icon: 'icon-fpb-energy',
            tooltip: 'Add Energy'
          }
        };

        const result = FpbElementBuilder.buildElementEntries(
          elementConfig,
          mockCreate,
          mockElementFactory,
          mockTranslate
        );

        expect(Object.keys(result)).toHaveLength(2);
        expect(result).toHaveProperty('fpb-product');
        expect(result).toHaveProperty('fpb-energy');
      });

      it('translates tooltip text', () => {
        const elementConfig = {
          'fpb-product': {
            type: 'fpb:Product',
            group: 'fpb',
            icon: 'icon-fpb-product',
            tooltip: 'Add Product'
          }
        };

        FpbElementBuilder.buildElementEntries(
          elementConfig,
          mockCreate,
          mockElementFactory,
          mockTranslate
        );

        expect(mockTranslate).toHaveBeenCalledWith('Add Product');
      });

      it('entries have correct structure', () => {
        const elementConfig = {
          'fpb-product': {
            type: 'fpb:Product',
            group: 'fpb',
            icon: 'icon-fpb-product',
            tooltip: 'Add Product'
          }
        };

        const result = FpbElementBuilder.buildElementEntries(
          elementConfig,
          mockCreate,
          mockElementFactory,
          mockTranslate
        );

        const entry = result['fpb-product'];
        expect(entry.group).toBe('fpb');
        expect(entry.className).toBe('icon-fpb-product');
        expect(entry.title).toBe('Translated: Add Product');
        expect(entry.action).toBeDefined();
      });

      it('returns empty object for empty config', () => {
        const result = FpbElementBuilder.buildElementEntries(
          {},
          mockCreate,
          mockElementFactory,
          mockTranslate
        );

        expect(result).toEqual({});
      });

    });

  });

  // ============================================
  // ToolActionHandlers
  // ============================================

  describe('ToolActionHandlers', () => {

    describe('createSelectHandler', () => {

      it('returns a function', () => {
        const mockToolClearService = { clearTools: vi.fn() };
        const handler = ToolActionHandlers.createSelectHandler(mockToolClearService);

        expect(typeof handler).toBe('function');
      });

      it('handler calls clearTools when invoked', () => {
        const mockToolClearService = { clearTools: vi.fn() };
        const handler = ToolActionHandlers.createSelectHandler(mockToolClearService);

        handler({});

        expect(mockToolClearService.clearTools).toHaveBeenCalled();
      });

    });

    describe('createLassoHandler', () => {

      it('returns a function', () => {
        const mockLassoTool = { activateSelection: vi.fn() };
        const handler = ToolActionHandlers.createLassoHandler(mockLassoTool);

        expect(typeof handler).toBe('function');
      });

      it('handler calls activateSelection with event', () => {
        const mockLassoTool = { activateSelection: vi.fn() };
        const handler = ToolActionHandlers.createLassoHandler(mockLassoTool);
        const mockEvent = { clientX: 100, clientY: 200 };

        handler(mockEvent);

        expect(mockLassoTool.activateSelection).toHaveBeenCalledWith(mockEvent);
      });

    });

    describe('createSpaceHandler', () => {

      it('returns a function', () => {
        const mockSpaceTool = { activateSelection: vi.fn() };
        const handler = ToolActionHandlers.createSpaceHandler(mockSpaceTool);

        expect(typeof handler).toBe('function');
      });

      it('handler calls activateSelection with event', () => {
        const mockSpaceTool = { activateSelection: vi.fn() };
        const handler = ToolActionHandlers.createSpaceHandler(mockSpaceTool);
        const mockEvent = { clientX: 100 };

        handler(mockEvent);

        expect(mockSpaceTool.activateSelection).toHaveBeenCalledWith(mockEvent);
      });

    });

    describe('createHandHandler', () => {

      it('returns a function', () => {
        const mockHandTool = { activateHand: vi.fn() };
        const handler = ToolActionHandlers.createHandHandler(mockHandTool);

        expect(typeof handler).toBe('function');
      });

      it('handler calls activateHand with event', () => {
        const mockHandTool = { activateHand: vi.fn() };
        const handler = ToolActionHandlers.createHandHandler(mockHandTool);
        const mockEvent = { clientX: 100 };

        handler(mockEvent);

        expect(mockHandTool.activateHand).toHaveBeenCalledWith(mockEvent);
      });

    });

    describe('createAlignHandler', () => {

      let mockAlignService;
      let mockSelection;

      beforeEach(() => {
        mockAlignService = {
          canExecute: vi.fn().mockReturnValue(true),
          alignElements: vi.fn()
        };
        mockSelection = {
          get: vi.fn().mockReturnValue([{ id: 'elem1' }, { id: 'elem2' }])
        };
      });

      it('returns a function', () => {
        const handler = ToolActionHandlers.createAlignHandler(
          mockAlignService,
          mockSelection,
          'left'
        );

        expect(typeof handler).toBe('function');
      });

      it('calls alignElements when 2+ elements selected and canExecute is true', () => {
        const handler = ToolActionHandlers.createAlignHandler(
          mockAlignService,
          mockSelection,
          'left'
        );

        handler({});

        expect(mockAlignService.alignElements).toHaveBeenCalledWith(
          [{ id: 'elem1' }, { id: 'elem2' }],
          'left'
        );
      });

      it('does not call alignElements when canExecute is false', () => {
        mockAlignService.canExecute.mockReturnValue(false);
        const handler = ToolActionHandlers.createAlignHandler(
          mockAlignService,
          mockSelection,
          'left'
        );

        handler({});

        expect(mockAlignService.alignElements).not.toHaveBeenCalled();
      });

      it('does not call alignElements when less than 2 elements selected', () => {
        mockSelection.get.mockReturnValue([{ id: 'elem1' }]);
        const handler = ToolActionHandlers.createAlignHandler(
          mockAlignService,
          mockSelection,
          'left'
        );

        handler({});

        expect(mockAlignService.alignElements).not.toHaveBeenCalled();
      });

      it('passes alignment parameter correctly', () => {
        const handler = ToolActionHandlers.createAlignHandler(
          mockAlignService,
          mockSelection,
          'center'
        );

        handler({});

        expect(mockAlignService.alignElements).toHaveBeenCalledWith(
          expect.any(Array),
          'center'
        );
      });

    });

    describe('createDistributeHandler', () => {

      let mockAlignService;
      let mockSelection;

      beforeEach(() => {
        mockAlignService = {
          canExecute: vi.fn().mockReturnValue(true),
          distributeElements: vi.fn()
        };
        mockSelection = {
          get: vi.fn().mockReturnValue([
            { id: 'elem1' },
            { id: 'elem2' },
            { id: 'elem3' }
          ])
        };
      });

      it('returns a function', () => {
        const handler = ToolActionHandlers.createDistributeHandler(
          mockAlignService,
          mockSelection,
          'horizontal'
        );

        expect(typeof handler).toBe('function');
      });

      it('calls distributeElements when 3+ elements selected and canExecute is true', () => {
        const handler = ToolActionHandlers.createDistributeHandler(
          mockAlignService,
          mockSelection,
          'horizontal'
        );

        handler({});

        expect(mockAlignService.distributeElements).toHaveBeenCalledWith(
          [{ id: 'elem1' }, { id: 'elem2' }, { id: 'elem3' }],
          'horizontal'
        );
      });

      it('does not call distributeElements when canExecute is false', () => {
        mockAlignService.canExecute.mockReturnValue(false);
        const handler = ToolActionHandlers.createDistributeHandler(
          mockAlignService,
          mockSelection,
          'horizontal'
        );

        handler({});

        expect(mockAlignService.distributeElements).not.toHaveBeenCalled();
      });

      it('does not call distributeElements when less than 3 elements selected', () => {
        mockSelection.get.mockReturnValue([{ id: 'elem1' }, { id: 'elem2' }]);
        const handler = ToolActionHandlers.createDistributeHandler(
          mockAlignService,
          mockSelection,
          'horizontal'
        );

        handler({});

        expect(mockAlignService.distributeElements).not.toHaveBeenCalled();
      });

      it('passes orientation parameter correctly', () => {
        const handler = ToolActionHandlers.createDistributeHandler(
          mockAlignService,
          mockSelection,
          'vertical'
        );

        handler({});

        expect(mockAlignService.distributeElements).toHaveBeenCalledWith(
          expect.any(Array),
          'vertical'
        );
      });

    });

  });

});
