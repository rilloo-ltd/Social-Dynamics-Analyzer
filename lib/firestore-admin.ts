import 'server-only';
import { logger } from './logger';
import { sanitizeCacheKey } from './cache-utils';
import {
  AdminAuditLogEntry,
  AnalysisDepthMode,
  ParticipantAxisDistributionSummary,
  ParticipantAxisKey,
  ParticipantAxisScore
} from '@/types';
import { ALLOWED_ADMIN_EMAIL, isAllowedAdminEmail, normalizeEmail } from './admin-identity';

// Server-side Firestore operations using Firebase Admin SDK
// This file is for API routes and server actions

// ============ ADMIN USERS ============
const PRIVILEGED_SUPER_USER_EMAILS = new Set([
  ALLOWED_ADMIN_EMAIL,
  'tester@gmail.com',
]);
const FREE_TIER_TOTAL_UPLOAD_LIMIT = 3;
const SUPER_TIER_UPLOAD_LIMIT = 50;

function isPrivilegedSuperUserEmail(email?: string): boolean {
  return PRIVILEGED_SUPER_USER_EMAILS.has(normalizeEmail(email));
}

function getAdminAuth() {
  try {
    const admin = require('firebase-admin');

    if (!admin.apps.length) {
      getAdminDb();
    }

    return admin.auth();
  } catch (error) {
    logger.warning('Error getting Firebase Admin auth', {}, error instanceof Error ? error : undefined);
    return null;
  }
}

async function getAuthUserEmail(userId: string): Promise<string | undefined> {
  const adminAuth = getAdminAuth();

  if (!adminAuth) {
    return undefined;
  }

  try {
    const userRecord = await adminAuth.getUser(userId);
    return normalizeEmail(userRecord.email);
  } catch (error) {
    logger.warning('Error fetching auth user email', { userId }, error instanceof Error ? error : undefined);
    return undefined;
  }
}

/**
 * Check if a user is an admin with unlimited processing privileges
 * Admin status is stored in Firestore: users/{userId} with field isAdmin: true
 */
async function isAdminUser(userId: string): Promise<boolean> {
  const db = getAdminDb();
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : undefined;
    const resolvedEmail = normalizeEmail(userData?.email) || await getAuthUserEmail(userId);
    
    if (isAllowedAdminEmail(resolvedEmail)) {
      return true;
    }

    if (!userDoc.exists) {
      return false;
    }
    
    return userData?.isAdmin === true;
  } catch (error) {
    logger.error('Error checking admin status', { userId }, error instanceof Error ? error : undefined);
    return false;
  }
}

let adminInitialized = false;
let adminDb: any = null;

type AnalyticsEventStatus = 'started' | 'completed' | 'failed' | 'rejected' | 'submitted' | 'created' | 'updated';

interface AnalyticsEventInput {
  timestamp?: string;
  category: string;
  eventName: string;
  status: AnalyticsEventStatus;
  level?: 'info' | 'warning' | 'error';
  userId?: string | null;
  userEmail?: string | null;
  sessionId?: string | null;
  tier?: string | null;
  analysisType?: string | null;
  analysisMode?: AnalysisDepthMode | null;
  model?: string | null;
  endpoint?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  durationMs?: number | null;
  errorCode?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

interface GeminiUsageLogInput {
  timestamp?: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  feature?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  sessionId?: string | null;
  durationMs?: number | null;
  endpoint?: string | null;
  estimatedCostUsd?: number | null;
}

interface FeedbackLogInput {
  userId: string;
  sessionId: string;
  rating: number;
  comment: string;
  analysisType?: string | null;
  analysisMode?: AnalysisDepthMode | null;
  tier?: string | null;
  chatCode?: string | null;
  timestamp?: string;
}

const ANALYTICS_COLLECTION = 'analyticsEvents';
const FEEDBACK_COLLECTION = 'feedbackEntries';
const ADMIN_AUDIT_COLLECTION = 'adminAuditLog';
const ADMIN_DAILY_METRICS_COLLECTION = 'adminDailyMetrics';

const GEMINI_MODEL_PRICING_USD_PER_MILLION: Record<
  string,
  { input: number | null; output: number | null }
> = {
  'gemini-3-flash-preview': {
    input: Number(process.env.GEMINI_3_FLASH_INPUT_USD_PER_MILLION || 0.075),
    output: Number(process.env.GEMINI_3_FLASH_OUTPUT_USD_PER_MILLION || 0.3),
  },
  'gemini-3-pro-preview': {
    input: process.env.GEMINI_3_PRO_INPUT_USD_PER_MILLION
      ? Number(process.env.GEMINI_3_PRO_INPUT_USD_PER_MILLION)
      : null,
    output: process.env.GEMINI_3_PRO_OUTPUT_USD_PER_MILLION
      ? Number(process.env.GEMINI_3_PRO_OUTPUT_USD_PER_MILLION)
      : null,
  },
};

function getAdminFieldValue() {
  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    getAdminDb();
  }

