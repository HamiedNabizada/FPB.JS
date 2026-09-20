import EditorActionsModule from 'diagram-js/lib/features/editor-actions';
import KeyboardModule from 'diagram-js/lib/features/keyboard';
import FpbEditorActions from './FpbEditorActions';
import ToolShortcuts from './ToolShortcuts';

export default {
  __depends__: [
    EditorActionsModule,
    KeyboardModule
  ],
  __init__: ['fpbEditorActions', 'toolShortcuts'],
  fpbEditorActions: ['type', FpbEditorActions],
  toolShortcuts: ['type', ToolShortcuts]
};
