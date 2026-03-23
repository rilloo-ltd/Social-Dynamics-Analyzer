import 'server-only';

import { UserTier } from '@/types';
import {
  checkDailyUploadLimit,
  ensureUserInitialized,
  getUserTier,
  incrementDailyUpload,
} from '@/lib/firestore-admin';

export interface AnalysisQuotaSnapshot {
  tier: UserTier;
  canUpload: boolean;
  currentCount: number;
  maxUploads: number;
  remainingUploads: number;
}

export class AnalysisQuotaExceededError extends Error {
  readonly status = 429;
  readonly quota: AnalysisQuotaSnapshot;

  constructor(quota: AnalysisQuotaSnapshot) {
    super(
      quota.tier === 'free'
        ? 'הניתוח לא התחיל כי מיצית את מכסת הניתוחים שלך. כדי להמשיך לקבל ניתוחים צריך להצטרף למנוי.'
        : 'הניתוח לא התחיל כי הגעת למכסת הניתוחים שלך כרגע. אפשר לנסות שוב אחרי חידוש המכסה או לשדרג את המנוי.'
    );
    this.name = 'AnalysisQuotaExceededError';
    this.quota = quota;
  }
}

export const isAnalysisQuotaExceededError = (
  error: unknown
): error is AnalysisQuotaExceededError => {
  return error instanceof AnalysisQuotaExceededError;
};

async function getAnalysisQuotaSnapshot(
  userId?: string | null,
  userEmail?: string | null
): Promise<AnalysisQuotaSnapshot | null> {
  if (!userId) {
    return null;
  }

  await ensureUserInitialized(userId, userEmail || undefined);
  const { tier, maxDailyUploads } = await getUserTier(userId);
  const result = await checkDailyUploadLimit(userId, maxDailyUploads);

  return {
    tier,
    canUpload: result.canUpload,
    currentCount: result.currentCount,
    maxUploads: maxDailyUploads,
    remainingUploads: result.remainingUploads,
  };
}

export async function ensureAnalysisQuotaAvailable(
  userId?: string | null,
  userEmail?: string | null
): Promise<AnalysisQuotaSnapshot | null> {
  const quota = await getAnalysisQuotaSnapshot(userId, userEmail);

  if (quota && !quota.canUpload) {
    throw new AnalysisQuotaExceededError(quota);
  }

  return quota;
}

export async function consumeSuccessfulAnalysisQuota(
  userId?: string | null,
  userEmail?: string | null
): Promise<AnalysisQuotaSnapshot | null> {
  if (!userId) {
    return null;
  }

  await ensureUserInitialized(userId, userEmail || undefined);
  const { tier, maxDailyUploads } = await getUserTier(userId);

  try {
    const result = await incrementDailyUpload(userId, maxDailyUploads);
    return {
      tier,
      canUpload: result.remainingUploads > 0 || maxDailyUploads >= 999999,
      currentCount: result.currentCount,
      maxUploads: maxDailyUploads,
      remainingUploads: result.remainingUploads,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Daily upload limit reached') {
      const quota = await getAnalysisQuotaSnapshot(userId, userEmail);
      if (quota) {
        throw new AnalysisQuotaExceededError(quota);
      }
    }

    throw error;
  }
}
