/**
 * Label Constants
 * 
 * Centralized configuration for label editing and positioning
 */

export const LABEL_CONFIG = {
  // Default text box dimensions
  DEFAULT_TEXT_BOX: {
    width: 70,
    height: 30
  },

  // External label dimensions
  EXTERNAL_LABEL: {
    width: 90,
    paddingTop: 7,
    paddingBottom: 4
  },

  // Element-specific positioning
  POSITIONING: {
    TECHNICAL_RESOURCE: {
      align: 'center',
      position: 'bottom'
    },
    SYSTEM_LIMIT: {
      align: 'right', 
      position: 'top'
    },
    PROCESS_OPERATOR: {
      align: 'right',
      position: 'bottom'
    },
    STATE: {
      align: 'left',
      position: 'external'
    }
  }
};

export const LABEL_MARKERS = {
  ELEMENT_HIDDEN: 'djs-element-hidden',
  LABEL_HIDDEN: 'djs-label-hidden'
};

export const EDITING_OPTIONS = {
  DEFAULT: {
    resizable: false,
    autoResize: true
  }
};

export const LABEL_EVENTS = {
  ACTIVATE: 'directEditing.activate',
  COMPLETE: 'directEditing.complete', 
  CANCEL: 'directEditing.cancel',
  ELEMENT_DBLCLICK: 'element.dblclick',
  ELEMENT_MOUSEDOWN: 'element.mousedown',
  DRAG_INIT: 'drag.init',
  CANVAS_VIEWBOX_CHANGING: 'canvas.viewbox.changing',
  AUTO_PLACE: 'autoPlace',
  AUTO_PLACE_END: 'autoPlace.end',
  POPUP_MENU_OPEN: 'popupMenu.open',
  COMMAND_STACK_CHANGED: 'commandStack.changed'
};