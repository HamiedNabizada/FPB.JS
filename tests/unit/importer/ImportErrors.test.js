// tests/unit/importer/ImportErrors.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ImportError,
  DataStructureError,
  ProjectDefinitionError,
  VisualInformationError,
  DependencyError,
  ErrorHandler
} from '../../../app/fpb/importer/ImportErrors.js';

import { IMPORT_ERRORS } from '../../../app/fpb/importer/ImportConstants.js';

describe('ImportErrors', () => {

  // ============================================
  // ImportError (Base Class)
  // ============================================

  describe('ImportError', () => {

    it('extends Error', () => {
      const error = new ImportError('Test error');
      expect(error).toBeInstanceOf(Error);
    });

    it('sets name to ImportError', () => {
      const error = new ImportError('Test error');
      expect(error.name).toBe('ImportError');
    });

    it('sets message correctly', () => {
      const error = new ImportError('My error message');
      expect(error.message).toBe('My error message');
    });

    it('defaults errorType to UNEXPECTED_ERROR', () => {
      const error = new ImportError('Test error');
      expect(error.errorType).toBe(IMPORT_ERRORS.UNEXPECTED_ERROR);
    });

    it('accepts custom errorType', () => {
      const error = new ImportError('Test', null, IMPORT_ERRORS.INVALID_DATA_STRUCTURE);
      expect(error.errorType).toBe(IMPORT_ERRORS.INVALID_DATA_STRUCTURE);
    });

    it('accepts details', () => {
      const details = { field: 'test', value: 123 };
      const error = new ImportError('Test', details);
      expect(error.details).toEqual(details);
    });

    it('defaults details to null', () => {
      const error = new ImportError('Test');
      expect(error.details).toBeNull();
    });

    it('sets timestamp as ISO string', () => {
      const error = new ImportError('Test');
      expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    describe('toEventData()', () => {

      it('returns object with required fields', () => {
        const error = new ImportError('Test message', { detail: 'value' });
        const eventData = error.toEventData();

        expect(eventData).toHaveProperty('message');
        expect(eventData).toHaveProperty('details');
        expect(eventData).toHaveProperty('errorType');
        expect(eventData).toHaveProperty('timestamp');
      });

      it('includes correct values', () => {
        const error = new ImportError('My message', { key: 'val' }, IMPORT_ERRORS.INVALID_DATA_STRUCTURE);
        const eventData = error.toEventData();

        expect(eventData.message).toBe('My message');
        expect(eventData.details).toEqual({ key: 'val' });
        expect(eventData.errorType).toBe(IMPORT_ERRORS.INVALID_DATA_STRUCTURE);
      });

    });

  });

  // ============================================
  // DataStructureError
  // ============================================

  describe('DataStructureError', () => {

    it('extends ImportError', () => {
      const error = new DataStructureError('Test');
      expect(error).toBeInstanceOf(ImportError);
    });

    it('sets name to DataStructureError', () => {
      const error = new DataStructureError('Test');
      expect(error.name).toBe('DataStructureError');
    });

    it('sets errorType to INVALID_DATA_STRUCTURE', () => {
      const error = new DataStructureError('Test');
      expect(error.errorType).toBe(IMPORT_ERRORS.INVALID_DATA_STRUCTURE);
    });

    it('accepts message and details', () => {
      const error = new DataStructureError('Invalid data', { expected: 'array' });
      expect(error.message).toBe('Invalid data');
      expect(error.details).toEqual({ expected: 'array' });
    });

  });

  // ============================================
  // ProjectDefinitionError
  // ============================================

  describe('ProjectDefinitionError', () => {

    it('extends ImportError', () => {
      const error = new ProjectDefinitionError('Test');
      expect(error).toBeInstanceOf(ImportError);
    });

    it('sets name to ProjectDefinitionError', () => {
      const error = new ProjectDefinitionError('Test');
      expect(error.name).toBe('ProjectDefinitionError');
    });

    it('sets errorType to MISSING_PROJECT_DEFINITION', () => {
      const error = new ProjectDefinitionError('Test');
      expect(error.errorType).toBe(IMPORT_ERRORS.MISSING_PROJECT_DEFINITION);
    });

  });

  // ============================================
  // VisualInformationError
  // ============================================

  describe('VisualInformationError', () => {

    it('extends ImportError', () => {
      const error = new VisualInformationError('Test');
      expect(error).toBeInstanceOf(ImportError);
    });

    it('sets name to VisualInformationError', () => {
      const error = new VisualInformationError('Test');
      expect(error.name).toBe('VisualInformationError');
    });

    it('sets errorType to MISSING_VISUAL_INFORMATION', () => {
      const error = new VisualInformationError('Test');
      expect(error.errorType).toBe(IMPORT_ERRORS.MISSING_VISUAL_INFORMATION);
    });

  });

  // ============================================
  // DependencyError
  // ============================================

  describe('DependencyError', () => {

    it('extends ImportError', () => {
      const error = new DependencyError('Test');
      expect(error).toBeInstanceOf(ImportError);
    });

    it('sets name to DependencyError', () => {
      const error = new DependencyError('Test');
      expect(error.name).toBe('DependencyError');
    });

    it('sets errorType to DEPENDENCY_RESOLUTION_FAILED', () => {
      const error = new DependencyError('Test');
      expect(error.errorType).toBe(IMPORT_ERRORS.DEPENDENCY_RESOLUTION_FAILED);
    });

  });

  // ============================================
  // ErrorHandler
  // ============================================

  describe('ErrorHandler', () => {

    let mockEventBus;
    let errorHandler;

    beforeEach(() => {
      mockEventBus = {
        fire: vi.fn()
      };
      errorHandler = new ErrorHandler(mockEventBus);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    describe('constructor', () => {

      it('stores eventBus reference', () => {
        expect(errorHandler.eventBus).toBe(mockEventBus);
      });

    });

    describe('handleError()', () => {

      it('logs error to console', () => {
        const error = new ImportError('Test');
        errorHandler.handleError(error);
        expect(console.error).toHaveBeenCalledWith('Import Error:', error);
      });

      it('fires import.error event for ImportError', () => {
        const error = new ImportError('Test', { detail: 1 });
        errorHandler.handleError(error);

        expect(mockEventBus.fire).toHaveBeenCalledWith('import.error', expect.objectContaining({
          message: 'Test',
          details: { detail: 1 }
        }));
      });

      it('wraps non-ImportError in ImportError', () => {
        const regularError = new Error('Regular error');
        errorHandler.handleError(regularError);

        expect(mockEventBus.fire).toHaveBeenCalledWith('import.error', expect.objectContaining({
          message: 'Import failed unexpectedly',
          errorType: IMPORT_ERRORS.UNEXPECTED_ERROR
        }));
      });

    });

    describe('handleDataStructureError()', () => {

      it('throws DataStructureError', () => {
        expect(() => {
          errorHandler.handleDataStructureError('Invalid structure');
        }).toThrow(DataStructureError);
      });

      it('fires event before throwing', () => {
        try {
          errorHandler.handleDataStructureError('Invalid structure');
        } catch (e) {
          // Expected
        }
        expect(mockEventBus.fire).toHaveBeenCalled();
      });

    });

    describe('handleProjectDefinitionError()', () => {

      it('throws ProjectDefinitionError', () => {
        expect(() => {
          errorHandler.handleProjectDefinitionError('Missing project');
        }).toThrow(ProjectDefinitionError);
      });

    });

    describe('handleVisualInformationError()', () => {

      it('throws VisualInformationError', () => {
        expect(() => {
          errorHandler.handleVisualInformationError('Missing visuals');
        }).toThrow(VisualInformationError);
      });

    });

    describe('handleDependencyError()', () => {

      it('throws DependencyError', () => {
        expect(() => {
          errorHandler.handleDependencyError('Dependency failed');
        }).toThrow(DependencyError);
      });

    });

    describe('logWarning()', () => {

      it('logs warning to console', () => {
        errorHandler.logWarning('Test warning', { info: 'extra' });
        expect(console.warn).toHaveBeenCalledWith('Import Warning: Test warning', { info: 'extra' });
      });

      it('handles null details', () => {
        errorHandler.logWarning('Test warning');
        expect(console.warn).toHaveBeenCalledWith('Import Warning: Test warning', null);
      });

    });

  });

});
