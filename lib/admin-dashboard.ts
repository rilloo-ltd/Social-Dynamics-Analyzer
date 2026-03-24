import 'server-only';

import {
  AdminAnalysisIssueSummary,
  AdminAiEndpointPerformance,
  AdminAiOpsSummary,
  AdminAlert,
  AdminBreakdownItem,
  AdminDashboardFilters,
  AdminDashboardSnapshot,
  AdminFeedbackEntry,
  AdminFeedbackSummary,
  AdminLogEntry,
  AdminOverviewMetrics,
  AdminPromptDetail,
  AdminPromptStatus,
  AdminRangePreset,
  AdminRevenueSummary,
  AdminSessionSummary,
  AdminTimeSeriesPoint,
  AdminTransactionEntry,
  AdminUploadEntry,
  AdminUsageSummary,
  AdminUserDetailSnapshot,
  AdminUserRow,
  AnalysisDepthMode,
  UserTier,
} from '@/types';
import {
  activatePromptDraft,
  createGlobalReferralCode,
  deactivatePromptDraft,
  discardPromptDraft,
  estimateGeminiCostUsd,
  getAdminDb,
  getAllPrompts,
  getPromptData,
  resetDailyUploadLimit,
  savePromptDraft,
  updateProductionPrompt,
  updateUserTier,
} from './firestore-admin';
import { logger } from './logger';
import { getPrompt, getPromptKeys, PROMPT_METADATA, type PromptKey } from './prompts';
import { getFileFromGitHub, commitFileToGitHub, replacePromptInSource } from './github';
import { normalizeEmail } from './admin-identity';

type AnyRecord = Record<string, any>;

const DEFAULT_PRESET: AdminRangePreset = '30d';
const LOW_RATING_THRESHOLD = 4;
const POSITIVE_RATING_THRESHOLD = 8;
const STUCK_ANALYSIS_THRESHOLD_MS = 20 * 60 * 1000;
const MONTHLY_TIER_PRICE_USD: Record<'basic' | 'super', number> = {
  basic: 5,
  super: 30,
};

interface DateRange {
  start: Date;
  end: Date;
  filters: AdminDashboardFilters;
}

interface CollectionGroupItem<T = AnyRecord> {
  id: string;
  userId: string | null;
  data: T;
}

interface TopLevelCollectionItem<T = AnyRecord> {
  id: string;
  data: T;
}

interface DashboardUserDoc {
  id: string;
  data: AnyRecord;
}

