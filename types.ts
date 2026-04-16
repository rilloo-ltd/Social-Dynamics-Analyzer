
export interface ChatMessage {
  date: Date;
  sender: string;
  content: string;
  rawLine: string;
}

export interface AnalysisResult {
  type: AnalysisType;
  content: string;
}

export enum AnalysisType {
  PERSONALITY = 'personality',
  OTHERS_THOUGHTS = 'others_thoughts',
  IMPROVEMENT = 'improvement',
  HIDDEN_THOUGHTS = 'hidden_thoughts',
  GROUP_DYNAMICS = 'group_dynamics',
  ROMANTIC_DYNAMICS = 'romantic_dynamics',
  ASK_AUNT = 'ask_aunt',
}

export interface ParsedChat {
  messages: ChatMessage[];
  participants: string[];
  anonymizedMessages: ChatMessage[];
  loadingPreviewMessages: ChatMessage[];
  // Map of Original Name -> Placeholder Name
  nameMap: Record<string, string>;
  // Map of Placeholder Name -> Original Name (for reconstruction)
  reverseMap: Record<string, string>;
}

export type CardColor = 'blue' | 'purple' | 'green' | 'red' | 'yellow' | 'teal' | 'pink' | 'cyan' | 'orange' | 'indigo' | 'slate';

export type UserTier = 'free' | 'basic' | 'super' | 'friends';
export type AnalysisModelPreference = 'fast';
export type AnalysisDepthMode = 'deep' | 'standard';

// Chunking types for smart sampling of large chats
export type ChunkingStrategy = 'full' | 'sampled';

export type ParticipantAxisKey = 'liberalism' | 'calmness' | 'rationalism' | 'humor';

export interface ParticipantAxisScore {
  participantCode: string;
  liberalism: number;
  calmness: number;
  rationalism: number;
  humor: number;
}

export interface ParticipantAxisDistributionSummary {
  totalObservations: number;
  liberalism: Record<number, number>;
  calmness: Record<number, number>;
  rationalism: Record<number, number>;
  humor: Record<number, number>;
}

export interface DateDensity {
  date: string;
  messageCount: number;
  wordCount: number;
  density: number;
}

export interface ChunkInfo {
  startDate: string;
  endDate: string;
  messages: ChatMessage[];
  wordCount: number;
  reason: string;
}

export interface ChatRecordSection {
  label: string;
  messages: ChatMessage[];
}

export type AdminRangePreset = '24h' | '7d' | '30d' | '90d' | 'custom';
export type AdminAlertSeverity = 'info' | 'warning' | 'critical';
export type AdminLogLevel = 'info' | 'warning' | 'error';

export interface AdminDashboardFilters {
  preset?: AdminRangePreset;
  startDate?: string;
  endDate?: string;
  tier?: UserTier | 'all';
  analysisType?: string | 'all';
  analysisMode?: AnalysisDepthMode | 'all';
  model?: string | 'all';
}

