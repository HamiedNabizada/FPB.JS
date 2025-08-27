/**
 * Import Error Handling
 * 
 * Specialized error classes and handling for FPB import operations
 */
import { IMPORT_ERRORS } from './ImportConstants';

/**
 * Base class for import-related errors
 */
export class ImportError extends Error {
  constructor(message, details = null, errorType = IMPORT_ERRORS.UNEXPECTED_ERROR) {
    super(message);
    this.name = 'ImportError';
    this.errorType = errorType;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Creates a structured error object for event firing
   */
  toEventData() {
    return {
      message: this.message,
      details: this.details,
      errorType: this.errorType,
      timestamp: this.timestamp
    };
  }
}

/**
 * Error for invalid data structure
 */
export class DataStructureError extends ImportError {
  constructor(message, details = null) {
    super(message, details, IMPORT_ERRORS.INVALID_DATA_STRUCTURE);
    this.name = 'DataStructureError';
  }
}

/**
 * Error for missing project definition
 */
export class ProjectDefinitionError extends ImportError {
  constructor(message, details = null) {
    super(message, details, IMPORT_ERRORS.MISSING_PROJECT_DEFINITION);
    this.name = 'ProjectDefinitionError';
  }
}

/**
 * Error for missing visual information
 */
export class VisualInformationError extends ImportError {
  constructor(message, details = null) {
    super(message, details, IMPORT_ERRORS.MISSING_VISUAL_INFORMATION);
    this.name = 'VisualInformationError';
  }
}

/**
 * Error for dependency resolution failures
 */
export class DependencyError extends ImportError {
  constructor(message, details = null) {
    super(message, details, IMPORT_ERRORS.DEPENDENCY_RESOLUTION_FAILED);
    this.name = 'DependencyError';
  }
}

/**
 * Error handler utilities
 */
export class ErrorHandler {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Handles and logs import errors
   */
  handleError(error) {
    console.error('Import Error:', error);
    
    if (error instanceof ImportError) {
      this.eventBus.fire('import.error', error.toEventData());
    } else {
      // Handle unexpected errors
      const importError = new ImportError(
        'Import failed unexpectedly',
        `An unexpected error occurred during import: ${error.message}`,
        IMPORT_ERRORS.UNEXPECTED_ERROR
      );
      this.eventBus.fire('import.error', importError.toEventData());
    }
  }

  /**
   * Creates and handles a data structure error
   */
  handleDataStructureError(message, details = null) {
    const error = new DataStructureError(message, details);
    this.handleError(error);
    throw error;
  }

  /**
   * Creates and handles a project definition error
   */
  handleProjectDefinitionError(message, details = null) {
    const error = new ProjectDefinitionError(message, details);
    this.handleError(error);
    throw error;
  }

  /**
   * Creates and handles a visual information error
   */
  handleVisualInformationError(message, details = null) {
    const error = new VisualInformationError(message, details);
    this.handleError(error);
    throw error;
  }

  /**
   * Creates and handles a dependency error
   */
  handleDependencyError(message, details = null) {
    const error = new DependencyError(message, details);
    this.handleError(error);
    throw error;
  }

  /**
   * Logs warnings without throwing errors
   */
  logWarning(message, details = null) {
    console.warn(`Import Warning: ${message}`, details);
  }
}