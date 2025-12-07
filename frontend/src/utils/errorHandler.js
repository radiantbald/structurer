/**
 * Centralized error handling utilities
 */

/**
 * Extracts error message from various error formats
 * @param {Error|Object} error - Error object
 * @returns {string} - Human-readable error message
 */
export function getErrorMessage(error) {
  if (!error) {
    return 'Произошла неизвестная ошибка';
  }

  // Axios error with response
  if (error.response) {
    const data = error.response.data;
    if (data?.error) {
      return data.error;
    }
    if (data?.message) {
      return data.message;
    }
    if (typeof data === 'string') {
      return data;
    }
    return `Ошибка сервера: ${error.response.status} ${error.response.statusText}`;
  }

  // Network error
  if (error.request) {
    return 'Ошибка сети: не удалось подключиться к серверу';
  }

  // Standard error message
  if (error.message) {
    return error.message;
  }

  // Fallback
  return 'Произошла неизвестная ошибка';
}

/**
 * Shows error message to user
 * @param {Error|Object} error - Error object
 * @param {string} context - Context where error occurred (optional)
 */
export function showError(error, context = '') {
  const message = getErrorMessage(error);
  const fullMessage = context ? `${context}: ${message}` : message;
  
  console.error('Error:', fullMessage, error);
  
  // You can replace alert with a toast notification library
  alert(fullMessage);
}

/**
 * Handles API errors with context
 * @param {Error} error - Error object
 * @param {string} operation - Operation description
 * @returns {string} - Error message
 */
export function handleApiError(error, operation = 'Операция') {
  const message = getErrorMessage(error);
  showError(error, operation);
  return message;
}


