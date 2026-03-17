/**
 * Structured logging utility for GCP Cloud Logging
 * Outputs JSON format that's easily searchable and filterable in GCP Console
 */

import { MAX_FILE_SIZE_MB } from './constants';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface LogContext {
  userId?: string;
  sessionId?: string;
  chatCode?: string;
  fileName?: string;
  fileSize?: number;
  [key: string]: any;
}

/**
 * Log a structured message with context
 */
export function log(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: Error | unknown
) {
  const timestamp = new Date().toISOString();
  
  const logEntry: any = {
    timestamp,
    severity: level,
    message,
    service: 'social-rilloo',
    ...context
  };

  // Add error details if provided
  if (error) {
    if (error instanceof Error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    } else {
      logEntry.error = {
        message: String(error)
      };
    }
  }

  // Use appropriate console method based on level
  const consoleMethod = level === LogLevel.ERROR || level === LogLevel.CRITICAL
    ? console.error
    : level === LogLevel.WARNING
    ? console.warn
    : console.log;

  // Output as JSON for GCP structured logging
  consoleMethod(JSON.stringify(logEntry));
}

/**
 * Convenience methods for different log levels
 */
export const logger = {
  debug: (message: string, context?: LogContext) => 
    log(LogLevel.DEBUG, message, context),
    
  info: (message: string, context?: LogContext) => 
    log(LogLevel.INFO, message, context),
    
  warning: (message: string, context?: LogContext, error?: Error | unknown) => 
    log(LogLevel.WARNING, message, context, error),
    
  error: (message: string, context?: LogContext, error?: Error | unknown) => 
    log(LogLevel.ERROR, message, context, error),
    
  critical: (message: string, context?: LogContext, error?: Error | unknown) => 
    log(LogLevel.CRITICAL, message, context, error)
};

/**
 * Format file size errors with user-friendly Hebrew messages
 */
export function getFileSizeErrorMessage(sizeInKB: number): string {
  const sizeMB = (sizeInKB / 1024).toFixed(2);
  
  return `הקובץ גדול מדי! הגודל שלו הוא ${sizeMB} מגה-בייט, אך המותר הוא עד ${MAX_FILE_SIZE_MB} מגה-בייט. אנא העלה קובץ קטן יותר או קצר את תקופת הצ'אט המיוצאת מוואטסאפ.`;
}

/**
 * Parse and format general errors for display to users
 */
export function getUserFriendlyError(error: any): string {
  if (typeof error === 'string') {
    if (error.includes('too large')) {
      return 'הקובץ גדול מדי. נסה להעלות קובץ קטן יותר.';
    }
    return error;
  }
  
  if (error instanceof Error) {
    if (error.message.includes('too large')) {
      return 'הקובץ גדול מדי. נסה להעלות קובץ קטן יותר.';
    }
    if (error.message.includes('network')) {
      return 'בעיית רשת. בדוק את החיבור לאינטרנט ונסה שוב.';
    }
    return error.message || 'אירעה שגיאה. נסה שוב.';
  }
  
  return 'אירעה שגיאה לא ידועה. נסה שוב.';
}
