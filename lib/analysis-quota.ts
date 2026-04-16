import 'server-only';

import { UserTier } from '@/types';
import {
  ensureUserInitialized,
  getRollingSubmissionQuota,
} from '@/lib/firestore-admin';

export interface AnalysisQuotaSnapshot {
  tier: UserTier;
  canUpload: boolean;
  currentCount: number;
  maxUploads: number;
  remainingUploads: number;
  resetAt: string | null;
}

export class AnalysisQuotaExceededError extends Error {
  readonly status = 429;
  readonly quota: AnalysisQuotaSnapshot;

  constructor(quota: AnalysisQuotaSnapshot) {
    super('Submission quota reached. Users can submit 3 parsed chats or text entries per rolling 24 hours.');
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
  const quota = await getRollingSubmissionQuota(userId);

  return {
    tier: 'free',
    canUpload: quota.canSubmit,
    currentCount: quota.currentCount,
    maxUploads: quota.maxSubmissions,
    remainingUploads: quota.remainingSubmissions,
    resetAt: quota.resetAt,
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
  return getAnalysisQuotaSnapshot(userId, userEmail);
}
