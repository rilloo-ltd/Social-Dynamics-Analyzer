/**
 * Cache key utilities - shared between client and server
 * Ensures consistent cache key formatting for Firestore compatibility
 */

import { UserTier } from '@/types';

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

function getAnalysisCachePrefix(tier: UserTier | string = 'free'): string {
  return tier === 'basic' || tier === 'super' || tier === 'advanced' ? 'paid:' : '';
}

/**
 * Create a sanitized cache key for full analysis
 */
export function createFullAnalysisCacheKey(anonymousUser: string, tier: UserTier | string = 'free'): string {
  return sanitizeCacheKey(`full_analysis:${getAnalysisCachePrefix(tier)}${anonymousUser}`);
}

/**
 * Create a sanitized cache key for group dynamics
 */
export function createGroupDynamicsCacheKey(participants?: string[], tier: UserTier | string = 'free'): string {
  const key = participants && participants.length > 0 
    ? `group_dynamics:${getAnalysisCachePrefix(tier)}${participants.sort().join(',')}`
    : `group_dynamics:${getAnalysisCachePrefix(tier)}all`;
  return sanitizeCacheKey(key);
}

/**
 * Create a sanitized cache key for romantic dynamics
 */
export function createRomanticDynamicsCacheKey(tier: UserTier | string = 'free'): string {
  return sanitizeCacheKey(
    getAnalysisCachePrefix(tier) ? `romantic_dynamics:${getAnalysisCachePrefix(tier)}all` : 'romantic_dynamics'
  );
}
