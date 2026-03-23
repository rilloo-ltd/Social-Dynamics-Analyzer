export const isNonEmptyAnalysisText = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

export const hasCompletedFullAnalysisOutput = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const result = value as Record<string, unknown>;
  return [
    result.personality,
    result.othersThoughts,
    result.improvement,
    result.hiddenThoughts,
  ].some(isNonEmptyAnalysisText);
};

export const extractCompletedAnalysisText = (value: unknown): string | null => {
  if (isNonEmptyAnalysisText(value)) {
    return value.trim();
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const result = (value as Record<string, unknown>).result;
  return isNonEmptyAnalysisText(result) ? result.trim() : null;
};

export const hasCompletedSingleAnalysisOutput = (value: unknown): boolean => {
  return extractCompletedAnalysisText(value) !== null;
};
