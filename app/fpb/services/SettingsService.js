/**
 * Settings Service
 * 
 * Provides persistent storage for FPB application settings
 */

export default class SettingsService {
  constructor() {
    this.STORAGE_KEYS = {
      GRID: 'fpb-grid-settings',
      APP: 'fpb-app-settings'
    };
  }

  /**
   * Save grid settings to localStorage
   */
  saveGridSettings(settings) {
    try {
      localStorage.setItem(this.STORAGE_KEYS.GRID, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.warn('SettingsService: Failed to save grid settings', error);
      return false;
    }
  }

  /**
   * Load grid settings from localStorage
   */
  loadGridSettings() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.GRID);
      return stored ? JSON.parse(stored) : this.getDefaultGridSettings();
    } catch (error) {
      console.warn('SettingsService: Failed to load grid settings', error);
      return this.getDefaultGridSettings();
    }
  }

  /**
   * Get default grid settings
   */
  getDefaultGridSettings() {
    return {
      enabled: false,
      visible: false,
      spacing: 20,
      style: 'none',
      snapDistance: 10,
      color: '#e0e0e0',
      opacity: 0.3
    };
  }

  /**
   * Clear grid settings
   */
  clearGridSettings() {
    try {
      localStorage.removeItem(this.STORAGE_KEYS.GRID);
      return true;
    } catch (error) {
      console.warn('SettingsService: Failed to clear grid settings', error);
      return false;
    }
  }

  /**
   * Save general app settings
   */
  saveAppSettings(settings) {
    try {
      localStorage.setItem(this.STORAGE_KEYS.APP, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.warn('SettingsService: Failed to save app settings', error);
      return false;
    }
  }

  /**
   * Load general app settings
   */
  loadAppSettings() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.APP);
      return stored ? JSON.parse(stored) : this.getDefaultAppSettings();
    } catch (error) {
      console.warn('SettingsService: Failed to load app settings', error);
      return this.getDefaultAppSettings();
    }
  }

  /**
   * Get default app settings
   */
  getDefaultAppSettings() {
    return {
      theme: 'light',
      autoSave: true,
      showWelcome: true,
      recentFiles: []
    };
  }

  /**
   * Check if localStorage is available
   */
  isStorageAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear all FPB settings
   */
  clearAllSettings() {
    try {
      Object.values(this.STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
      return true;
    } catch (error) {
      console.warn('SettingsService: Failed to clear all settings', error);
      return false;
    }
  }
}

// Dependency injection configuration
SettingsService.$inject = [];