/**
 * Client-side error logging utility
 * Logs errors to console in structured format for debugging
 */

export interface ClientLogContext {
  userId?: string;
  page?: string;
  action?: string;
  [key: string]: any;
}

/**
 * Log client-side errors in structured format
 */
export function logClientError(
  message: string,
  error: Error | unknown,
  context?: ClientLogContext
) {
  const timestamp = new Date().toISOString();
  
  const logEntry: any = {
    timestamp,
    severity: 'ERROR',
    message,
    environment: 'client',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    ...context
  };

  // Add error details
  if (error instanceof Error) {
    logEntry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      // Capture Next.js error digest for finding server logs
      digest: (error as any).digest
    };
  } else {
    logEntry.error = {
      message: String(error)
    };
  }

  // Log to console for development
  console.error('[CLIENT ERROR]', JSON.stringify(logEntry, null, 2));
  
  // Highlight digest for debugging production errors
  if (logEntry.error?.digest) {
    console.error(`🔍 ERROR DIGEST: ${logEntry.error.digest}`);
    console.error(`Search in GCP Logs: "digest":"${logEntry.error.digest}"`);
  }
  
  // In production, you could also send to an error tracking service here
  // e.g., Sentry, LogRocket, etc.
}

/**
 * Check if error is a Server Action not found error
 */
export function isServerActionNotFoundError(error: any): boolean {
  const message = error?.message || String(error);
  return message.includes('Server Action') && message.includes('was not found');
}

/**
 * Get user-friendly error message
 */
export function getClientErrorMessage(error: any): string {
  if (isServerActionNotFoundError(error)) {
    return 'הדף לא מעודכן. אנא רענן את הדף (F5) ונסה שוב.';
  }
  
  if (error?.message) {
    return error.message;
  }
  
  return 'אירעה שגיאה. אנא נסה שוב.';
}
