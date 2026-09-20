/**
 * Keyboard shortcuts configuration for the info modal
 */

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const ctrlKey = isMac ? '⌘' : 'Ctrl';

export const keyboardShortcuts = [
  {
    category: 'Editing',
    items: [
      { keys: [`${ctrlKey}+Z`], description: 'Undo (within the current layer)' },
      { keys: [`${ctrlKey}+Y`, `${ctrlKey}+Shift+Z`], description: 'Redo' },
      { keys: ['Delete', 'Backspace'], description: 'Delete selected elements (asks first if another layer is affected)' },
      { keys: [`${ctrlKey}+A`], description: 'Select all elements of the layer' },
      { keys: [`${ctrlKey}+F`], description: 'Search all layers and jump to an element' },
      { keys: [`${ctrlKey}+C`], description: 'Copy selected elements' },
      { keys: [`${ctrlKey}+V`], description: 'Paste copied elements (new ids, without decomposition)' }
    ]
  },
  {
    category: 'Tools',
    items: [
      { keys: ['H'], description: 'Hand tool (press again to leave it)' },
      { keys: ['L'], description: 'Lasso tool' },
      { keys: ['S'], description: 'Create/remove space tool' }
    ]
  },
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
  },
  {
    category: 'Alignment',
    items: [
      { keys: [`${ctrlKey}+Shift+L`], description: 'Align Left (2+ elements)' },
      { keys: [`${ctrlKey}+Shift+C`], description: 'Align Center (2+ elements)' },
      { keys: [`${ctrlKey}+Shift+R`], description: 'Align Right (2+ elements)' },
      { keys: [`${ctrlKey}+Shift+T`], description: 'Align Top (2+ elements)' },
      { keys: [`${ctrlKey}+Shift+M`], description: 'Align Middle (2+ elements)' },
      { keys: [`${ctrlKey}+Shift+B`], description: 'Align Bottom (2+ elements)' }
    ]
  },
  {
    category: 'Distribution',
    items: [
      { keys: [`${ctrlKey}+Shift+H`], description: 'Distribute Horizontally (3+ elements)' },
      { keys: [`${ctrlKey}+Shift+V`], description: 'Distribute Vertically (3+ elements)' }
    ]
  }
];

export const getCtrlKey = () => ctrlKey;