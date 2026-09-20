import React, { createContext, useContext, useState, useCallback } from 'react';
import ErrorNotification from '../components/ErrorNotification';
import ImportReportNotification from '../components/ImportReportNotification';

const ErrorContext = createContext();

export const useError = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};

export const ErrorProvider = ({ children }) => {
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  const showError = useCallback((errorMessage, details = null) => {
    const errorObj = typeof errorMessage === 'string'
      ? { message: errorMessage, details }
      : errorMessage;

    console.error('Import/Export Error:', errorObj);
    setError(errorObj);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Warnings of an import that went through (skipped elements, automatic layout).
  const showReport = useCallback((importReport) => {
    const hasWarnings = importReport && Array.isArray(importReport.warnings) && importReport.warnings.length > 0;
    const check = importReport && importReport.check;
    const hasFindings = !!check && (check.error > 0 || check.warning > 0);
    setReport(hasWarnings || hasFindings ? importReport : null);
  }, []);

  const clearReport = useCallback(() => {
    setReport(null);
  }, []);

  return (
    <ErrorContext.Provider value={{ showError, clearError, error, showReport, clearReport, report }}>
      {children}
      <ErrorNotification
        error={error}
        onDismiss={clearError}
      />
      <ImportReportNotification
        report={report}
        onDismiss={clearReport}
      />
    </ErrorContext.Provider>
  );
};
