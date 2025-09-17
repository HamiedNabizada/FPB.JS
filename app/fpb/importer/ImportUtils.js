/**
 * Import Utilities
 * 
 * Helper functions for FPB JSON import operations
 */
import { FPB_TYPES, FALLBACK_VALUES } from './ImportConstants';

/**
 * Array utilities for safer collection operations
 */
export class ArrayUtils {
  /**
   * Ensures value is an array, converts single values to arrays
   */
  static ensureArray(value) {
    if (Array.isArray(value)) {
      return value;
    }
    return value ? [value] : [];
  }

  /**
   * Safely removes and adds items to arrays with validation
   */
  static safeReplaceInArray(array, oldItem, newItem) {
    if (!Array.isArray(array)) {
      console.warn('ArrayUtils: Expected array, got:', typeof array);
      return;
    }
    
    const index = array.indexOf(oldItem);
    if (index > -1) {
      array.splice(index, 1);
    }
    
    if (newItem && !array.includes(newItem)) {
      array.push(newItem);
    }
  }
}

/**
 * Type checking utilities
 */
export class TypeUtils {
  /**
   * Checks if value is a string (including String objects)
   */
  static isStringLike(value) {
    return typeof value === 'string' || value instanceof String;
  }

  /**
   * Validates if an object has the expected FPB type
   */
  static isValidFpbType(obj, expectedType) {
    return obj && obj.$type === expectedType;
  }

  /**
   * Gets the FPB type of an object safely
   */
  static getFpbType(obj) {
    return obj && obj.$type ? obj.$type : null;
  }
}

/**
 * Element lookup and mapping utilities
 */
export class LookupUtils {
  /**
   * Creates a fast lookup map from an array of elements by ID
   */
  static createElementMap(elements) {
    const map = new Map();
    if (!Array.isArray(elements)) {
      return map;
    }
    
    elements.forEach(element => {
      if (element && element.id) {
        map.set(element.id, element);
      }
    });
    
    return map;
  }

  /**
   * Finds element by ID using map (O(1)) or falls back to array search (O(n))
   */
  static findElementById(idOrMap, idToFind, fallbackArray = null) {
    if (idOrMap instanceof Map) {
      return idOrMap.get(idToFind) || null;
    }
    
    // Fallback to array search if map not provided
    if (Array.isArray(fallbackArray)) {
      return fallbackArray.find(el => el && el.id === idToFind) || null;
    }
    
    return null;
  }

  /**
   * Separates elements by type for more efficient processing
   */
  static groupElementsByType(elements) {
    const groups = {
      visual: [],
      data: [],
      byType: new Map()
    };

    if (!Array.isArray(elements)) {
      return groups;
    }

    elements.forEach(element => {
      if (!element || !element.$type) return;
      
      const type = element.$type;
      
      // Group by visual vs data
      if (element.x !== undefined || element.waypoints !== undefined) {
        groups.visual.push(element);
      } else {
        groups.data.push(element);
      }
      
      // Group by type
      if (!groups.byType.has(type)) {
        groups.byType.set(type, []);
      }
      groups.byType.get(type).push(element);
    });

    return groups;
  }
}

/**
 * Visual information utilities
 */
export class VisualUtils {
  /**
   * Creates fallback visual information for missing elements
   */
  static createFallbackVisualInfo(elementId, type = 'unknown') {
    return {
      id: elementId,
      type: type,
      x: FALLBACK_VALUES.POSITION.X_BASE + Math.random() * FALLBACK_VALUES.POSITION.X_RANDOM,
      y: FALLBACK_VALUES.POSITION.Y_BASE + Math.random() * FALLBACK_VALUES.POSITION.Y_RANDOM,
      width: FALLBACK_VALUES.SIZE.WIDTH,
      height: FALLBACK_VALUES.SIZE.HEIGHT
    };
  }

  /**
   * Validates visual information completeness
   */
  static validateVisualInfo(visualInfo) {
    if (!visualInfo) return false;
    
    // For shapes, we need position and size
    if (visualInfo.x !== undefined) {
      return visualInfo.x !== undefined && 
             visualInfo.y !== undefined && 
             visualInfo.width !== undefined && 
             visualInfo.height !== undefined;
    }
    
    // For connections, we need waypoints
    if (visualInfo.waypoints !== undefined) {
      return Array.isArray(visualInfo.waypoints) && visualInfo.waypoints.length >= 2;
    }
    
    return false;
  }
}

/**
 * Validation utilities
 */
export class ValidationUtils {
  /**
   * Validates import data structure
   */
  static validateImportData(data) {
    if (!data || !Array.isArray(data)) {
      return {
        isValid: false,
        error: 'Invalid data structure - expected array'
      };
    }

    if (data.length === 0) {
      return {
        isValid: false,
        error: 'Empty data array'
      };
    }

    return { isValid: true };
  }

  /**
   * Validates project definition in data
   */
  static validateProjectDefinition(data) {
    const project = data.find(item => item.$type === FPB_TYPES.PROJECT);
    
    if (!project) {
      return {
        isValid: false,
        error: 'No project definition found'
      };
    }

    if (!project.name || !project.targetNamespace) {
      return {
        isValid: false,
        error: 'Project definition missing required fields (name, targetNamespace)'
      };
    }

    return { isValid: true, project };
  }

  /**
   * Validates process data completeness
   */
  static validateProcessData(processData) {
    if (!processData.process) {
      return {
        isValid: false,
        error: 'Missing process definition'
      };
    }

    if (!processData.elementVisualInformation) {
      return {
        isValid: false,
        error: 'Missing visual information'
      };
    }

    if (!processData.elementDataInformation) {
      return {
        isValid: false,
        error: 'Missing data information'
      };
    }

    return { isValid: true };
  }
}