  return admin.firestore.FieldValue;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function roundUsd(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

function getDateKey(timestamp?: string): string {
  return (timestamp || new Date().toISOString()).split('T')[0];
}

export function estimateGeminiCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = GEMINI_MODEL_PRICING_USD_PER_MILLION[model];

  if (!pricing || pricing.input === null || pricing.output === null) {
    return null;
  }

  return roundUsd(
    (toFiniteNumber(inputTokens) * pricing.input) / 1_000_000 +
    (toFiniteNumber(outputTokens) * pricing.output) / 1_000_000
  );
}

async function mergeAdminDailyMetrics(
  timestamp: string,
  counters: Partial<Record<
    | 'uploadsCount'
    | 'uploadParticipantsTotal'
    | 'uploadTokensTotal'
    | 'buttonClicksCount'
    | 'sharesCount'
    | 'imageGenerationCount'
    | 'feedbackCount'
    | 'feedbackRatingSum'
    | 'feedbackLowRatingCount'
    | 'analysisStartedCount'
    | 'analysisCompletedCount'
    | 'analysisFailedCount'
    | 'geminiInputTokens'
    | 'geminiOutputTokens'
    | 'geminiCostMicros'
    | 'subscriptionActivatedCount'
    | 'subscriptionCancelledCount'
    | 'subscriptionRenewedCount'
    | 'adminActionsCount',
    number
  >>
) {
  const entries = Object.entries(counters).filter(([, value]) => typeof value === 'number' && value !== 0);
  if (entries.length === 0) {
    return;
  }

  const FieldValue = getAdminFieldValue();
  const dateKey = getDateKey(timestamp);
  const updateData: Record<string, unknown> = {
    date: dateKey,
    updatedAt: new Date().toISOString(),
  };

  entries.forEach(([key, value]) => {
    updateData[key] = FieldValue.increment(value);
  });

  await getAdminDb().collection(ADMIN_DAILY_METRICS_COLLECTION).doc(dateKey).set(updateData, { merge: true });
}

export async function recordAnalyticsEvent(event: AnalyticsEventInput): Promise<string> {
  const db = getAdminDb();
  const timestamp = event.timestamp || new Date().toISOString();

  const eventRef = await db.collection(ANALYTICS_COLLECTION).add({
    timestamp,
    category: event.category,
    eventName: event.eventName,
    status: event.status,
    level: event.level || (event.status === 'failed' ? 'error' : 'info'),
    userId: event.userId || null,
    userEmail: normalizeEmail(event.userEmail) || null,
    sessionId: event.sessionId || null,
    tier: event.tier || null,
    analysisType: event.analysisType || null,
    analysisMode: event.analysisMode || null,
    model: event.model || null,
    endpoint: event.endpoint || null,
    inputTokens: typeof event.inputTokens === 'number' ? event.inputTokens : null,
    outputTokens: typeof event.outputTokens === 'number' ? event.outputTokens : null,
    estimatedCostUsd: typeof event.estimatedCostUsd === 'number' ? roundUsd(event.estimatedCostUsd) : null,
    durationMs: typeof event.durationMs === 'number' ? event.durationMs : null,
    errorCode: event.errorCode || null,
    message: event.message || null,
    metadata: event.metadata || {},
  });

  const dailyCounters: Partial<Record<
    | 'analysisStartedCount'
    | 'analysisCompletedCount'
    | 'analysisFailedCount'
    | 'subscriptionActivatedCount'
    | 'subscriptionCancelledCount'
    | 'subscriptionRenewedCount'
    | 'adminActionsCount',
    number
  >> = {};

  if (event.category === 'analysis') {
    if (event.status === 'started') dailyCounters.analysisStartedCount = 1;
    if (event.status === 'completed') dailyCounters.analysisCompletedCount = 1;
    if (event.status === 'failed') dailyCounters.analysisFailedCount = 1;
  }

  if (event.category === 'payment') {
    if (event.eventName === 'subscription_activated') dailyCounters.subscriptionActivatedCount = 1;
    if (event.eventName === 'subscription_cancelled') dailyCounters.subscriptionCancelledCount = 1;
    if (event.eventName === 'subscription_renewed') dailyCounters.subscriptionRenewedCount = 1;
  }

  if (event.category === 'admin') {
    dailyCounters.adminActionsCount = 1;
  }

  await mergeAdminDailyMetrics(timestamp, dailyCounters);

  return eventRef.id;
}

export async function recordAdminAuditLog(
  actor: { email: string; userId?: string | null },
  action: string,
  target: { userId?: string | null; id?: string | null } = {},
  details?: Record<string, unknown>
): Promise<AdminAuditLogEntry> {
  const timestamp = new Date().toISOString();
  const docRef = await getAdminDb().collection(ADMIN_AUDIT_COLLECTION).add({
    action,
    actorEmail: normalizeEmail(actor.email),
    actorUserId: actor.userId || null,
    targetUserId: target.userId || null,
    targetId: target.id || null,
    timestamp,
    details: details || {},
  });

  await recordAnalyticsEvent({
    timestamp,
    category: 'admin',
    eventName: action,
    status: 'updated',
    userId: actor.userId || null,
    userEmail: actor.email,
    message: `Admin action: ${action}`,
    metadata: {
      targetUserId: target.userId || null,
      targetId: target.id || null,
      ...details,
    },
  });

  return {
    id: docRef.id,
    action,
    actorEmail: normalizeEmail(actor.email),
    actorUserId: actor.userId || null,
    targetUserId: target.userId || null,
    targetId: target.id || null,
    timestamp,
    details,
  };
}

export function getAdminDb() {
  if (adminInitialized) {
    return adminDb;
  }

  try {
    // Dynamic import to avoid errors if firebase-admin is not installed yet
    const admin = require('firebase-admin');
    const path = require('path');
    const fs = require('fs');
    
    if (!admin.apps.length) {
      let credential;
      
      // Try to load service account key from file
      const serviceAccountPath = path.join(process.cwd(), 'firebase-admin-key.json');
      
      if (fs.existsSync(serviceAccountPath)) {
        logger.info('Loading Firebase Admin credentials from firebase-admin-key.json');
        const serviceAccountContent = fs.readFileSync(serviceAccountPath, 'utf-8');
        const serviceAccount = JSON.parse(serviceAccountContent);
        credential = admin.credential.cert(serviceAccount);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        logger.info('Loading Firebase Admin credentials from GOOGLE_APPLICATION_CREDENTIALS');
        credential = admin.credential.applicationDefault();
      } else {
        logger.info('Using default Firebase Admin credentials (for Cloud Run/GCP)');
        credential = admin.credential.applicationDefault();
      }
      
      admin.initializeApp({
        credential,
        projectId: process.env.FIREBASE_PROJECT_ID || 'social-analyzer-24750033-dc53d'
      });
    }
    
    adminDb = admin.firestore();
    adminInitialized = true;
    return adminDb;
  } catch (error) {
    logger.error('Firebase Admin SDK not initialized', {}, error instanceof Error ? error : undefined);
    throw new Error('Firebase Admin SDK initialization failed. Check credentials.');
  }
}

// Firestore structure:
// users/{userId}/
//   - dailyStats: { date, uploadCount, lastUpload }
//   - uploads/{uploadId}: { timestamp, participantsCount, tokensCount }
//   - sessions/{sessionId}: { shares[], images[], feedback }
// 
// globalStats/
//   - buttonPresses: { buttonId: count }
//   - geminiUsage/{usageId}: { timestamp, inputTokens, outputTokens, model }
//
// referralCodes/{code}: { code, generatedBy, userName, usesRemaining, usedBy[] }

const PARTICIPANT_AXIS_KEYS: ParticipantAxisKey[] = ['liberalism', 'calmness', 'rationalism', 'humor'];
const PARTICIPANT_AXIS_MIN = 1;
const PARTICIPANT_AXIS_MAX = 10;
let inMemoryParticipantAxisSummary: ParticipantAxisDistributionSummary | null = null;

function clampParticipantAxisScore(value: unknown): number {
  const numericValue = Math.round(Number(value));

  if (Number.isNaN(numericValue)) {
    return 5;
  }

  return Math.min(PARTICIPANT_AXIS_MAX, Math.max(PARTICIPANT_AXIS_MIN, numericValue));
}

function createEmptyParticipantAxisBuckets(): Record<number, number> {
  const buckets: Record<number, number> = {};

  for (let score = PARTICIPANT_AXIS_MIN; score <= PARTICIPANT_AXIS_MAX; score++) {
    buckets[score] = 0;
  }

  return buckets;
}

function buildParticipantAxisDistributionSummary(data?: any): ParticipantAxisDistributionSummary {
  const axisBuckets = data?.axisBuckets || {};

  return {
    totalObservations: Number(data?.totalObservations || 0),
    liberalism: PARTICIPANT_AXIS_KEYS.includes('liberalism')
      ? Object.fromEntries(
          Array.from({ length: PARTICIPANT_AXIS_MAX }, (_, index) => {
            const score = index + PARTICIPANT_AXIS_MIN;
            return [score, Number(axisBuckets?.liberalism?.[`s${score}`] || 0)];
          })
        )
      : createEmptyParticipantAxisBuckets(),
    calmness: PARTICIPANT_AXIS_KEYS.includes('calmness')
      ? Object.fromEntries(
          Array.from({ length: PARTICIPANT_AXIS_MAX }, (_, index) => {
            const score = index + PARTICIPANT_AXIS_MIN;
            return [score, Number(axisBuckets?.calmness?.[`s${score}`] || 0)];
          })
        )
      : createEmptyParticipantAxisBuckets(),
    rationalism: PARTICIPANT_AXIS_KEYS.includes('rationalism')
      ? Object.fromEntries(
          Array.from({ length: PARTICIPANT_AXIS_MAX }, (_, index) => {
            const score = index + PARTICIPANT_AXIS_MIN;
            return [score, Number(axisBuckets?.rationalism?.[`s${score}`] || 0)];
          })
        )
      : createEmptyParticipantAxisBuckets(),
    humor: PARTICIPANT_AXIS_KEYS.includes('humor')
      ? Object.fromEntries(
          Array.from({ length: PARTICIPANT_AXIS_MAX }, (_, index) => {
            const score = index + PARTICIPANT_AXIS_MIN;
            return [score, Number(axisBuckets?.humor?.[`s${score}`] || 0)];
          })
        )
      : createEmptyParticipantAxisBuckets(),
  };
}

function buildParticipantAxisBucketDocument(summary: ParticipantAxisDistributionSummary): Record<string, Record<string, number>> {
  return Object.fromEntries(
    PARTICIPANT_AXIS_KEYS.map((axis) => {
      return [
        axis,
        Object.fromEntries(
          Array.from({ length: PARTICIPANT_AXIS_MAX }, (_, index) => {
            const score = index + PARTICIPANT_AXIS_MIN;
            return [`s${score}`, Number(summary[axis][score] || 0)];
          })
        )
      ];
    })
  );
}

function sanitizeParticipantAxisScores(scores: ParticipantAxisScore[]): ParticipantAxisScore[] {
  const dedupedScores = new Map<string, ParticipantAxisScore>();

  for (const score of scores || []) {
    if (!score?.participantCode || typeof score.participantCode !== 'string') {
      continue;
    }

    dedupedScores.set(score.participantCode, {
      participantCode: score.participantCode,
      liberalism: clampParticipantAxisScore(score.liberalism),
      calmness: clampParticipantAxisScore(score.calmness),
      rationalism: clampParticipantAxisScore(score.rationalism),
      humor: clampParticipantAxisScore(score.humor),
    });
  }

  return Array.from(dedupedScores.values());
}

// ============ UTILITY FUNCTIONS ============

/**
 * Validate that a string is safe to use as a Firestore document ID
 */
function isValidFirestoreDocumentId(id: string): boolean {
  if (!id || id.length === 0) return false;
  if (id.length > 1500) return false;
  if (id === '.' || id === '..') return false;
  if (id.includes('/')) return false;
  // Check for invalid characters (only allow alphanumeric, dash, underscore)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;
  return true;
}

export async function recordParticipantAxisScores(
  scores: ParticipantAxisScore[],
  sourceType: string
): Promise<{ storedCount: number }> {
  const sanitizedScores = sanitizeParticipantAxisScores(scores);

  if (sanitizedScores.length === 0) {
    return { storedCount: 0 };
  }
  const previousSummary = inMemoryParticipantAxisSummary || buildParticipantAxisDistributionSummary();
  const nextSummary: ParticipantAxisDistributionSummary = {
    totalObservations: previousSummary.totalObservations + sanitizedScores.length,
    liberalism: { ...previousSummary.liberalism },
    calmness: { ...previousSummary.calmness },
    rationalism: { ...previousSummary.rationalism },
    humor: { ...previousSummary.humor },
  };

  for (const score of sanitizedScores) {
    PARTICIPANT_AXIS_KEYS.forEach((axis) => {
      const axisScore = score[axis];
      nextSummary[axis][axisScore] = (nextSummary[axis][axisScore] || 0) + 1;
    });
  }

  inMemoryParticipantAxisSummary = nextSummary;

  return { storedCount: sanitizedScores.length };
}

export async function getParticipantAxisDistributionSummary(): Promise<ParticipantAxisDistributionSummary> {
  return inMemoryParticipantAxisSummary || buildParticipantAxisDistributionSummary();
}

// ============ UPLOAD TRACKING ============

export async function checkDailyUploadLimit(userId: string, maxUploads: number = FREE_TIER_TOTAL_UPLOAD_LIMIT) {
  // Admin users have unlimited uploads
  if (await isAdminUser(userId)) {
    return { canUpload: true, currentCount: 0, remainingUploads: 999999 };
  }

  // Check if user has unlimited access via promo code
  const userTier = await getUserTier(userId);
  const effectiveMaxUploads = userTier.maxDailyUploads;
  
  // Users with 999999 max uploads have unlimited access
  if (effectiveMaxUploads >= 999999) {
    return { canUpload: true, currentCount: 0, remainingUploads: 999999 };
  }

  const db = getAdminDb();

  if (userTier.tier === 'free') {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const storedTotalUploads = Number(userDoc.data()?.totalUploadsUsed);
    const currentCount = Number.isFinite(storedTotalUploads) ? storedTotalUploads : 0;

    return {
      canUpload: currentCount < effectiveMaxUploads,
      currentCount,
      remainingUploads: Math.max(0, effectiveMaxUploads - currentCount)
    };
  }

  const today = new Date().toISOString().split('T')[0];
  
  const statsDoc = await db.collection('users').doc(userId).collection('dailyStats').doc(today).get();
  
  if (!statsDoc.exists) {
    return { canUpload: true, currentCount: 0, remainingUploads: effectiveMaxUploads };
  }
  
  const data = statsDoc.data();
  const currentCount = data?.uploadCount || 0;
  
  return {
    canUpload: currentCount < effectiveMaxUploads,
    currentCount,
    remainingUploads: Math.max(0, effectiveMaxUploads - currentCount)
  };
}

export async function incrementDailyUpload(userId: string, maxUploads: number = FREE_TIER_TOTAL_UPLOAD_LIMIT) {
  // Admin users bypass limits but we still track their uploads
  const isAdmin = await isAdminUser(userId);
  
  // Check if user has unlimited access via promo code
  const userTier = await getUserTier(userId);
  const hasUnlimited = isAdmin || userTier.maxDailyUploads >= 999999;

  const db = getAdminDb();

  if (!hasUnlimited && userTier.tier === 'free') {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const storedTotalUploads = Number(userDoc.data()?.totalUploadsUsed);
    const currentCount = Number.isFinite(storedTotalUploads) ? storedTotalUploads : 0;

    if (currentCount >= userTier.maxDailyUploads) {
      throw new Error('Daily upload limit reached');
    }

    await userRef.set({
      totalUploadsUsed: currentCount + 1,
      totalUploadsSyncedAt: new Date().toISOString(),
    }, { merge: true });

    return {
      success: true,
      currentCount: currentCount + 1,
      remainingUploads: Math.max(0, userTier.maxDailyUploads - currentCount - 1)
    };
  }

  const today = new Date().toISOString().split('T')[0];
  
  const statsRef = db.collection('users').doc(userId).collection('dailyStats').doc(today);
  const statsDoc = await statsRef.get();
  
  if (!statsDoc.exists) {
    await statsRef.set({
      date: today,
      uploadCount: 1,
      lastUpload: new Date().toISOString()
    });
    return { success: true, currentCount: 1, remainingUploads: hasUnlimited ? 999999 : userTier.maxDailyUploads - 1 };
  }
  
  const currentCount = statsDoc.data()?.uploadCount || 0;
  
  // Only enforce limit for users without unlimited access
  if (!hasUnlimited && currentCount >= userTier.maxDailyUploads) {
    throw new Error('Daily upload limit reached');
  }
  
  await statsRef.update({
    uploadCount: currentCount + 1,
    lastUpload: new Date().toISOString()
  });
  
  return {
    success: true,
    currentCount: currentCount + 1,
    remainingUploads: hasUnlimited ? 999999 : Math.max(0, userTier.maxDailyUploads - currentCount - 1)
  };
}

export async function resetDailyUploadLimit(userId: string) {
  const db = getAdminDb();
  const today = new Date().toISOString().split('T')[0];
  
  try {
    await db.collection('users').doc(userId).collection('dailyStats').doc(today).delete();
    logger.info('Daily upload limit reset successfully', { userId, date: today });
    return { success: true, message: 'Daily upload limit reset successfully' };
  } catch (error) {
    logger.error('Error resetting daily upload limit', { userId, date: today }, error instanceof Error ? error : undefined);
    throw new Error('Failed to reset daily upload limit');
  }
}

export async function updateUserTier(
  userId: string,
  tier: 'free' | 'basic' | 'super' | 'friends',
  maxDailyUploads: number,
  tierExpiresAt?: string | null
) {
  const db = getAdminDb();
  
  try {
    await db.collection('users').doc(userId).set({
      tier,
      maxDailyUploads,
      tierExpiresAt: tierExpiresAt ?? null,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    logger.info('User tier updated', { userId, tier, maxDailyUploads });
    return { success: true };
  } catch (error) {
    logger.error('Error updating user tier', { userId, tier, maxDailyUploads }, error instanceof Error ? error : undefined);
    throw new Error('Failed to update user tier');
  }
}

export async function getUserTier(userId: string): Promise<{
  tier: 'free' | 'basic' | 'super' | 'friends';
  maxDailyUploads: number;
}> {
  const db = getAdminDb();
  
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const data = userDoc.exists ? userDoc.data() : undefined;
    const resolvedEmail = normalizeEmail(data?.email) || await getAuthUserEmail(userId);

    if (isPrivilegedSuperUserEmail(resolvedEmail)) {
      const needsSync =
        !userDoc.exists ||
        data?.tier !== 'super' ||
        data?.maxDailyUploads !== SUPER_TIER_UPLOAD_LIMIT ||
        normalizeEmail(data?.email) !== resolvedEmail;

      if (needsSync) {
        await userRef.set({
          tier: 'super',
          maxDailyUploads: SUPER_TIER_UPLOAD_LIMIT,
          isAdmin: isAllowedAdminEmail(resolvedEmail),
          updatedAt: new Date().toISOString(),
          ...(resolvedEmail && { email: resolvedEmail })
        }, { merge: true });
      }

      return { tier: 'super', maxDailyUploads: SUPER_TIER_UPLOAD_LIMIT };
    }

    if (!userDoc.exists) {
      return { tier: 'free', maxDailyUploads: FREE_TIER_TOTAL_UPLOAD_LIMIT };
    }

    const tier = data?.tier || 'free';
    const tierExpiresAt: string | null = data?.tierExpiresAt || null;

    // Check if time-limited tier has expired
    if (tier === 'friends' && tierExpiresAt && new Date(tierExpiresAt) < new Date()) {
      await userRef.set({
        tier: 'free',
        maxDailyUploads: FREE_TIER_TOTAL_UPLOAD_LIMIT,
        tierExpiresAt: null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return { tier: 'free', maxDailyUploads: FREE_TIER_TOTAL_UPLOAD_LIMIT };
    }

    const resolvedMaxDailyUploads =
      tier === 'super' || tier === 'friends'
        ? SUPER_TIER_UPLOAD_LIMIT
        : tier === 'basic'
          ? Number(data?.maxDailyUploads || 10)
          : FREE_TIER_TOTAL_UPLOAD_LIMIT;

    if (data?.maxDailyUploads !== resolvedMaxDailyUploads) {
      await userRef.set({
        maxDailyUploads: resolvedMaxDailyUploads,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    const bonusUploads = Number.isFinite(data?.bonusUploads) ? Math.max(0, Number(data.bonusUploads)) : 0;

    return {
      tier,
      maxDailyUploads: resolvedMaxDailyUploads + bonusUploads
    };
  } catch (error) {
    logger.error('Error getting user tier', { userId }, error instanceof Error ? error : undefined);
    return { tier: 'free', maxDailyUploads: FREE_TIER_TOTAL_UPLOAD_LIMIT };
  }
}

/**
 * Initialize user document with default values if it doesn't exist
 * This ensures new users have a clean state in Firestore
 */
export async function ensureUserInitialized(userId: string, email?: string) {
  const db = getAdminDb();
  
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const resolvedEmail = normalizeEmail(email) || await getAuthUserEmail(userId);
    
    if (!userDoc.exists) {
      const isPrivilegedUser = isPrivilegedSuperUserEmail(resolvedEmail);

      // Create user document with defaults
      await userRef.set({
        tier: isPrivilegedUser ? 'super' : 'free',
        maxDailyUploads: isPrivilegedUser ? SUPER_TIER_UPLOAD_LIMIT : FREE_TIER_TOTAL_UPLOAD_LIMIT,
        totalUploadsUsed: 0,
        isAdmin: isAllowedAdminEmail(resolvedEmail),
        createdAt: new Date().toISOString(),
        ...(resolvedEmail && { email: resolvedEmail })
      });
      logger.info('Initialized new user document', { userId, email: resolvedEmail || 'none' });
    } else if (resolvedEmail && isAllowedAdminEmail(resolvedEmail) && userDoc.data()?.isAdmin !== true) {
      await userRef.set({
        email: resolvedEmail,
        isAdmin: true,
        adminSyncedAt: new Date().toISOString(),
      }, { merge: true });
    }
  } catch (error) {
    logger.warning('Error initializing user document', { userId }, error instanceof Error ? error : undefined);
    // Don't throw - this is a best-effort initialization
  }
}

/**
 * Set admin status for a user
 * @param userId - User ID to grant/revoke admin privileges
 * @param isAdmin - true to grant admin, false to revoke
 */
export async function setAdminStatus(userId: string, isAdmin: boolean) {
  const db = getAdminDb();
  
  try {
    await db.collection('users').doc(userId).set({
      isAdmin,
      adminUpdatedAt: new Date().toISOString()
    }, { merge: true });
    
    logger.info('Admin status updated', { userId, isAdmin });
    return { success: true, message: `Admin status ${isAdmin ? 'granted' : 'revoked'} for user ${userId}` };
  } catch (error) {
    logger.error('Error setting admin status', { userId, isAdmin }, error instanceof Error ? error : undefined);
    throw new Error('Failed to set admin status');
  }
}

// ============ ANALYTICS ============

export async function logUpload(userId: string, participantsCount: number, tokensCount: number) {
  const db = getAdminDb();
  const timestamp = new Date().toISOString();
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() : undefined;
  
  const uploadRef = await db.collection('users').doc(userId).collection('uploads').add({
    timestamp,
    participantsCount,
    tokensCount
  });
  
  const sessionId = uploadRef.id;
  
  // Create session document
  await db.collection('users').doc(userId).collection('sessions').doc(sessionId).set({
    shares: [],
    images: [],
    createdAt: timestamp
  });

  await db.collection('users').doc(userId).set({
    lastUploadAt: timestamp,
  }, { merge: true });

  await recordAnalyticsEvent({
    timestamp,
    category: 'upload',
    eventName: 'upload_completed',
    status: 'completed',
    userId,
    userEmail: normalizeEmail(userData?.email) || await getAuthUserEmail(userId),
    sessionId,
    tier: userData?.tier || null,
    message: 'Upload logged successfully',
    metadata: {
      participantsCount,
      tokensCount,
    },
  });

  await mergeAdminDailyMetrics(timestamp, {
    uploadsCount: 1,
    uploadParticipantsTotal: participantsCount,
    uploadTokensTotal: tokensCount,
  });
  
  return sessionId;
}

export async function logButtonPress(buttonId: string) {
  const db = getAdminDb();
  const timestamp = new Date().toISOString();
  const FieldValue = getAdminFieldValue();
  
  const buttonRef = db.collection('globalStats').doc('buttonPresses');
  
  await buttonRef.set({
    [buttonId]: FieldValue.increment(1)
  }, { merge: true });

  await recordAnalyticsEvent({
    timestamp,
    category: 'button',
    eventName: 'button_clicked',
    status: 'completed',
    message: `Button clicked: ${buttonId}`,
    metadata: {
      buttonId,
    },
  });

  await mergeAdminDailyMetrics(timestamp, {
    buttonClicksCount: 1,
  });
}

export async function logShare(userId: string, sessionId: string, type: string, platform?: string) {
  const db = getAdminDb();
  const timestamp = new Date().toISOString();
  
  const sessionRef = db.collection('users').doc(userId).collection('sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  const currentShares = sessionDoc.data()?.shares || [];
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() : undefined;
  
  await sessionRef.update({
    shares: [...currentShares, {
      type,
      platform,
      timestamp
    }]
  });

  await recordAnalyticsEvent({
    timestamp,
    category: 'share',
    eventName: 'share_completed',
    status: 'completed',
    userId,
    userEmail: normalizeEmail(userData?.email) || await getAuthUserEmail(userId),
    sessionId,
    tier: userData?.tier || null,
    message: `Share completed for ${type}`,
    metadata: {
      shareType: type,
      platform: platform || null,
    },
  });

  await mergeAdminDailyMetrics(timestamp, {
    sharesCount: 1,
  });
}

export async function logImageGeneration(userId: string, sessionId: string, prompt: string) {
  const db = getAdminDb();
  const timestamp = new Date().toISOString();
  
  const sessionRef = db.collection('users').doc(userId).collection('sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  const currentImages = sessionDoc.data()?.images || [];
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() : undefined;
  
  await sessionRef.update({
    images: [...currentImages, {
      prompt,
      timestamp
    }]
  });

  await recordAnalyticsEvent({
    timestamp,
    category: 'image',
    eventName: 'image_generation_completed',
    status: 'completed',
    userId,
    userEmail: normalizeEmail(userData?.email) || await getAuthUserEmail(userId),
    sessionId,
    tier: userData?.tier || null,
    message: 'Image generation logged',
    metadata: {
      promptLength: prompt.length,
    },
  });

  await mergeAdminDailyMetrics(timestamp, {
    imageGenerationCount: 1,
  });
}

export async function logFeedback({
  userId,
  sessionId,
  rating,
  comment,
  analysisType,
  analysisMode,
  tier,
  chatCode,
  timestamp = new Date().toISOString(),
}: FeedbackLogInput) {
  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() : undefined;
  const normalizedEmail = normalizeEmail(userData?.email) || await getAuthUserEmail(userId) || null;
  const trimmedComment = String(comment || '').trim();
  const safeRating = Math.max(1, Math.min(10, Math.round(Number(rating) || 0)));
  const feedbackPayload = {
    rating: safeRating,
    comment: trimmedComment,
    timestamp,
    analysisType: analysisType || null,
    analysisMode: analysisMode || null,
    tier: tier || userData?.tier || null,
    chatCode: chatCode || null,
  };
  
  await db.collection('users').doc(userId).collection('sessions').doc(sessionId).update({
    feedback: feedbackPayload
  });

  await db.collection(FEEDBACK_COLLECTION).add({
    userId,
    userEmail: normalizedEmail,
    sessionId,
    timestamp,
    rating: safeRating,
    comment: trimmedComment,
    hasComment: trimmedComment.length > 0,
    analysisType: analysisType || null,
    analysisMode: analysisMode || null,
    tier: tier || userData?.tier || null,
    chatCode: chatCode || null,
  });

  await recordAnalyticsEvent({
    timestamp,
    category: 'feedback',
    eventName: 'feedback_submitted',
    status: 'submitted',
    userId,
    userEmail: normalizedEmail,
    sessionId,
    tier: tier || userData?.tier || null,
    analysisType: analysisType || null,
    analysisMode: analysisMode || null,
    message: 'Feedback submitted',
    metadata: {
      rating: safeRating,
      hasComment: trimmedComment.length > 0,
      chatCode: chatCode || null,
    },
  });

  await mergeAdminDailyMetrics(timestamp, {
    feedbackCount: 1,
    feedbackRatingSum: safeRating,
    feedbackLowRatingCount: safeRating <= 4 ? 1 : 0,
  });
}

export async function logGeminiUsage(inputTokens: number, outputTokens: number, model: string) {
  return logGeminiUsageDetailed({
    inputTokens,
    outputTokens,
    model,
  });
}

export async function logGeminiUsageDetailed({
  timestamp = new Date().toISOString(),
  inputTokens,
  outputTokens,
  model,
  feature,
  userId,
  userEmail,
  sessionId,
  durationMs,
  endpoint,
  estimatedCostUsd,
}: GeminiUsageLogInput) {
  const db = getAdminDb();
  const resolvedEstimatedCostUsd =
    typeof estimatedCostUsd === 'number'
      ? estimatedCostUsd
      : estimateGeminiCostUsd(model, inputTokens, outputTokens);
  
  await db.collection('geminiUsage').add({
    timestamp,
    inputTokens,
    outputTokens,
    model,
    feature: feature || null,
    userId: userId || null,
    userEmail: normalizeEmail(userEmail) || null,
    sessionId: sessionId || null,
    durationMs: typeof durationMs === 'number' ? durationMs : null,
    endpoint: endpoint || null,
    estimatedCostUsd: typeof resolvedEstimatedCostUsd === 'number' ? roundUsd(resolvedEstimatedCostUsd) : null,
  });

  await recordAnalyticsEvent({
    timestamp,
    category: 'ai',
    eventName: 'gemini_usage_logged',
    status: 'completed',
    userId,
    userEmail,
    sessionId,
    model,
    endpoint: endpoint || null,
    inputTokens,
    outputTokens,
    estimatedCostUsd: resolvedEstimatedCostUsd,
    durationMs: typeof durationMs === 'number' ? durationMs : null,
    message: feature ? `Gemini usage logged for ${feature}` : 'Gemini usage logged',
    metadata: {
      feature: feature || null,
    },
  });

  await mergeAdminDailyMetrics(timestamp, {
    geminiInputTokens: inputTokens,
    geminiOutputTokens: outputTokens,
    geminiCostMicros: typeof resolvedEstimatedCostUsd === 'number'
      ? Math.round(resolvedEstimatedCostUsd * 1_000_000)
      : 0,
  });
}

export async function createGlobalReferralCode(userId: string, userName: string, code: string, uses: number = 3) {
  const db = getAdminDb();
  
  await db.collection('referralCodes').doc(code).set({
    code,
    generatedBy: userId,
    userName,
    usesRemaining: uses,
    usedBy: [],
    createdAt: new Date().toISOString()
  });
  
  return code;
}

export async function createCreditCode(code: string, credits: number = 2) {
  const db = getAdminDb();
  await db.collection('creditCodes').doc(code).set({
    code,
    credits,
    usesRemaining: 1,
    usedBy: [],
    createdAt: new Date().toISOString(),
  });
  return code;
}

export async function addBonusUploadsToUser(userId: string, credits: number) {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();
  const current = Number.isFinite(userDoc.data()?.bonusUploads) ? Math.max(0, Number(userDoc.data()?.bonusUploads)) : 0;
  await userRef.set({ bonusUploads: current + credits }, { merge: true });
}

// ============ ADMIN OPERATIONS ============

export async function getAllStats() {
  const db = getAdminDb();
  
  // Get global stats
  const buttonPressesDoc = await db.collection('globalStats').doc('buttonPresses').get();
  const geminiUsageSnapshot = await db.collection('geminiUsage').get();
  
  // Get all users' data
  const usersSnapshot = await db.collection('users').get();
  
  const uploads: any[] = [];
  const sessions: any = {};
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    
    // Get user's uploads
    const uploadsSnapshot = await db.collection('users').doc(userId).collection('uploads').get();
    uploadsSnapshot.forEach((doc: any) => {
      uploads.push({
        ...doc.data(),
        sessionId: doc.id,
        userId
      });
    });
    
    // Get user's sessions
    const sessionsSnapshot = await db.collection('users').doc(userId).collection('sessions').get();
    sessionsSnapshot.forEach((doc: any) => {
      sessions[doc.id] = {
        ...doc.data(),
        userId
      };
    });
  }
  
  return {
    uploads,
    buttonPresses: buttonPressesDoc.exists ? buttonPressesDoc.data() : {},
    geminiUsage: geminiUsageSnapshot.docs.map((doc: any) => doc.data()),
    sessions
  };
}

// ============ PROMPT MANAGEMENT ============

export interface PromptData {
  production: string;
  draft: string | null;
  useDraft: boolean;
  lastModified: string;
  modifiedBy?: string;
}

/**
 * Get a prompt's data from Firestore
 * Returns null if prompt doesn't exist in Firestore (will use file-based version)
 */
export async function getPromptData(promptId: string): Promise<PromptData | null> {
  const db = getAdminDb();
  
  try {
    const promptDoc = await db.collection('prompts').doc(promptId).get();
    
    if (!promptDoc.exists) {
      return null;
    }
    
    return promptDoc.data() as PromptData;
  } catch (error) {
    logger.error('Error fetching prompt data', { promptId }, error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Get all prompts with their draft/testing status
 */
export async function getAllPrompts(): Promise<Record<string, PromptData>> {
  const db = getAdminDb();
  
  try {
    const promptsSnapshot = await db.collection('prompts').get();
    const prompts: Record<string, PromptData> = {};
    
    promptsSnapshot.forEach((doc: any) => {
      prompts[doc.id] = doc.data() as PromptData;
    });
    
    return prompts;
  } catch (error) {
    logger.error('Error fetching all prompts', {}, error instanceof Error ? error : undefined);
    return {};
  }
}

/**
 * Save a draft version of a prompt (doesn't affect production)
 */
export async function savePromptDraft(promptId: string, draftContent: string, userId: string): Promise<void> {
  const db = getAdminDb();
  
  try {
    const promptRef = db.collection('prompts').doc(promptId);
    const promptDoc = await promptRef.get();
    
    const updateData: Partial<PromptData> = {
      draft: draftContent,
      lastModified: new Date().toISOString(),
      modifiedBy: userId,
    };
    
    if (promptDoc.exists) {
      await promptRef.update(updateData);
    } else {
      // First time saving this prompt - initialize with production version from file
      const { getPrompt } = await import('./prompts');
      await promptRef.set({
        production: getPrompt(promptId as any),
        draft: draftContent,
        useDraft: false,
        lastModified: new Date().toISOString(),
        modifiedBy: userId,
      });
    }
    
    logger.info('Prompt draft saved', { promptId, userId });
  } catch (error) {
    logger.error('Error saving prompt draft', { promptId, userId }, error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Activate draft mode (use draft instead of production)
 */
export async function activatePromptDraft(promptId: string): Promise<void> {
  const db = getAdminDb();
  
  try {
    await db.collection('prompts').doc(promptId).update({
      useDraft: true,
      lastModified: new Date().toISOString(),
    });
    
    logger.info('Prompt draft activated', { promptId });
  } catch (error) {
    logger.error('Error activating prompt draft', { promptId }, error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Deactivate draft mode (revert to production)
 */
export async function deactivatePromptDraft(promptId: string): Promise<void> {
  const db = getAdminDb();
  
  try {
    await db.collection('prompts').doc(promptId).update({
      useDraft: false,
      lastModified: new Date().toISOString(),
    });
    
    logger.info('Prompt draft deactivated', { promptId });
  } catch (error) {
    logger.error('Error deactivating prompt draft', { promptId }, error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Discard a draft (delete it from Firestore)
 */
export async function discardPromptDraft(promptId: string): Promise<void> {
  const db = getAdminDb();
  
  try {
    await db.collection('prompts').doc(promptId).update({
      draft: null,
      useDraft: false,
      lastModified: new Date().toISOString(),
    });
    
    logger.info('Prompt draft discarded', { promptId });
  } catch (error) {
    logger.error('Error discarding prompt draft', { promptId }, error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Update production prompt (this is done after git commit)
 */
export async function updateProductionPrompt(promptId: string, newContent: string): Promise<void> {
  const db = getAdminDb();
  
  try {
    const promptRef = db.collection('prompts').doc(promptId);
    const promptDoc = await promptRef.get();
    
    const updateData: Partial<PromptData> = {
      production: newContent,
      draft: null, // Clear draft after promoting to production
      useDraft: false,
      lastModified: new Date().toISOString(),
    };
    
    if (promptDoc.exists) {
      await promptRef.update(updateData);
    } else {
      await promptRef.set({
        ...updateData,
        production: newContent,
        draft: null,
        useDraft: false,
        lastModified: new Date().toISOString(),
      } as PromptData);
    }
    
    logger.info('Production prompt updated', { promptId });
  } catch (error) {
    logger.error('Error updating production prompt', { promptId }, error instanceof Error ? error : undefined);
    throw error;
  }
}
