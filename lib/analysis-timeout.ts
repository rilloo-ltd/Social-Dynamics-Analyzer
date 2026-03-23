export const ANALYSIS_TIMEOUT_ERROR_MESSAGE =
  'הניתוח נתקע או לא הושלם בזמן, ולכן הוא הופסק.';

export const ANALYSIS_EXECUTION_TIMEOUT_MS = 220_000;

export async function withAnalysisTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = ANALYSIS_EXECUTION_TIMEOUT_MS,
  errorMessage: string = ANALYSIS_TIMEOUT_ERROR_MESSAGE
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(errorMessage);
      error.name = 'AnalysisTimeoutError';
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
