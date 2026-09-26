/**
 * FPB Services Module
 * 
 * Provides runtime services for FPB functionality
 */

import GridService from './GridService';
import AlignService from './AlignService';
import KeyboardAlignService from './KeyboardAlignService';
import ToolClearService from './ToolClearService';
import UiReadiness from './UiReadiness';
import CanvasResizeNotifier from './CanvasResizeNotifier';
import ColorSchemeService from './ColorSchemeService';

export default {
  __init__: ['gridService', 'alignService', 'keyboardAlignService', 'toolClearService', 'uiReadiness', 'canvasResizeNotifier', 'colorSchemeService'],
  gridService: ['type', GridService],
  alignService: ['type', AlignService],
  keyboardAlignService: ['type', KeyboardAlignService],
  toolClearService: ['type', ToolClearService],
  uiReadiness: ['type', UiReadiness],
  canvasResizeNotifier: ['type', CanvasResizeNotifier],
  colorSchemeService: ['type', ColorSchemeService]
};