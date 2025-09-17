/**
 * FPB Services Module
 * 
 * Provides runtime services for FPB functionality
 */

import GridService from './GridService';
import SettingsService from './SettingsService';

export default {
  __init__: ['gridService', 'settingsService'],
  gridService: ['type', GridService],
  settingsService: ['type', SettingsService]
};