/**
 * Keyboard shortcuts configuration for the info modal
 */

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const ctrlKey = isMac ? '⌘' : 'Ctrl';

export const keyboardShortcuts = [
  {
    category: 'Zoom & Navigation',
    items: [
      { keys: [`${ctrlKey}++`], description: 'Zoom in' },
      { keys: [`${ctrlKey}+-`], description: 'Zoom out' },
      { keys: [`${ctrlKey}+0`], description: 'Reset zoom' },
      { keys: [`${ctrlKey}+Arrow Keys`], description: 'Pan canvas' },
      { keys: ['Space + Mouse'], description: 'Hand tool (drag canvas)' }
    ]
  },
  {
    category: 'Element Movement',
    items: [
      { keys: ['Arrow Keys'], description: 'Move selected elements (1px)' },
      { keys: ['Shift+Arrow Keys'], description: 'Move selected elements (10px)' },
      { keys: ['Escape'], description: 'Cancel current operation' }
    ]
  },
  {
    category: 'Canvas Panning',
    items: [
      { keys: [`${ctrlKey}+Shift+Arrow Keys`], description: 'Fast canvas pan (200px)' },
      { keys: [`${ctrlKey}+Arrow Keys`], description: 'Slow canvas pan (50px)' }
    ]
  }
];

export const getCtrlKey = () => ctrlKey;