/**
 * Import Error Handling
 * 
 * Specialized error classes and handling for FPB import operations
 */
import { markText } from '../i18n/markText';
import { fill, translateMessage } from '../i18n/language';
import { IMPORT_ERRORS, IMPORT_EVENTS } from './ImportConstants';

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
/** A message in English: a key as it is, { template, args } filled */
const isMessage = (text) => !!text && typeof text === 'object' && (typeof text.template === 'string' || typeof text.message === 'string');
const english = (text) => (isMessage(text) ? translateMessage(fill, text) : text);

export class ErrorHandler {
  /**
   * `translate` gives the messages of the report and of the import error in
   * the language in effect (016h, plan F1 decision 12). Messages are keys of
   * the catalog or { template, args }; data goes in as { message: text }.
   */
  constructor(eventBus, translate = fill) {
    this.eventBus = eventBus;
    this.translate = translate;
    this.warnings = [];
  }

  /** A message in the language of translate */
  text(message) {
    if (typeof message === 'string') {
      return this.translate(message);
    }
    // other values (null, details as an object of their own) stay as they are
    return isMessage(message) ? translateMessage(this.translate, message) : message;
  }

  /** An import error whose message and details are shown translated */
  _error(Type, message, details) {
    const error = new Type(english(message), english(details));
    error.texts = { message, details };
    return error;
  }

  /**
   * Forgets the warnings of the previous import.
   */
  startReport() {
    this.warnings = [];
  }

  /**
   * Hands the collected warnings to the UI as one report and clears them.
   * Nothing is fired for a clean import.
   */
  finishReport() {
    const warnings = this.warnings;
    this.warnings = [];
    if (warnings.length > 0) {
      this.eventBus.fire(IMPORT_EVENTS.IMPORT_REPORT, { warnings });
    }
    return warnings;
  }

  /**
   * Handles and logs import errors
   */
  handleError(error) {
    // handle*Error reports and then throws, and the importer's catch hands
    // the same error in again: report it once
    if (error && error.fpbReported) {
      return;
    }
    console.error('Import Error:', error);
    
    if (error instanceof ImportError) {
      this.eventBus.fire('import.error', this._eventData(error));
    } else {
      // Handle unexpected errors
      const details = { template: markText('An unexpected error occurred during import: {message}'), args: { message: error && error.message } };
      const importError = new ImportError(
        'Import failed unexpectedly',
        english(details),
        IMPORT_ERRORS.UNEXPECTED_ERROR
      );
      importError.texts = { message: markText('Import failed unexpectedly'), details };
      this.eventBus.fire('import.error', this._eventData(importError));
    }
    if (error && typeof error === 'object') {
      error.fpbReported = true;
    }
  }

  /**
   * Creates and handles a data structure error
   */
  handleDataStructureError(message, details = null) {
    const error = this._error(DataStructureError, message, details);
    this.handleError(error);
    throw error;
  }

  /**
   * Creates and handles a project definition error
   */
  handleProjectDefinitionError(message, details = null) {
    const error = this._error(ProjectDefinitionError, message, details);
    this.handleError(error);
    throw error;
  }

  /**
   * Creates and handles a visual information error
   */
  handleVisualInformationError(message, details = null) {
    const error = this._error(VisualInformationError, message, details);
    this.handleError(error);
    throw error;
  }

  /**
   * Creates and handles a dependency error
   */
  handleDependencyError(message, details = null) {
    const error = this._error(DependencyError, message, details);
    this.handleError(error);
    throw error;
  }

  /**
   * Logs a warning without throwing and keeps it for the import report.
   * The hint says what the user can do about it.
   */
  logWarning(message, details = null, hint = null) {
    console.warn('Import Warning: ' + english(message), english(details));
    this.warnings.push({ message: this.text(message), details: this.text(details), hint: this.text(hint) });
  }

  /** The data of import.error, its texts in the language in effect */
  _eventData(error) {
    const data = error.toEventData();
    if (error.texts) {
      data.message = this.text(error.texts.message);
      data.details = this.text(error.texts.details);
    }
    return data;
  }
}