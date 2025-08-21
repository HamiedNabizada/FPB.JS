import React, { createContext, useContext, useState, useCallback } from 'react';
import ErrorNotification from '../components/ErrorNotification';

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

  return (
    <ErrorContext.Provider value={{ showError, clearError, error }}>
      {children}
      <ErrorNotification 
        error={error} 
        onDismiss={clearError}
      />
    </ErrorContext.Provider>
  );
};