interface DashboardCollections {
  users: DashboardUserDoc[];
  uploads: Array<CollectionGroupItem<AnyRecord>>;
  sessions: Array<CollectionGroupItem<AnyRecord>>;
  transactions: Array<CollectionGroupItem<AnyRecord>>;
  dailyStats: Array<CollectionGroupItem<AnyRecord>>;
  geminiUsage: Array<TopLevelCollectionItem<AnyRecord>>;
  analyticsEvents: Array<TopLevelCollectionItem<AnyRecord>>;
  buttonPresses: Record<string, number>;
  referralCodes: Array<TopLevelCollectionItem<AnyRecord>>;
  adminAuditLog: Array<TopLevelCollectionItem<AnyRecord>>;
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeDate(value: unknown): Date | null {
  const stringValue = safeString(value);
  if (!stringValue) {
    return null;
  }

  const parsed = new Date(stringValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTimestamp(value: unknown): string | null {
  return safeDate(value)?.toISOString() || null;
}

function normalizeTier(value: unknown): UserTier {
  if (value === 'basic' || value === 'super') {
    return value;
  }

  return 'free';
}

function normalizeAnalysisMode(value: unknown): AnalysisDepthMode | null {
  return value === 'deep' || value === 'standard' ? value : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function sum(values: number[]): number {
  return values.reduce((runningTotal, value) => runningTotal + value, 0);
}

function getRange(filters?: AdminDashboardFilters): DateRange {
  const normalizedFilters: AdminDashboardFilters = {
    preset: filters?.preset || DEFAULT_PRESET,
    startDate: filters?.startDate,
    endDate: filters?.endDate,
    tier: filters?.tier || 'all',
    analysisType: filters?.analysisType || 'all',
    analysisMode: filters?.analysisMode || 'all',
    model: filters?.model || 'all',
  };

  const end = normalizedFilters.endDate ? new Date(normalizedFilters.endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  let start = normalizedFilters.startDate ? new Date(normalizedFilters.startDate) : new Date(end);

  if (!normalizedFilters.startDate) {
    switch (normalizedFilters.preset) {
      case '24h':
        start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        start.setDate(end.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case '90d':
        start.setDate(end.getDate() - 89);
        start.setHours(0, 0, 0, 0);
        break;
      case 'custom':
      case '30d':
      default:
        start.setDate(end.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        break;
    }
  } else {
    start.setHours(0, 0, 0, 0);
  }

  return { start, end, filters: normalizedFilters };
}

function isInRange(timestamp: string | null, range: DateRange): boolean {
  if (!timestamp) {
    return false;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed >= range.start && parsed <= range.end;
}

function createDailySeries(range: DateRange): AdminTimeSeriesPoint[] {
  const points: AdminTimeSeriesPoint[] = [];
  const cursor = new Date(range.start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= range.end) {
    const isoDate = cursor.toISOString().split('T')[0];
    points.push({
      date: isoDate,
      label: isoDate,
      uploads: 0,
      activeUsers: 0,
      analysesStarted: 0,
      analysesCompleted: 0,
      analysesFailed: 0,
      geminiCostUsd: 0,
      flashCostUsd: 0,
      proCostUsd: 0,
      feedbackCount: 0,
      averageFeedbackRating: null,
      subscriptionActivated: 0,
      subscriptionCancelled: 0,
      subscriptionRenewed: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
}

function addBreakdown(target: Map<string, number>, label: string | null | undefined, increment = 1) {
  const safeLabel = label && String(label).trim() ? String(label).trim() : 'Unknown';
  target.set(safeLabel, (target.get(safeLabel) || 0) + increment);
}

function mapToBreakdownItems(source: Map<string, number>): AdminBreakdownItem[] {
  return Array.from(source.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function buildAnalysisIssueSummary(
  filteredAnalyticsEvents: Array<TopLevelCollectionItem<AnyRecord>>,
  rangeEnd: Date
): AdminAnalysisIssueSummary {
  const issueByAnalysisType = new Map<string, number>();
  const issueByEndpoint = new Map<string, number>();
  const affectedUsers = new Set<string>();
  const recentIssues: AdminLogEntry[] = [];
  const buckets = new Map<string, Array<TopLevelCollectionItem<AnyRecord>>>();

  filteredAnalyticsEvents
    .filter((event: TopLevelCollectionItem<AnyRecord>) => event.data.category === 'analysis')
    .forEach((event: TopLevelCollectionItem<AnyRecord>) => {
      const bucketKey = [
        safeString(event.data.userId) || 'anonymous',
        safeString(event.data.sessionId) || 'no-session',
        safeString(event.data.analysisType) || 'unknown',
        safeString(event.data.endpoint) || 'unknown',
      ].join('|');

      const bucket = buckets.get(bucketKey) || [];
      bucket.push(event);
      buckets.set(bucketKey, bucket);
    });

  const registerIssue = (event: TopLevelCollectionItem<AnyRecord>, issueKind: 'failed' | 'stuck') => {
    const analysisType = safeString(event.data.analysisType) || 'unknown';
    const endpoint = safeString(event.data.endpoint) || 'unknown';
    const userId = safeString(event.data.userId);
    const timestamp = getTimestamp(event.data.timestamp) || new Date(0).toISOString();

    addBreakdown(issueByAnalysisType, analysisType);
    addBreakdown(issueByEndpoint, endpoint);
    if (userId) {
      affectedUsers.add(userId);
    }

    recentIssues.push({
      id: `${event.id}-${issueKind}`,
      timestamp,
      category: 'analysis',
      level: issueKind === 'failed' ? 'error' : 'warning',
      message: issueKind === 'failed'
        ? String(event.data.message || 'Analysis request failed before completion')
        : 'Analysis request likely got stuck before completion',
      userId,
      email: normalizeEmail(event.data.userEmail) || null,
      eventName: issueKind === 'failed'
        ? safeString(event.data.eventName) || 'analysis_failed'
        : 'analysis_stuck',
      details: {
        ...(event.data.metadata || {}),
        issueKind,
        analysisType,
        endpoint,
        sessionId: safeString(event.data.sessionId),
        status: safeString(event.data.status),
      },
    });
  };

  let failedCount = 0;
  let stuckCount = 0;

  buckets.forEach((bucketEvents: Array<TopLevelCollectionItem<AnyRecord>>) => {
    const orderedEvents = [...bucketEvents].sort((a, b) => {
      const left = getTimestamp(a.data.timestamp) || '';
      const right = getTimestamp(b.data.timestamp) || '';
      return left.localeCompare(right) || a.id.localeCompare(b.id);
    });

    const openStarts: Array<TopLevelCollectionItem<AnyRecord>> = [];

    orderedEvents.forEach((event: TopLevelCollectionItem<AnyRecord>) => {
      const status = safeString(event.data.status);

      if (status === 'started') {
        openStarts.push(event);
        return;
      }

      if (status === 'completed') {
        if (openStarts.length > 0) {
          openStarts.shift();
        }
        return;
      }

      if (status === 'failed') {
        failedCount += 1;
        if (openStarts.length > 0) {
          openStarts.shift();
        }
        registerIssue(event, 'failed');
      }
    });

    openStarts.forEach((startEvent: TopLevelCollectionItem<AnyRecord>) => {
      const startedAt = safeDate(startEvent.data.timestamp)?.getTime();
      if (!startedAt) {
        return;
      }

      if (rangeEnd.getTime() - startedAt < STUCK_ANALYSIS_THRESHOLD_MS) {
        return;
      }

      stuckCount += 1;
      registerIssue(startEvent, 'stuck');
    });
  });

  return {
    totalUnsuccessfulCount: failedCount + stuckCount,
    failedCount,
    stuckCount,
    affectedUsers: affectedUsers.size,
    issueByAnalysisType: mapToBreakdownItems(issueByAnalysisType),
    issueByEndpoint: mapToBreakdownItems(issueByEndpoint),
    recentIssues: recentIssues
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 10),
  };
}

async function getCollectionGroupItems<T = AnyRecord>(collectionName: string): Promise<Array<CollectionGroupItem<T>>> {
  const db = getAdminDb();

  try {
    const snapshot = await db.collectionGroup(collectionName).get();
    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      userId: doc.ref.parent?.parent?.id || null,
      data: doc.data() as T,
    }));
  } catch (error) {
    logger.warning('Failed to fetch collection group for admin dashboard', { collectionName }, error);
    return [];
  }
}

async function getTopLevelCollectionItems<T = AnyRecord>(collectionName: string): Promise<Array<TopLevelCollectionItem<T>>> {
  try {
    const snapshot = await getAdminDb().collection(collectionName).get();
    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      data: doc.data() as T,
    }));
  } catch (error) {
    logger.warning('Failed to fetch top-level collection for admin dashboard', { collectionName }, error);
    return [];
  }
}

async function getButtonPresses(): Promise<Record<string, number>> {
  try {
    const buttonDoc = await getAdminDb().collection('globalStats').doc('buttonPresses').get();
    return buttonDoc.exists ? buttonDoc.data() || {} : {};
  } catch (error) {
    logger.warning('Failed to load button presses for admin dashboard', {}, error);
    return {};
  }
}

function buildPromptStatus(detail: AdminPromptDetail): AdminPromptStatus {
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    status: detail.useDraft ? 'testing' : detail.draft ? 'draft' : 'production',
    hasDraft: Boolean(detail.draft),
    useDraft: detail.useDraft,
    lastModified: detail.lastModified,
    modifiedBy: detail.modifiedBy,
  };
}

export async function getAdminPromptDetails(): Promise<AdminPromptDetail[]> {
  const promptIds = getPromptKeys();
  const firestorePrompts = await getAllPrompts();

  return promptIds.map((id) => {
    const metadata = PROMPT_METADATA[id];
    const firestoreData = firestorePrompts[id];

    return {
      id,
      name: metadata.name,
      description: metadata.description,
      production: firestoreData?.production || getPrompt(id),
      draft: firestoreData?.draft || null,
      useDraft: firestoreData?.useDraft || false,
      lastModified: firestoreData?.lastModified || null,
      modifiedBy: firestoreData?.modifiedBy,
      status: firestoreData?.useDraft ? 'testing' : firestoreData?.draft ? 'draft' : 'production',
      hasDraft: Boolean(firestoreData?.draft),
    };
  });
}

export async function getAdminPromptStatuses(): Promise<AdminPromptStatus[]> {
  const promptDetails = await getAdminPromptDetails();
  return promptDetails.map(buildPromptStatus);
}

function validatePromptId(promptId: string): PromptKey {
  const validPromptIds = getPromptKeys();

  if (!validPromptIds.includes(promptId as PromptKey)) {
    throw new Error('Invalid prompt ID');
  }

  return promptId as PromptKey;
}

export async function saveAdminPromptDraft(promptId: string, draftContent: string, modifiedBy: string) {
  const validPromptId = validatePromptId(promptId);
  if (!draftContent || !draftContent.trim()) {
    throw new Error('Prompt content cannot be empty');
  }

  await savePromptDraft(validPromptId, draftContent, modifiedBy);
}

export async function activateAdminPromptDraft(promptId: string) {
  const validPromptId = validatePromptId(promptId);
  const promptData = await getPromptData(validPromptId);

  if (!promptData?.draft) {
    throw new Error('No draft exists for this prompt');
  }

  await activatePromptDraft(validPromptId);
}

export async function deactivateAdminPromptDraft(promptId: string) {
  await deactivatePromptDraft(validatePromptId(promptId));
}

export async function discardAdminPromptDraft(promptId: string) {
  await discardPromptDraft(validatePromptId(promptId));
}

export async function commitAdminPrompt(promptId: string, commitMessage?: string) {
  const validPromptId = validatePromptId(promptId);
  const promptData = await getPromptData(validPromptId);

  if (!promptData?.draft) {
    throw new Error('No draft exists to commit');
  }

  await updateProductionPrompt(validPromptId, promptData.draft);

  const { content: currentSource, sha: currentSha } = await getFileFromGitHub('lib/prompts.ts');
  const updatedSource = replacePromptInSource(currentSource, validPromptId, promptData.draft);

  return commitFileToGitHub(
    'lib/prompts.ts',
    updatedSource,
    currentSha,
    commitMessage || `chore: update prompt "${validPromptId}" via admin panel`
  );
}

function buildFeedbackEntry(
  id: string,
  userId: string,
  userEmail: string | null,
  sessionId: string | null,
  source: 'feedbackEntries' | 'legacySession',
  rawFeedback: AnyRecord
): AdminFeedbackEntry | null {
  const timestamp = getTimestamp(rawFeedback.timestamp);
  if (!timestamp) {
    return null;
  }

  const rating = Math.max(1, Math.min(10, Math.round(Number(rawFeedback.rating) || 0)));

  return {
    id,
    userId,
    userEmail,
    sessionId,
    timestamp,
    rating,
    comment: String(rawFeedback.comment || ''),
    hasComment: Boolean(String(rawFeedback.comment || '').trim()),
    analysisType: safeString(rawFeedback.analysisType),
    analysisMode: normalizeAnalysisMode(rawFeedback.analysisMode),
    tier: rawFeedback.tier || null,
    chatCode: safeString(rawFeedback.chatCode),
    source,
  };
}

async function loadFeedbackEntriesWithFallback(usersById: Map<string, AnyRecord>): Promise<AdminFeedbackEntry[]> {
  const db = getAdminDb();
  const normalizedEntries = new Map<string, AdminFeedbackEntry>();

  try {
    const feedbackSnapshot = await db.collection('feedbackEntries').get();
    feedbackSnapshot.forEach((doc: any) => {
      const data = doc.data();
      const entry = buildFeedbackEntry(
        doc.id,
        data.userId,
        normalizeEmail(data.userEmail) || normalizeEmail(usersById.get(data.userId)?.email) || null,
        safeString(data.sessionId),
        'feedbackEntries',
        data
      );

      if (!entry) {
        return;
      }

      const dedupeKey = `${entry.userId}|${entry.sessionId}|${entry.timestamp}|${entry.rating}`;
      normalizedEntries.set(dedupeKey, entry);
    });
  } catch (error) {
    logger.warning('Failed to load normalized feedback entries', {}, error);
  }

  const sessionItems = await getCollectionGroupItems('sessions');
  sessionItems.forEach((sessionItem) => {
    const feedback = sessionItem.data?.feedback;
    if (!feedback || !sessionItem.userId) {
      return;
    }

    const entry = buildFeedbackEntry(
      `legacy-${sessionItem.userId}-${sessionItem.id}`,
      sessionItem.userId,
      normalizeEmail(usersById.get(sessionItem.userId)?.email) || null,
      sessionItem.id,
      'legacySession',
      feedback
    );

    if (!entry) {
      return;
    }

    const dedupeKey = `${entry.userId}|${entry.sessionId}|${entry.timestamp}|${entry.rating}`;
    if (!normalizedEntries.has(dedupeKey)) {
      normalizedEntries.set(dedupeKey, entry);
    }
  });

  return Array.from(normalizedEntries.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

async function batchFetchAuthEmails(uids: string[]): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();

  if (!uids.length) return emailMap;

  try {
    const admin = require('firebase-admin');

    if (!admin.apps.length) getAdminDb();

    const auth = admin.auth();
    // getUsers accepts up to 100 identifiers at a time
    const chunks: string[][] = [];

    for (let i = 0; i < uids.length; i += 100) {
      chunks.push(uids.slice(i, i + 100));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const result = await auth.getUsers(chunk.map((uid: string) => ({ uid })));

        for (const userRecord of result.users) {
          if (userRecord.email) {
            emailMap.set(userRecord.uid, normalizeEmail(userRecord.email));
          }
        }
      }),
    );
  } catch (error) {
    logger.warning('Error batch-fetching auth emails', {}, error instanceof Error ? error : undefined);
  }

  return emailMap;
}

async function loadDashboardCollections(): Promise<DashboardCollections> {
  const db = getAdminDb();
  const [usersSnapshot, uploads, sessions, transactions, dailyStats, geminiUsage, analyticsEvents, buttonPresses, referralCodes, adminAuditLog] = await Promise.all([
    db.collection('users').get(),
    getCollectionGroupItems('uploads'),
    getCollectionGroupItems('sessions'),
    getCollectionGroupItems('transactions'),
    getCollectionGroupItems('dailyStats'),
    getTopLevelCollectionItems('geminiUsage'),
    getTopLevelCollectionItems('analyticsEvents'),
    getButtonPresses(),
    getTopLevelCollectionItems('referralCodes'),
    db.collection('adminAuditLog').orderBy('timestamp', 'desc').limit(100).get()
      .then((snapshot: any): Array<TopLevelCollectionItem<AnyRecord>> => snapshot.docs.map((doc: any) => ({ id: doc.id, data: doc.data() as AnyRecord })))
      .catch((): Array<TopLevelCollectionItem<AnyRecord>> => []),
  ]);

  // Enrich users missing an email field by fetching from Firebase Auth
  const allUserDocs: DashboardUserDoc[] = usersSnapshot.docs.map((doc: any) => ({ id: doc.id, data: doc.data() as AnyRecord }));
  const missingEmailUids = allUserDocs.filter((u: DashboardUserDoc) => !u.data.email).map((u: DashboardUserDoc) => u.id);
  const authEmailMap = await batchFetchAuthEmails(missingEmailUids);

  const users: DashboardUserDoc[] = allUserDocs.map((u: DashboardUserDoc) => ({
    id: u.id,
    data: authEmailMap.has(u.id) ? { ...u.data, email: authEmailMap.get(u.id) } : u.data,
  }));

  return {
    users,
    uploads,
    sessions,
    transactions,
    dailyStats,
    geminiUsage,
    analyticsEvents,
    buttonPresses,
    referralCodes,
    adminAuditLog,
  };
}

function getLatestTimestamp(values: Array<string | null>): string | null {
  return values.filter(Boolean).sort().at(-1) || null;
}

function getUserRows(
  users: DashboardUserDoc[],
  uploads: Array<CollectionGroupItem<AnyRecord>>,
  sessions: Array<CollectionGroupItem<AnyRecord>>,
  dailyStats: Array<CollectionGroupItem<AnyRecord>>,
  feedbackEntries: AdminFeedbackEntry[],
): AdminUserRow[] {
  const todayKey = new Date().toISOString().split('T')[0];

  return users.map((user) => {
    const userUploads = uploads.filter((item) => item.userId === user.id);
    const userSessions = sessions.filter((item) => item.userId === user.id);
    const userDailyStats = dailyStats.find((item) => item.userId === user.id && item.id === todayKey);
    const latestFeedback = feedbackEntries.find((entry) => entry.userId === user.id) || null;

    return {
      userId: user.id,
      email: normalizeEmail(user.data.email) || null,
      tier: normalizeTier(user.data.tier),
      maxDailyUploads: Number(user.data.maxDailyUploads || 3),
      uploadsToday: Number(userDailyStats?.data?.uploadCount || 0),
      totalUploads: userUploads.length,
      lastActivity: getLatestTimestamp([
        getTimestamp(user.data.updatedAt),
        getTimestamp(user.data.createdAt),
        ...userUploads.map((item) => getTimestamp(item.data.timestamp)),
        ...userSessions.map((item) => getTimestamp(item.data.createdAt)),
        latestFeedback?.timestamp || null,
      ]),
      subscriptionStatus: safeString(user.data.subscriptionStatus),
      nextBillingDate: getTimestamp(user.data.nextBillingDate),
      lastFeedbackRating: latestFeedback?.rating || null,
      createdAt: getTimestamp(user.data.createdAt),
    };
  }).sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || '') || (a.email || '').localeCompare(b.email || ''));
}

export async function getAdminUsers(options?: {
  query?: string;
  tier?: UserTier | 'all';
  subscriptionStatus?: string | 'all';
}): Promise<AdminUserRow[]> {
  const { users, uploads, sessions, dailyStats } = await loadDashboardCollections();
  const usersById = new Map<string, AnyRecord>(users.map((user: DashboardUserDoc) => [user.id, user.data]));
  const feedbackEntries = await loadFeedbackEntriesWithFallback(usersById);
  const rows = getUserRows(users, uploads, sessions, dailyStats, feedbackEntries);
  const normalizedQuery = normalizeEmail(options?.query || '').replace(/\s+/g, '');

  return rows.filter((row) => {
    const tierMatches = !options?.tier || options.tier === 'all' || row.tier === options.tier;
    const subscriptionMatches =
      !options?.subscriptionStatus ||
      options.subscriptionStatus === 'all' ||
      (row.subscriptionStatus || 'none') === options.subscriptionStatus;
    const queryMatches =
      !normalizedQuery ||
      normalizeEmail(row.email).includes(normalizedQuery) ||
      row.userId.toLowerCase().includes(normalizedQuery);

    return tierMatches && subscriptionMatches && queryMatches;
  });
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetailSnapshot | null> {
  const { users, uploads, sessions, transactions, dailyStats, referralCodes } = await loadDashboardCollections();
  const usersById = new Map<string, AnyRecord>(users.map((user: DashboardUserDoc) => [user.id, user.data]));
  const feedbackEntries = await loadFeedbackEntriesWithFallback(usersById);
  const userRows = getUserRows(users, uploads, sessions, dailyStats, feedbackEntries);
  const row = userRows.find((item) => item.userId === userId);
  const userDoc = users.find((item: DashboardUserDoc) => item.id === userId);

  if (!row || !userDoc) {
    return null;
  }

  const userUploads: AdminUploadEntry[] = uploads
    .filter((item) => item.userId === userId)
    .map((item) => ({
      id: item.id,
      timestamp: getTimestamp(item.data.timestamp) || new Date(0).toISOString(),
      participantsCount: Number(item.data.participantsCount || 0),
      tokensCount: Number(item.data.tokensCount || 0),
      sessionId: safeString(item.id),
    }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const userSessions: AdminSessionSummary[] = sessions
    .filter((item) => item.userId === userId)
    .map((item) => ({
      sessionId: item.id,
      createdAt: getTimestamp(item.data.createdAt),
      sharesCount: Array.isArray(item.data.shares) ? item.data.shares.length : 0,
      imagesCount: Array.isArray(item.data.images) ? item.data.images.length : 0,
      hasFeedback: Boolean(item.data.feedback),
      feedbackRating: item.data.feedback ? Number(item.data.feedback.rating || 0) : null,
      feedbackComment: item.data.feedback ? String(item.data.feedback.comment || '') : '',
      analysisType: safeString(item.data.feedback?.analysisType),
      analysisMode: normalizeAnalysisMode(item.data.feedback?.analysisMode),
      chatCode: safeString(item.data.feedback?.chatCode),
    }))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const userTransactions: AdminTransactionEntry[] = transactions
    .filter((item) => item.userId === userId)
    .map((item) => ({
      id: item.id,
      timestamp: getTimestamp(item.data.timestamp),
      type: String(item.data.type || 'unknown'),
      amount: typeof item.data.amount === 'number' ? item.data.amount : null,
      currency: safeString(item.data.currency),
      status: safeString(item.data.status),
      subscriptionId: safeString(item.data.subscriptionId),
      tier: safeString(item.data.tier),
    }))
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const userFeedback = feedbackEntries.filter((entry) => entry.userId === userId);

  return {
    user: {
      ...row,
      subscriptionId: safeString(userDoc.data.subscriptionId),
      subscriptionPlanId: safeString(userDoc.data.subscriptionPlanId),
      subscriptionStartDate: getTimestamp(userDoc.data.subscriptionStartDate),
      referralCodesCount: referralCodes.filter((entry) => entry.data.generatedBy === userId).length,
    },
    uploads: userUploads,
    sessions: userSessions,
    transactions: userTransactions,
    feedback: userFeedback,
  };
}

export async function getAdminFeedbackData(options?: {
  filters?: AdminDashboardFilters;
  query?: string;
  commentOnly?: boolean;
  rating?: number | null;
  tier?: UserTier | 'all';
  analysisType?: string | 'all';
}): Promise<{ summary: AdminFeedbackSummary; entries: AdminFeedbackEntry[] }> {
  const range = getRange(options?.filters);
  const { users } = await loadDashboardCollections();
  const usersById = new Map<string, AnyRecord>(users.map((user: DashboardUserDoc) => [user.id, user.data]));
  const allEntries = await loadFeedbackEntriesWithFallback(usersById);
  const normalizedQuery = (options?.query || '').trim().toLowerCase();

  const filteredEntries = allEntries.filter((entry) => {
    const inRange = isInRange(entry.timestamp, range);
    const commentMatches = !options?.commentOnly || entry.hasComment;
    const ratingMatches = !options?.rating || entry.rating === options.rating;
    const tierMatches = !options?.tier || options.tier === 'all' || entry.tier === options.tier;
    const analysisMatches = !options?.analysisType || options.analysisType === 'all' || entry.analysisType === options.analysisType;
    const queryMatches =
      !normalizedQuery ||
      entry.comment.toLowerCase().includes(normalizedQuery) ||
      normalizeEmail(entry.userEmail).includes(normalizedQuery) ||
      entry.userId.toLowerCase().includes(normalizedQuery);

    return inRange && commentMatches && ratingMatches && tierMatches && analysisMatches && queryMatches;
  });

  const summary: AdminFeedbackSummary = {
    totalFeedback: filteredEntries.length,
    averageRating: average(filteredEntries.map((entry) => entry.rating)),
    withCommentCount: filteredEntries.filter((entry) => entry.hasComment).length,
    lowRatingCount: filteredEntries.filter((entry) => entry.rating <= LOW_RATING_THRESHOLD).length,
    positiveRatingCount: filteredEntries.filter((entry) => entry.rating >= POSITIVE_RATING_THRESHOLD).length,
    recentLowRatings: filteredEntries.filter((entry) => entry.rating <= LOW_RATING_THRESHOLD).slice(0, 10),
    recentDetailedComments: filteredEntries.filter((entry) => entry.hasComment).slice(0, 10),
    recentHighRatingsWithComments: filteredEntries.filter((entry) => entry.rating >= POSITIVE_RATING_THRESHOLD && entry.hasComment).slice(0, 10),
  };

  return { summary, entries: filteredEntries };
}

export async function getAdminLogs(limit = 50): Promise<AdminLogEntry[]> {
  const db = getAdminDb();

  const [analyticsEvents, auditEntries] = await Promise.all([
    db.collection('analyticsEvents').orderBy('timestamp', 'desc').limit(limit).get()
      .then((snapshot: any): Array<TopLevelCollectionItem<AnyRecord>> => snapshot.docs.map((doc: any) => ({ id: doc.id, data: doc.data() as AnyRecord })))
      .catch((): Array<TopLevelCollectionItem<AnyRecord>> => []),
    db.collection('adminAuditLog').orderBy('timestamp', 'desc').limit(limit).get()
      .then((snapshot: any): Array<TopLevelCollectionItem<AnyRecord>> => snapshot.docs.map((doc: any) => ({ id: doc.id, data: doc.data() as AnyRecord })))
      .catch((): Array<TopLevelCollectionItem<AnyRecord>> => []),
  ]);

  const analyticsLogs: AdminLogEntry[] = analyticsEvents.map((event: TopLevelCollectionItem<AnyRecord>) => ({
    id: event.id,
    timestamp: getTimestamp(event.data.timestamp) || new Date(0).toISOString(),
    category: String(event.data.category || 'system'),
    level: event.data.level === 'warning' ? 'warning' : event.data.level === 'error' || event.data.status === 'failed' ? 'error' : 'info',
    message: String(event.data.message || event.data.eventName || 'System event'),
    userId: safeString(event.data.userId),
    email: normalizeEmail(event.data.userEmail) || null,
    eventName: safeString(event.data.eventName),
    details: event.data.metadata || {},
  }));

  const auditLogs: AdminLogEntry[] = auditEntries.map((entry: TopLevelCollectionItem<AnyRecord>) => ({
    id: entry.id,
    timestamp: getTimestamp(entry.data.timestamp) || new Date(0).toISOString(),
    category: 'admin_audit',
    level: 'info',
    message: `Admin action: ${entry.data.action || 'unknown'}`,
    userId: safeString(entry.data.actorUserId),
    email: normalizeEmail(entry.data.actorEmail) || null,
    eventName: safeString(entry.data.action),
    details: entry.data.details || {},
  }));

  return [...analyticsLogs, ...auditLogs]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export async function getAdminDashboardSnapshot(filters?: AdminDashboardFilters): Promise<AdminDashboardSnapshot> {
  const range = getRange(filters);
  const {
    users,
    uploads,
    sessions,
    transactions,
    dailyStats,
    geminiUsage,
    analyticsEvents,
    buttonPresses,
    referralCodes,
    adminAuditLog,
  } = await loadDashboardCollections();
  const usersById = new Map<string, AnyRecord>(users.map((user: DashboardUserDoc) => [user.id, user.data]));
  const feedbackEntries = await loadFeedbackEntriesWithFallback(usersById);
  const promptStatuses = await getAdminPromptStatuses();

  const userRows = getUserRows(users, uploads, sessions, dailyStats, feedbackEntries);
  const filteredUsers = userRows.filter((row) => {
    const tierMatches = range.filters.tier === 'all' || !range.filters.tier || row.tier === range.filters.tier;
    return tierMatches;
  });

  const filteredUploads = uploads.filter((item) => {
    const userTier = normalizeTier(usersById.get(item.userId || '')?.tier);
    const tierMatches = range.filters.tier === 'all' || !range.filters.tier || userTier === range.filters.tier;
    return tierMatches && isInRange(getTimestamp(item.data.timestamp), range);
  });

  const filteredTransactions = transactions.filter((item) => isInRange(getTimestamp(item.data.timestamp), range));
  const filteredFeedback = feedbackEntries.filter((entry) => {
    const tierMatches = range.filters.tier === 'all' || !range.filters.tier || entry.tier === range.filters.tier;
    const analysisMatches = range.filters.analysisType === 'all' || !range.filters.analysisType || entry.analysisType === range.filters.analysisType;
    const modeMatches = range.filters.analysisMode === 'all' || !range.filters.analysisMode || entry.analysisMode === range.filters.analysisMode;
    return tierMatches && analysisMatches && modeMatches && isInRange(entry.timestamp, range);
  });

  const filteredAnalyticsEvents = analyticsEvents.filter((event) => {
    const timestamp = getTimestamp(event.data.timestamp);
    const tierMatches = range.filters.tier === 'all' || !range.filters.tier || event.data.tier === range.filters.tier;
    const analysisMatches = range.filters.analysisType === 'all' || !range.filters.analysisType || event.data.analysisType === range.filters.analysisType;
    const modeMatches = range.filters.analysisMode === 'all' || !range.filters.analysisMode || event.data.analysisMode === range.filters.analysisMode;
    const modelMatches = range.filters.model === 'all' || !range.filters.model || event.data.model === range.filters.model;
    return tierMatches && analysisMatches && modeMatches && modelMatches && isInRange(timestamp, range);
  });

  const filteredGeminiUsage = geminiUsage.filter((entry) => {
    const timestamp = getTimestamp(entry.data.timestamp);
    const modelMatches = range.filters.model === 'all' || !range.filters.model || entry.data.model === range.filters.model;
    return modelMatches && isInRange(timestamp, range);
  });

  const timeSeries = createDailySeries(range);
  const timeSeriesByDate = new Map(timeSeries.map((point) => [point.date, point]));
  const activeUsersByDate = new Map<string, Set<string>>();
  const feedbackRatingsByDate = new Map<string, number[]>();

  filteredUploads.forEach((upload) => {
    const date = getTimestamp(upload.data.timestamp)?.split('T')[0];
    if (!date || !timeSeriesByDate.has(date)) {
      return;
    }

    timeSeriesByDate.get(date)!.uploads += 1;
    const activeUsers = activeUsersByDate.get(date) || new Set<string>();
    if (upload.userId) activeUsers.add(upload.userId);
    activeUsersByDate.set(date, activeUsers);
  });

  filteredAnalyticsEvents.forEach((event) => {
    const timestamp = getTimestamp(event.data.timestamp);
    const date = timestamp?.split('T')[0];
    if (!date || !timeSeriesByDate.has(date)) {
      return;
    }

    const point = timeSeriesByDate.get(date)!;
    if (event.data.category === 'analysis') {
      if (event.data.status === 'started') point.analysesStarted += 1;
      if (event.data.status === 'completed') point.analysesCompleted += 1;
      if (event.data.status === 'failed') point.analysesFailed += 1;
    }

    if (event.data.userId) {
      const activeUsers = activeUsersByDate.get(date) || new Set<string>();
      activeUsers.add(event.data.userId);
      activeUsersByDate.set(date, activeUsers);
    }
  });

  filteredGeminiUsage.forEach((usage) => {
    const timestamp = getTimestamp(usage.data.timestamp);
    const date = timestamp?.split('T')[0];
    if (!date || !timeSeriesByDate.has(date)) {
      return;
    }

    const point = timeSeriesByDate.get(date)!;
    const cost = typeof usage.data.estimatedCostUsd === 'number'
      ? usage.data.estimatedCostUsd
      : estimateGeminiCostUsd(String(usage.data.model || ''), Number(usage.data.inputTokens || 0), Number(usage.data.outputTokens || 0)) || 0;
    point.geminiCostUsd += cost;

    const model = String(usage.data.model || '');
    if (model.includes('flash')) point.flashCostUsd += cost;
    if (model.includes('pro')) point.proCostUsd += cost;
  });

  filteredFeedback.forEach((entry) => {
    const date = entry.timestamp.split('T')[0];
    if (!timeSeriesByDate.has(date)) {
      return;
    }

    const point = timeSeriesByDate.get(date)!;
    point.feedbackCount += 1;
    const existingRatings = feedbackRatingsByDate.get(date) || [];
    existingRatings.push(entry.rating);
    feedbackRatingsByDate.set(date, existingRatings);

    const activeUsers = activeUsersByDate.get(date) || new Set<string>();
    activeUsers.add(entry.userId);
    activeUsersByDate.set(date, activeUsers);
  });

  filteredTransactions.forEach((transaction) => {
    const date = getTimestamp(transaction.data.timestamp)?.split('T')[0];
    if (!date || !timeSeriesByDate.has(date)) {
      return;
    }

    const point = timeSeriesByDate.get(date)!;
    if (transaction.data.type === 'subscription_activated') point.subscriptionActivated += 1;
    if (transaction.data.type === 'subscription_cancelled') point.subscriptionCancelled += 1;
    if (transaction.data.type === 'subscription_payment') point.subscriptionRenewed += 1;
  });

  timeSeries.forEach((point) => {
    point.activeUsers = activeUsersByDate.get(point.date)?.size || 0;
    point.averageFeedbackRating = average(feedbackRatingsByDate.get(point.date) || []);
    point.geminiCostUsd = Math.round(point.geminiCostUsd * 10000) / 10000;
    point.flashCostUsd = Math.round(point.flashCostUsd * 10000) / 10000;
    point.proCostUsd = Math.round(point.proCostUsd * 10000) / 10000;
  });

  const completedAnalysisEvents = filteredAnalyticsEvents.filter((event) => event.data.category === 'analysis' && event.data.status === 'completed');
  const startedAnalysisEvents = filteredAnalyticsEvents.filter((event) => event.data.category === 'analysis' && event.data.status === 'started');
  const failedAnalysisEvents = filteredAnalyticsEvents.filter((event) => event.data.category === 'analysis' && event.data.status === 'failed');
  const analysisIssues = buildAnalysisIssueSummary(filteredAnalyticsEvents, range.end);
  const totalGeminiCost = filteredGeminiUsage.reduce((runningTotal, usage) => {
    const estimatedCost = typeof usage.data.estimatedCostUsd === 'number'
      ? usage.data.estimatedCostUsd
      : estimateGeminiCostUsd(String(usage.data.model || ''), Number(usage.data.inputTokens || 0), Number(usage.data.outputTokens || 0)) || 0;
    return runningTotal + estimatedCost;
  }, 0);

  const overview: AdminOverviewMetrics = {
    totalUploads: filteredUploads.length,
    activeUsers: new Set([
      ...filteredUploads.map((item) => item.userId).filter(Boolean),
      ...filteredFeedback.map((entry) => entry.userId),
      ...filteredAnalyticsEvents.map((event) => safeString(event.data.userId)).filter(Boolean),
    ]).size,
    analysesCompleted: completedAnalysisEvents.length,
    completionRate: startedAnalysisEvents.length > 0
      ? Math.round((completedAnalysisEvents.length / startedAnalysisEvents.length) * 10000) / 100
      : 0,
    activePaidUsers: filteredUsers.filter((user) => user.tier === 'basic' || user.tier === 'super').length,
    geminiCostUsd: Math.round(totalGeminiCost * 10000) / 10000,
    averageGeminiCostPerCompletedAnalysis: completedAnalysisEvents.length > 0
      ? Math.round((totalGeminiCost / completedAnalysisEvents.length) * 100000) / 100000
      : 0,
    averageFeedbackRating: average(filteredFeedback.map((entry) => entry.rating)),
    lowRatingFeedbackCount: filteredFeedback.filter((entry) => entry.rating <= LOW_RATING_THRESHOLD).length,
  };

  const analysisTypeBreakdown = new Map<string, number>();
  const analysisModeBreakdown = new Map<string, number>();
  const modelBreakdown = new Map<string, number>();
  const askTheAuntModeBreakdown = new Map<string, number>();
  const sharePlatformBreakdown = new Map<string, number>();
  const imageGenerationBreakdown = new Map<string, number>();
  const participantDistributionBreakdown = new Map<string, number>();

  completedAnalysisEvents.forEach((event) => {
    addBreakdown(analysisTypeBreakdown, safeString(event.data.analysisType) || 'analysis');
    addBreakdown(analysisModeBreakdown, safeString(event.data.analysisMode) || 'standard');
    if (event.data.analysisType === 'ask_aunt') {
      addBreakdown(
        askTheAuntModeBreakdown,
        event.data.metadata?.questionMode === 'general' ? 'general' : 'person'
      );
    }
  });

  filteredGeminiUsage.forEach((usage) => {
    addBreakdown(modelBreakdown, safeString(usage.data.model));
  });

  filteredAnalyticsEvents
    .filter((event) => event.data.category === 'share')
    .forEach((event) => addBreakdown(sharePlatformBreakdown, safeString(event.data.metadata?.platform)));

  filteredAnalyticsEvents
    .filter((event) => event.data.category === 'image')
    .forEach((event) => addBreakdown(imageGenerationBreakdown, safeString(event.data.eventName)));

  filteredUploads.forEach((upload) => {
    const participantsCount = Number(upload.data.participantsCount || 0);
    const label = participantsCount <= 2
      ? '1-2'
      : participantsCount <= 5
      ? '3-5'
      : participantsCount <= 10
      ? '6-10'
      : participantsCount <= 20
      ? '11-20'
      : '21+';
    addBreakdown(participantDistributionBreakdown, label);
  });

  const usage: AdminUsageSummary = {
    analysisTypeBreakdown: mapToBreakdownItems(analysisTypeBreakdown),
    analysisModeBreakdown: mapToBreakdownItems(analysisModeBreakdown),
    modelBreakdown: mapToBreakdownItems(modelBreakdown),
    askTheAuntModeBreakdown: mapToBreakdownItems(askTheAuntModeBreakdown),
    sharePlatformBreakdown: mapToBreakdownItems(sharePlatformBreakdown),
    imageGenerationBreakdown: mapToBreakdownItems(imageGenerationBreakdown),
    buttonLeaderboard: Object.entries(buttonPresses)
      .map(([label, value]) => ({ label, value: Number(value || 0) }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)),
    participantCountDistribution: mapToBreakdownItems(participantDistributionBreakdown),
  };

  const activeSubscriptionsByTier: Record<string, number> = { free: 0, basic: 0, super: 0 };
  filteredUsers.forEach((user) => {
    if (user.subscriptionStatus === 'ACTIVE') {
      activeSubscriptionsByTier[user.tier] = (activeSubscriptionsByTier[user.tier] || 0) + 1;
    }
  });

  const revenue: AdminRevenueSummary = {
    activeSubscriptionsByTier,
    newSubscriptions: filteredTransactions.filter((transaction) => transaction.data.type === 'subscription_activated').length,
    renewals: filteredTransactions.filter((transaction) => transaction.data.type === 'subscription_payment').length,
    cancellations: filteredTransactions.filter((transaction) => transaction.data.type === 'subscription_cancelled').length,
    estimatedActiveMonthlyRevenueUsd:
      (activeSubscriptionsByTier.basic || 0) * MONTHLY_TIER_PRICE_USD.basic +
      (activeSubscriptionsByTier.super || 0) * MONTHLY_TIER_PRICE_USD.super,
    recentTransactions: filteredTransactions
      .map((transaction) => ({
        id: transaction.id,
        timestamp: getTimestamp(transaction.data.timestamp),
        type: String(transaction.data.type || 'unknown'),
        amount: typeof transaction.data.amount === 'number' ? transaction.data.amount : null,
        currency: safeString(transaction.data.currency),
        status: safeString(transaction.data.status),
        subscriptionId: safeString(transaction.data.subscriptionId),
        tier: safeString(transaction.data.tier),
      }))
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .slice(0, 10),
    referralCodesGenerated: referralCodes.filter((code) => isInRange(getTimestamp(code.data.createdAt), range)).length,
    referralRedemptions: referralCodes.reduce((runningTotal, code) => {
      const usedBy = Array.isArray(code.data.usedBy) ? code.data.usedBy : [];
      return runningTotal + usedBy.filter((use: AnyRecord) => isInRange(getTimestamp(use.timestamp), range)).length;
    }, 0),
    unlimitedAccessUsers: filteredUsers.filter((user) => user.tier === 'super' && user.maxDailyUploads >= 999999).length,
  };

  const feedback: AdminFeedbackSummary = {
    totalFeedback: filteredFeedback.length,
    averageRating: average(filteredFeedback.map((entry) => entry.rating)),
    withCommentCount: filteredFeedback.filter((entry) => entry.hasComment).length,
    lowRatingCount: filteredFeedback.filter((entry) => entry.rating <= LOW_RATING_THRESHOLD).length,
    positiveRatingCount: filteredFeedback.filter((entry) => entry.rating >= POSITIVE_RATING_THRESHOLD).length,
    recentLowRatings: filteredFeedback.filter((entry) => entry.rating <= LOW_RATING_THRESHOLD).slice(0, 10),
    recentDetailedComments: filteredFeedback.filter((entry) => entry.hasComment).slice(0, 10),
    recentHighRatingsWithComments: filteredFeedback.filter((entry) => entry.rating >= POSITIVE_RATING_THRESHOLD && entry.hasComment).slice(0, 10),
  };

  const aiFailures = filteredAnalyticsEvents.filter((event) => {
    return (event.data.category === 'analysis' || event.data.category === 'ai') && event.data.status === 'failed';
  });
  const aiDurations = filteredGeminiUsage
    .map((usage) => Number(usage.data.durationMs || 0))
    .filter((duration) => duration > 0);
  const endpointGroups = new Map<string, { durations: number[]; total: number; failed: number }>();

  filteredAnalyticsEvents
    .filter((event) => event.data.category === 'analysis')
    .forEach((event) => {
      const endpoint = safeString(event.data.endpoint) || 'unknown';
      const existing = endpointGroups.get(endpoint) || { durations: [], total: 0, failed: 0 };
      existing.total += 1;
      if (event.data.status === 'failed') {
        existing.failed += 1;
      }
      if (typeof event.data.durationMs === 'number' && event.data.durationMs > 0) {
        existing.durations.push(event.data.durationMs);
      }
      endpointGroups.set(endpoint, existing);
    });

  const aiOps: AdminAiOpsSummary = {
    totalInputTokens: sum(filteredGeminiUsage.map((usage) => Number(usage.data.inputTokens || 0))),
    totalOutputTokens: sum(filteredGeminiUsage.map((usage) => Number(usage.data.outputTokens || 0))),
    totalCostUsd: Math.round(totalGeminiCost * 10000) / 10000,
    flashUsageCount: filteredGeminiUsage.filter((usage) => String(usage.data.model || '').includes('flash')).length,
    proUsageCount: filteredGeminiUsage.filter((usage) => String(usage.data.model || '').includes('pro')).length,
    averageDurationMs: aiDurations.length ? Math.round(sum(aiDurations) / aiDurations.length) : 0,
    failureRate: filteredAnalyticsEvents.filter((event) => event.data.category === 'analysis').length > 0
      ? Math.round((aiFailures.length / filteredAnalyticsEvents.filter((event) => event.data.category === 'analysis').length) * 10000) / 100
      : 0,
    recentFailures: aiFailures.slice(0, 10).map((event) => ({
      id: event.id,
      timestamp: getTimestamp(event.data.timestamp) || new Date(0).toISOString(),
      category: String(event.data.category || 'analysis'),
      level: 'error',
      message: String(event.data.message || event.data.eventName || 'AI failure'),
      userId: safeString(event.data.userId),
      email: normalizeEmail(event.data.userEmail) || null,
      eventName: safeString(event.data.eventName),
      details: event.data.metadata || {},
    })),
    costByModel: mapToBreakdownItems(
      filteredGeminiUsage.reduce((accumulator, usage) => {
        const model = safeString(usage.data.model) || 'unknown';
        const cost = typeof usage.data.estimatedCostUsd === 'number'
          ? usage.data.estimatedCostUsd
          : estimateGeminiCostUsd(model, Number(usage.data.inputTokens || 0), Number(usage.data.outputTokens || 0)) || 0;
        accumulator.set(model, (accumulator.get(model) || 0) + cost);
        return accumulator;
      }, new Map<string, number>())
    ),
    costByFeature: mapToBreakdownItems(
      filteredGeminiUsage.reduce((accumulator, usage) => {
        const feature = safeString(usage.data.feature) || 'unknown';
        const cost = typeof usage.data.estimatedCostUsd === 'number'
          ? usage.data.estimatedCostUsd
          : estimateGeminiCostUsd(String(usage.data.model || ''), Number(usage.data.inputTokens || 0), Number(usage.data.outputTokens || 0)) || 0;
        accumulator.set(feature, (accumulator.get(feature) || 0) + cost);
        return accumulator;
      }, new Map<string, number>())
    ),
    endpointPerformance: Array.from(endpointGroups.entries())
      .map(([endpoint, group]): AdminAiEndpointPerformance => ({
        endpoint,
        averageDurationMs: group.durations.length ? Math.round(sum(group.durations) / group.durations.length) : 0,
        failureRate: group.total > 0 ? Math.round((group.failed / group.total) * 10000) / 100 : 0,
        total: group.total,
      }))
      .sort((a, b) => b.total - a.total),
  };

  const logs = await getAdminLogs(50);
  const alerts: AdminAlert[] = [];

  if (promptStatuses.some((prompt) => prompt.status === 'testing')) {
    alerts.push({
      id: 'prompt-testing',
      severity: 'warning',
      title: 'Prompt draft currently in testing',
      description: 'At least one prompt is using a draft version instead of production.',
    });
  }

  if (aiOps.failureRate >= 20) {
    alerts.push({
      id: 'analysis-failure-rate',
      severity: 'critical',
      title: 'Elevated analysis failure rate',
      description: `Analysis failure rate is currently ${aiOps.failureRate}%.`,
    });
  }

  if (analysisIssues.totalUnsuccessfulCount > 0) {
    alerts.push({
      id: 'analysis-issues',
      severity: analysisIssues.stuckCount > 0 ? 'critical' : 'warning',
      title: 'Some users did not receive their analysis',
      description: `${analysisIssues.totalUnsuccessfulCount} analysis requests failed or likely got stuck in the selected period.`,
    });
  }

  const missingCostEntries = filteredGeminiUsage.filter((usage) => {
    const model = String(usage.data.model || '');
    const derivedCost = typeof usage.data.estimatedCostUsd === 'number'
      ? usage.data.estimatedCostUsd
      : estimateGeminiCostUsd(model, Number(usage.data.inputTokens || 0), Number(usage.data.outputTokens || 0));
    return derivedCost === null;
  }).length;

  if (startedAnalysisEvents.length === 0 || missingCostEntries > 0) {
    alerts.push({
      id: 'missing-telemetry',
      severity: 'warning',
      title: 'Telemetry is partially missing',
      description: 'Some dashboard panels are using fallback data because historical analytics or model pricing data is incomplete.',
    });
  }

  const suspendedSubscriptions = filteredUsers.filter((user) => user.subscriptionStatus === 'SUSPENDED').length;
  if (suspendedSubscriptions > 0) {
    alerts.push({
      id: 'suspended-subscriptions',
      severity: 'warning',
      title: 'Suspended subscriptions detected',
      description: `${suspendedSubscriptions} users currently have suspended subscriptions.`,
    });
  }

  const recentLowRatings = filteredFeedback.filter((entry) => {
    const sevenDaysAgo = new Date(range.end);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    return new Date(entry.timestamp) >= sevenDaysAgo && entry.rating <= LOW_RATING_THRESHOLD;
  }).length;

  if (recentLowRatings >= 3) {
    alerts.push({
      id: 'feedback-spike',
      severity: 'info',
      title: 'Recent low-rating feedback spike',
      description: `${recentLowRatings} low ratings were submitted during the last 7 days of the selected range.`,
    });
  }

  if (logs.some((entry) => entry.eventName?.includes('webhook') && entry.level === 'error')) {
    alerts.push({
      id: 'webhook-failures',
      severity: 'warning',
      title: 'Webhook failures detected',
      description: 'Recent webhook-related errors were logged. Review the Logs tab for details.',
    });
  }

  if (adminAuditLog.length === 0) {
    alerts.push({
      id: 'no-admin-audit',
      severity: 'info',
      title: 'No recent admin actions recorded',
      description: 'The admin audit log is currently empty for the sampled period.',
    });
  }

  return {
    filters: range.filters,
    overview,
    timeSeries,
    usage,
    users: filteredUsers,
    revenue,
    feedback,
    aiOps,
    analysisIssues,
    prompts: promptStatuses,
    logs,
    alerts,
  };
}

export async function resetAdminUserUploadLimit(userId: string) {
  return resetDailyUploadLimit(userId);
}

export async function updateAdminUserTier(userId: string, tier: UserTier) {
  const maxDailyUploads = tier === 'super' ? 50 : tier === 'basic' ? 10 : 3;
  return updateUserTier(userId, tier, maxDailyUploads);
}

export async function generateAdminReferralCode(userId: string, userName: string, code?: string, uses = 3) {
  const generatedCode = (code || `REF-${Math.random().toString(36).slice(2, 8)}`).toUpperCase();
  await createGlobalReferralCode(userId, userName, generatedCode, uses);
  return generatedCode;
}

export async function generateAdminCreditCode(credits: number = 2) {
  const suffix = Math.random().toString(36).slice(2, 9).toUpperCase();
  const generatedCode = `CREDIT-${suffix}`;
  const { createCreditCode } = await import('@/lib/firestore-admin');
  await createCreditCode(generatedCode, credits);
  return generatedCode;
}

export async function reconcileAdminSubscription(userId: string) {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new Error('User not found');
  }

  const userData = userDoc.data() as AnyRecord;
  const subscriptionStatus = safeString(userData.subscriptionStatus);
  const tier = normalizeTier(userData.tier);

  if (!subscriptionStatus || subscriptionStatus === 'ACTIVE') {
    const resolvedMaxDailyUploads = tier === 'super' ? 50 : tier === 'basic' ? 10 : 3;
    await userRef.set({
      maxDailyUploads: resolvedMaxDailyUploads,
      reconciledAt: new Date().toISOString(),
    }, { merge: true });
    return { tier, subscriptionStatus: subscriptionStatus || 'UNKNOWN', maxDailyUploads: resolvedMaxDailyUploads };
  }

  await userRef.set({
    tier: 'free',
    maxDailyUploads: 3,
    reconciledAt: new Date().toISOString(),
  }, { merge: true });

  return { tier: 'free', subscriptionStatus, maxDailyUploads: 3 };
}
