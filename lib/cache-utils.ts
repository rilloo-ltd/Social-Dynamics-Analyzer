/**
 * Cache key utilities - shared between client and server
 * Ensures consistent cache key formatting for Firestore compatibility
 */

/**
 * Sanitize cache key to create valid Firestore field path
 * Removes or replaces characters that are invalid in field paths
 * 
 * Firestore field paths cannot contain: . $ # [ ] / or control characters
 * Also avoid spaces and special punctuation for safety
 */
export function sanitizeCacheKey(key: string): string {
  if (!key) return 'unknown';
  
  // Replace invalid characters with underscores
  return key
    .replace(/[.\$#\[\]\/\s~*+?^{}()|\\]/g, '_')
    .replace(/_{2,}/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Trim leading/trailing underscores
}

/**
 * Create a sanitized cache key for full analysis
 */
export function createFullAnalysisCacheKey(anonymousUser: string): string {
  return sanitizeCacheKey(`full_analysis:${anonymousUser}`);
}

/**
 * Create a sanitized cache key for group dynamics
 */
export function createGroupDynamicsCacheKey(participants?: string[]): string {
  const key = participants && participants.length > 0 
    ? `group_dynamics:${participants.sort().join(',')}`
    : `group_dynamics:all`;
  return sanitizeCacheKey(key);
}

/**
 * Create a sanitized cache key for romantic dynamics
 */
export function createRomanticDynamicsCacheKey(): string {
  return sanitizeCacheKey('romantic_dynamics');
}
