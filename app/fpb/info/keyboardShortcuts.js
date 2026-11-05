import { markText } from '../i18n/markText';

/**
 * Keyboard shortcuts listed in the dialog "FPB.js Information" (info/)
 */

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const ctrlKey = isMac ? '⌘' : 'Ctrl';

export const keyboardShortcuts = [
  {
    category: markText('Files'),
    items: [
      { keys: [`${ctrlKey}+O`], description: markText('Open a file') },
      { keys: [`${ctrlKey}+S`], description: markText('Save (in Chrome and Edge into the opened file)') },
      { keys: [`${ctrlKey}+Shift+S`], description: markText('Save under a new name') }
    ]
  },
  {
    category: markText('Editing'),
    items: [
      { keys: [`${ctrlKey}+Z`], description: markText('Undo (within the current layer)') },
      { keys: [`${ctrlKey}+Y`, `${ctrlKey}+Shift+Z`], description: markText('Redo') },
      { keys: ['Delete', 'Backspace'], description: markText('Delete selected elements (asks first if another layer is affected)') },
      { keys: [`${ctrlKey}+A`], description: markText('Select all elements of the layer') },
      { keys: [`${ctrlKey}+F`], description: markText('Search all layers and jump to an element') },
      { keys: [`${ctrlKey}+C`], description: markText('Copy selected elements') },
      { keys: [`${ctrlKey}+V`], description: markText('Paste copied elements (new ids, without decomposition)') }
    ]
  },
  {
    category: markText('Tools'),
    items: [
      { keys: ['H'], description: markText('Hand tool (press again to leave it)') },
      { keys: ['L'], description: markText('Lasso tool') },
      { keys: ['S'], description: markText('Create/remove space tool') }
    ]
  },
  {
    category: markText('Zoom & Navigation'),
    items: [
      { keys: [`${ctrlKey}++`], description: markText('Zoom in') },
      { keys: [`${ctrlKey}+-`], description: markText('Zoom out') },
      { keys: [`${ctrlKey}+0`], description: markText('Reset zoom') },
      { keys: [`${ctrlKey}+Arrow Keys`], description: markText('Pan canvas') },
      { keys: ['Space + Mouse'], description: markText('Hand tool (drag canvas)') },
      { keys: ['Alt+↓'], description: markText('Open the layer of the selected decomposed operator') },
      { keys: ['Alt+↑'], description: markText('Go to the parent layer') }
    ]
  },
  {
    category: markText('Element Movement'),
    items: [
      { keys: ['Arrow Keys'], description: markText('Move selected elements (1px)') },
      { keys: ['Shift+Arrow Keys'], description: markText('Move selected elements (10px)') },
      { keys: ['Escape'], description: markText('Cancel current operation') }
    ]
  },
  {
    category: markText('Canvas Panning'),
    items: [
      { keys: [`${ctrlKey}+Shift+Arrow Keys`], description: markText('Fast canvas pan (200px)') },
      { keys: [`${ctrlKey}+Arrow Keys`], description: markText('Slow canvas pan (50px)') }
    ]
  },
  {
    category: markText('Alignment'),
    items: [
      { keys: [`${ctrlKey}+Shift+L`], description: markText('Align Left (2+ elements)') },
      { keys: [`${ctrlKey}+Shift+C`], description: markText('Align Center (2+ elements)') },
      { keys: [`${ctrlKey}+Shift+R`], description: markText('Align Right (2+ elements)') },
      { keys: [`${ctrlKey}+Shift+T`], description: markText('Align Top (2+ elements)') },
      { keys: [`${ctrlKey}+Shift+M`], description: markText('Align Middle (2+ elements)') },
      { keys: [`${ctrlKey}+Shift+B`], description: markText('Align Bottom (2+ elements)') }
    ]
  },
  {
    category: markText('Distribution'),
    items: [
      { keys: [`${ctrlKey}+Shift+H`], description: markText('Distribute Horizontally (3+ elements)') },
      { keys: [`${ctrlKey}+Shift+V`], description: markText('Distribute Vertically (3+ elements)') }
    ]
  }
];

export const getCtrlKey = () => ctrlKey;

// the keys that have a name of their own in German (016h V8); their keys in
// the catalog carry "key: " so that "Delete" the key and "Delete" the button
// can read differently
const KEY_NAMES = {
  'Ctrl': markText('key: Ctrl'),
  'Shift': markText('key: Shift'),
  'Alt': markText('key: Alt'),
  'Delete': markText('key: Delete'),
  'Backspace': markText('key: Backspace'),
  'Escape': markText('key: Escape'),
  'Space': markText('key: Space'),
  'Mouse': markText('key: Mouse'),
  'Arrow Keys': markText('key: Arrow Keys')
};

/**
 * A key or a combination ('Ctrl+Shift+L', 'Space + Mouse') in the language of
 * `translate` (016h V8): each named key on its own, letters, symbols (⌘, ↓)
 * and the separators as they are. A name without an entry stays English;
 * without translate the keys are unchanged.
 */
export function keyLabel(keys, translate) {
  if (!translate) {
    return keys;
  }
  return keys.split(/(\s*\+\s*)/).map(function (part) {
    const key = Object.prototype.hasOwnProperty.call(KEY_NAMES, part) ? KEY_NAMES[part] : null;
    if (!key) {
      return part;
    }
    const text = translate(key);
    return text === key ? part : text;
  }).join('');
}