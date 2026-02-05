/**
 * FPB Services Module
 * 
 * Provides runtime services for FPB functionality
 */

import GridService from './GridService';
import SettingsService from './SettingsService';
import AlignService from './AlignService';
import PaletteAlignState from './PaletteAlignState';
import KeyboardAlignService from './KeyboardAlignService';
import ToolClearService from './ToolClearService';

export default {
  __init__: ['gridService', 'settingsService', 'alignService', 'paletteAlignState', 'keyboardAlignService', 'toolClearService'],
  gridService: ['type', GridService],
  settingsService: ['type', SettingsService],
  alignService: ['type', AlignService],
  paletteAlignState: ['type', PaletteAlignState],
  keyboardAlignService: ['type', KeyboardAlignService],
  toolClearService: ['type', ToolClearService]
};