export interface AdminBreakdownItem {
  label: string;
  value: number;
  secondaryValue?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AdminOverviewMetrics {
  totalUploads: number;
  activeUsers: number;
  analysesCompleted: number;
  completionRate: number;
  activePaidUsers: number;
  geminiCostUsd: number;
  averageGeminiCostPerCompletedAnalysis: number;
  averageFeedbackRating: number | null;
  lowRatingFeedbackCount: number;
}

export interface AdminTimeSeriesPoint {
  date: string;
  label: string;
  uploads: number;
  activeUsers: number;
  analysesStarted: number;
  analysesCompleted: number;
  analysesFailed: number;
  geminiCostUsd: number;
  flashCostUsd: number;
  proCostUsd: number;
  feedbackCount: number;
  averageFeedbackRating: number | null;
  subscriptionActivated: number;
  subscriptionCancelled: number;
  subscriptionRenewed: number;
}

export interface AdminAlert {
  id: string;
  severity: AdminAlertSeverity;
  title: string;
  description: string;
}

export interface AdminUserRow {
  userId: string;
  email: string | null;
  tier: UserTier;
  maxDailyUploads: number;
  uploadsToday: number;
  totalUploads: number;
  lastActivity: string | null;
  subscriptionStatus: string | null;
  nextBillingDate: string | null;
  lastFeedbackRating: number | null;
  createdAt: string | null;
}

export interface AdminUploadEntry {
  id: string;
  timestamp: string;
  participantsCount: number;
  tokensCount: number;
  sessionId: string | null;
}

export interface AdminTransactionEntry {
  id: string;
  timestamp: string | null;
  type: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  subscriptionId: string | null;
  tier: string | null;
}

export interface AdminFeedbackEntry {
  id: string;
  userId: string;
  userEmail: string | null;
  sessionId: string | null;
  timestamp: string;
  rating: number;
  comment: string;
  hasComment: boolean;
  analysisType: string | null;
  analysisMode: AnalysisDepthMode | null;
  tier: UserTier | string | null;
  chatCode: string | null;
  source: 'feedbackEntries' | 'legacySession';
}

export interface AdminSessionSummary {
  sessionId: string;
  createdAt: string | null;
  sharesCount: number;
  imagesCount: number;
  hasFeedback: boolean;
  feedbackRating: number | null;
  feedbackComment: string;
  analysisType: string | null;
  analysisMode: AnalysisDepthMode | null;
  chatCode: string | null;
}

export interface AdminUserDetailSnapshot {
  user: AdminUserRow & {
    subscriptionId: string | null;
    subscriptionPlanId: string | null;
    subscriptionStartDate: string | null;
    referralCodesCount: number;
  };
  uploads: AdminUploadEntry[];
  sessions: AdminSessionSummary[];
  transactions: AdminTransactionEntry[];
  feedback: AdminFeedbackEntry[];
}

export interface AdminFeedbackSummary {
  totalFeedback: number;
  averageRating: number | null;
  withCommentCount: number;
  lowRatingCount: number;
  positiveRatingCount: number;
  recentLowRatings: AdminFeedbackEntry[];
  recentDetailedComments: AdminFeedbackEntry[];
  recentHighRatingsWithComments: AdminFeedbackEntry[];
}

export interface AdminRevenueSummary {
  activeSubscriptionsByTier: Record<string, number>;
  newSubscriptions: number;
  renewals: number;
  cancellations: number;
  estimatedActiveMonthlyRevenueUsd: number;
  recentTransactions: AdminTransactionEntry[];
  referralCodesGenerated: number;
  referralRedemptions: number;
  unlimitedAccessUsers: number;
}

export interface AdminAiEndpointPerformance {
  endpoint: string;
  averageDurationMs: number;
  failureRate: number;
  total: number;
}

export interface AdminLogEntry {
  id: string;
  timestamp: string;
  category: string;
  level: AdminLogLevel;
  message: string;
  userId: string | null;
  email: string | null;
  eventName: string | null;
  details?: Record<string, unknown>;
}

export interface AdminAiOpsSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  flashUsageCount: number;
  proUsageCount: number;
  averageDurationMs: number;
  failureRate: number;
  recentFailures: AdminLogEntry[];
  costByModel: AdminBreakdownItem[];
  costByFeature: AdminBreakdownItem[];
  endpointPerformance: AdminAiEndpointPerformance[];
}

export interface AdminAnalysisIssueSummary {
  totalUnsuccessfulCount: number;
  failedCount: number;
  stuckCount: number;
  affectedUsers: number;
  issueByAnalysisType: AdminBreakdownItem[];
  issueByEndpoint: AdminBreakdownItem[];
  recentIssues: AdminLogEntry[];
}

export interface AdminPromptStatus {
  id: string;
  name: string;
  description: string;
  status: 'production' | 'draft' | 'testing';
  hasDraft: boolean;
  useDraft: boolean;
  lastModified: string | null;
  modifiedBy?: string;
}

export interface AdminPromptDetail extends AdminPromptStatus {
  production: string;
  draft: string | null;
}

export interface AdminAuditLogEntry {
  id: string;
  action: string;
  actorEmail: string;
  actorUserId: string | null;
  targetUserId: string | null;
  targetId: string | null;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface AdminUsageSummary {
  analysisTypeBreakdown: AdminBreakdownItem[];
  analysisModeBreakdown: AdminBreakdownItem[];
  modelBreakdown: AdminBreakdownItem[];
  askTheAuntModeBreakdown: AdminBreakdownItem[];
  sharePlatformBreakdown: AdminBreakdownItem[];
  imageGenerationBreakdown: AdminBreakdownItem[];
  buttonLeaderboard: AdminBreakdownItem[];
  participantCountDistribution: AdminBreakdownItem[];
}

export interface AdminDashboardSnapshot {
  filters: AdminDashboardFilters;
  overview: AdminOverviewMetrics;
  timeSeries: AdminTimeSeriesPoint[];
  usage: AdminUsageSummary;
  users: AdminUserRow[];
  revenue: AdminRevenueSummary;
  feedback: AdminFeedbackSummary;
  aiOps: AdminAiOpsSummary;
  analysisIssues: AdminAnalysisIssueSummary;
  prompts: AdminPromptStatus[];
  logs: AdminLogEntry[];
  alerts: AdminAlert[];
}
