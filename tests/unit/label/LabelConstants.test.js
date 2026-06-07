// tests/unit/label/LabelConstants.test.js
import { describe, it, expect } from 'vitest';

import {
  LABEL_CONFIG,
  LABEL_MARKERS,
  EDITING_OPTIONS,
  LABEL_EVENTS
} from '../../../app/fpb/label/constants/LabelConstants.js';

describe('LabelConstants', () => {

  // ============================================
  // LABEL_CONFIG
  // ============================================

  describe('LABEL_CONFIG', () => {

    describe('DEFAULT_TEXT_BOX', () => {
      it('has width of 70', () => {
        expect(LABEL_CONFIG.DEFAULT_TEXT_BOX.width).toBe(70);
      });

      it('has height of 30', () => {
        expect(LABEL_CONFIG.DEFAULT_TEXT_BOX.height).toBe(30);
      });
    });

    describe('EXTERNAL_LABEL', () => {
      it('has width of 150', () => {
        expect(LABEL_CONFIG.EXTERNAL_LABEL.width).toBe(150);
      });

      it('has paddingTop of 7', () => {
        expect(LABEL_CONFIG.EXTERNAL_LABEL.paddingTop).toBe(7);
      });

      it('has paddingBottom of 4', () => {
        expect(LABEL_CONFIG.EXTERNAL_LABEL.paddingBottom).toBe(4);
      });
    });

    describe('POSITIONING', () => {

      it('TechnicalResource: center-bottom', () => {
        expect(LABEL_CONFIG.POSITIONING.TECHNICAL_RESOURCE.align).toBe('center');
        expect(LABEL_CONFIG.POSITIONING.TECHNICAL_RESOURCE.position).toBe('bottom');
      });

      it('SystemLimit: right-top', () => {
        expect(LABEL_CONFIG.POSITIONING.SYSTEM_LIMIT.align).toBe('right');
        expect(LABEL_CONFIG.POSITIONING.SYSTEM_LIMIT.position).toBe('top');
      });

      it('ProcessOperator: right-bottom', () => {
        expect(LABEL_CONFIG.POSITIONING.PROCESS_OPERATOR.align).toBe('right');
        expect(LABEL_CONFIG.POSITIONING.PROCESS_OPERATOR.position).toBe('bottom');
      });

      it('State: left-external', () => {
        expect(LABEL_CONFIG.POSITIONING.STATE.align).toBe('left');
        expect(LABEL_CONFIG.POSITIONING.STATE.position).toBe('external');
      });

    });

  });

  // ============================================
  // LABEL_MARKERS
  // ============================================

  describe('LABEL_MARKERS', () => {

    it('defines ELEMENT_HIDDEN marker', () => {
      expect(LABEL_MARKERS.ELEMENT_HIDDEN).toBe('djs-element-hidden');
    });

    it('defines LABEL_HIDDEN marker', () => {
      expect(LABEL_MARKERS.LABEL_HIDDEN).toBe('djs-label-hidden');
    });

    it('markers follow djs-* naming convention', () => {
      Object.values(LABEL_MARKERS).forEach(marker => {
        expect(marker).toMatch(/^djs-/);
      });
    });

  });

  // ============================================
  // EDITING_OPTIONS
  // ============================================

  describe('EDITING_OPTIONS', () => {

    it('DEFAULT has resizable false', () => {
      expect(EDITING_OPTIONS.DEFAULT.resizable).toBe(false);
    });

    it('DEFAULT has autoResize true', () => {
      expect(EDITING_OPTIONS.DEFAULT.autoResize).toBe(true);
    });

  });

  // ============================================
  // LABEL_EVENTS
  // ============================================

  describe('LABEL_EVENTS', () => {

    it('defines directEditing events', () => {
      expect(LABEL_EVENTS.ACTIVATE).toBe('directEditing.activate');
      expect(LABEL_EVENTS.COMPLETE).toBe('directEditing.complete');
      expect(LABEL_EVENTS.CANCEL).toBe('directEditing.cancel');
    });

    it('defines element interaction events', () => {
      expect(LABEL_EVENTS.ELEMENT_DBLCLICK).toBe('element.dblclick');
      expect(LABEL_EVENTS.ELEMENT_MOUSEDOWN).toBe('element.mousedown');
    });

    it('defines drag event', () => {
      expect(LABEL_EVENTS.DRAG_INIT).toBe('drag.init');
    });

    it('defines canvas events', () => {
      expect(LABEL_EVENTS.CANVAS_VIEWBOX_CHANGING).toBe('canvas.viewbox.changing');
    });

    it('defines autoPlace events', () => {
      expect(LABEL_EVENTS.AUTO_PLACE).toBe('autoPlace');
      expect(LABEL_EVENTS.AUTO_PLACE_END).toBe('autoPlace.end');
    });

    it('defines popup menu event', () => {
      expect(LABEL_EVENTS.POPUP_MENU_OPEN).toBe('popupMenu.open');
    });

    it('defines command stack event', () => {
      expect(LABEL_EVENTS.COMMAND_STACK_CHANGED).toBe('commandStack.changed');
    });

    it('all events follow dot notation', () => {
      Object.values(LABEL_EVENTS).forEach(event => {
        expect(event).toMatch(/^[a-zA-Z]+(\.[a-zA-Z]+)*$/);
      });
    });

  });

});
