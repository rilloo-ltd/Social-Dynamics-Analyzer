'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bot,
  FileText,
  Gauge,
  Layers3,
  MessageSquare,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  AdminDashboardSnapshot,
  AdminFeedbackEntry,
  AdminFeedbackSummary,
  AdminLogEntry,
  AdminPromptStatus,
  AdminUserDetailSnapshot,
  AdminUserRow,
} from '@/types';
import { useAdminAccess } from './useAdminAccess';

type AdminTab = 'overview' | 'usage' | 'users' | 'feedback' | 'ai' | 'prompts' | 'logs';

const TAB_ITEMS: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <Gauge className="w-4 h-4" /> },
  { id: 'usage', label: 'Usage', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
  { id: 'feedback', label: 'Feedback', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'ai', label: 'AI Ops', icon: <Bot className="w-4 h-4" /> },
  { id: 'prompts', label: 'Prompts', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'logs', label: 'Logs', icon: <Activity className="w-4 h-4" /> },
];

function formatCurrency(value: number | null | undefined) {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : 'N/A';
}

function formatPercent(value: number | null | undefined) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : 'N/A';
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
}

function StatusBadge({ label, tone }: { label: string; tone: 'slate' | 'blue' | 'amber' | 'green' | 'red' }) {
  const toneClasses = {
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    red: 'bg-red-100 text-red-700 border-red-200',
  }[tone];

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses}`}>{label}</span>;
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-black text-slate-900">{value}</div>
      {hint ? <div className="mt-2 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function BreakdownList({ items }: { items: Array<{ label: string; value: number }> }) {
  if (items.length === 0) {
    return <div className="text-sm text-slate-500">No data yet.</div>;
  }

  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="font-semibold text-slate-900">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardClient() {
  const router = useRouter();
  const { checking, isAdmin, visibleEmail, getAuthHeaders } = useAdminAccess();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [dashboard, setDashboard] = useState<AdminDashboardSnapshot | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetailSnapshot | null>(null);
  const [feedbackSummary, setFeedbackSummary] = useState<AdminFeedbackSummary | null>(null);
  const [feedbackEntries, setFeedbackEntries] = useState<AdminFeedbackEntry[]>([]);
  const [feedbackQuery, setFeedbackQuery] = useState('');
  const [feedbackCommentOnly, setFeedbackCommentOnly] = useState(true);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [preset, setPreset] = useState<'24h' | '7d' | '30d' | '90d'>('30d');
  const [error, setError] = useState<string | null>(null);

  const callAdminApi = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const headers = await getAuthHeaders();
    const response = await fetch(path, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
      router.replace('/');
      throw new Error('Unauthorized');
    }

    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || 'Request failed');
    }

    return payload.data as T;
  }, [getAuthHeaders, router]);

  const loadDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    setError(null);
    try {
      const snapshot = await callAdminApi<AdminDashboardSnapshot>(`/api/admin/dashboard?preset=${preset}`);
      setDashboard(snapshot);
      setUsers(snapshot.users);
      setLogs(snapshot.logs);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load dashboard');
    } finally {
      setLoadingDashboard(false);
    }
  }, [callAdminApi, preset]);

  const loadUsers = useCallback(async (query = '') => {
    const result = await callAdminApi<AdminUserRow[]>(`/api/admin/users?q=${encodeURIComponent(query)}`);
    setUsers(result);
  }, [callAdminApi]);

  const loadUserDetail = useCallback(async (userId: string) => {
    const detail = await callAdminApi<AdminUserDetailSnapshot>(`/api/admin/users/${userId}`);
    setSelectedUserDetail(detail);
  }, [callAdminApi]);

  const loadFeedback = useCallback(async () => {
    const searchParams = new URLSearchParams({
      preset,
      commentOnly: String(feedbackCommentOnly),
    });
    if (feedbackQuery.trim()) {
      searchParams.set('q', feedbackQuery.trim());
    }

    const result = await callAdminApi<{ summary: AdminFeedbackSummary; entries: AdminFeedbackEntry[] }>(
      `/api/admin/feedback?${searchParams.toString()}`
    );
    setFeedbackSummary(result.summary);
    setFeedbackEntries(result.entries);
  }, [callAdminApi, feedbackCommentOnly, feedbackQuery, preset]);

  const loadLogs = useCallback(async () => {
    const result = await callAdminApi<AdminLogEntry[]>('/api/admin/logs?limit=100');
    setLogs(result);
  }, [callAdminApi]);

  useEffect(() => {
    if (!checking && !isAdmin) {
      router.replace('/');
    }
  }, [checking, isAdmin, router]);

  useEffect(() => {
    if (!checking && isAdmin) {
      loadDashboard();
    }
  }, [checking, isAdmin, loadDashboard]);

  useEffect(() => {
    if (activeTab === 'users' && isAdmin) {
      loadUsers(userSearch).catch(() => {});
    }
  }, [activeTab, isAdmin, loadUsers, userSearch]);

  useEffect(() => {
    if (activeTab === 'feedback' && isAdmin) {
      loadFeedback().catch(() => {});
    }
  }, [activeTab, isAdmin, loadFeedback]);

  useEffect(() => {
    if (activeTab === 'logs' && isAdmin) {
      loadLogs().catch(() => {});
    }
  }, [activeTab, isAdmin, loadLogs]);

  const feedbackHistogram = useMemo(() => {
    const counts = new Map<number, number>();
    feedbackEntries.forEach((entry) => {
      counts.set(entry.rating, (counts.get(entry.rating) || 0) + 1);
    });
    return Array.from({ length: 10 }, (_, index) => {
      const rating = index + 1;
      return { rating: String(rating), count: counts.get(rating) || 0 };
    });
  }, [feedbackEntries]);

  if (checking || (loadingDashboard && !dashboard)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-6 text-center shadow-sm">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <div className="text-sm font-semibold text-slate-700">Loading admin dashboard...</div>
        </div>
      </div>
    );
  }

  if (!isAdmin || !dashboard) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5">
          <div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 cursor-pointer"
                title="Back to site"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-black text-slate-900">Admin Dashboard</h1>
                <p className="text-sm text-slate-500">Signed in as {visibleEmail}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(['24h', '7d', '30d', '90d'] as const).map((item) => (
              <button
                key={item}
                onClick={() => setPreset(item)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition cursor-pointer ${
                  preset === item ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {item}
              </button>
            ))}
            <button
              onClick={() => loadDashboard()}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-2">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition cursor-pointer ${
                activeTab === item.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Total uploads" value={String(dashboard.overview.totalUploads)} />
              <MetricCard title="Active users" value={String(dashboard.overview.activeUsers)} />
              <MetricCard title="Analyses completed" value={String(dashboard.overview.analysesCompleted)} hint={`Completion rate ${formatPercent(dashboard.overview.completionRate)}`} />
              <MetricCard title="AI cost" value={formatCurrency(dashboard.overview.geminiCostUsd)} hint={`Avg per completed analysis ${formatCurrency(dashboard.overview.averageGeminiCostPerCompletedAnalysis)}`} />
              <MetricCard title="Active paid users" value={String(dashboard.overview.activePaidUsers)} />
              <MetricCard title="Average rating" value={dashboard.overview.averageFeedbackRating?.toFixed(2) || 'N/A'} />
              <MetricCard title="Low ratings" value={String(dashboard.overview.lowRatingFeedbackCount)} />
              <MetricCard
                title="Unsuccessful analyses"
                value={String(dashboard.analysisIssues.totalUnsuccessfulCount)}
                hint={`${dashboard.analysisIssues.failedCount} failed, ${dashboard.analysisIssues.stuckCount} likely stuck`}
              />
            </div>

            <SectionCard title="Alerts">
              <div className="grid gap-3 md:grid-cols-2">
                {dashboard.alerts.map((alert) => (
                  <div key={alert.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <AlertTriangle className={`h-4 w-4 ${alert.severity === 'critical' ? 'text-red-600' : alert.severity === 'warning' ? 'text-amber-500' : 'text-sky-600'}`} />
                      <div className="font-bold text-slate-900">{alert.title}</div>
                    </div>
                    <div className="text-sm text-slate-600">{alert.description}</div>
                  </div>
                ))}
                {dashboard.alerts.length === 0 ? <div className="text-sm text-slate-500">No active alerts.</div> : null}
              </div>
            </SectionCard>

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard title="Uploads and analyses">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboard.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="uploads" stroke="#2563eb" strokeWidth={2} />
                      <Line type="monotone" dataKey="analysesCompleted" stroke="#7c3aed" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard title="AI cost and feedback">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboard.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="geminiCostUsd" stroke="#059669" strokeWidth={2} />
                      <Line type="monotone" dataKey="feedbackCount" stroke="#ea580c" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Analysis delivery issues">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Times users did not get an analysis" value={String(dashboard.analysisIssues.totalUnsuccessfulCount)} />
                <MetricCard title="Error responses" value={String(dashboard.analysisIssues.failedCount)} />
                <MetricCard
                  title="Likely stuck requests"
                  value={String(dashboard.analysisIssues.stuckCount)}
                  hint="Started but no completion or failure was recorded after 20 minutes"
                />
                <MetricCard title="Affected users" value={String(dashboard.analysisIssues.affectedUsers)} />
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <div>
                  <div className="mb-3 text-sm font-semibold text-slate-500">Issues by analysis type</div>
                  <BreakdownList items={dashboard.analysisIssues.issueByAnalysisType} />
                </div>
                <div>
                  <div className="mb-3 text-sm font-semibold text-slate-500">Issues by endpoint</div>
                  <BreakdownList items={dashboard.analysisIssues.issueByEndpoint} />
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-3 text-sm font-semibold text-slate-500">Recent unsuccessful analysis requests</div>
                <div className="space-y-3">
                  {dashboard.analysisIssues.recentIssues.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge label={entry.level} tone={entry.level === 'error' ? 'red' : entry.level === 'warning' ? 'amber' : 'blue'} />
                        {entry.details?.issueKind ? (
                          <StatusBadge
                            label={String(entry.details.issueKind)}
                            tone={entry.details.issueKind === 'stuck' ? 'amber' : 'red'}
                          />
                        ) : null}
                        <span className="text-xs text-slate-500">{formatTimestamp(entry.timestamp)}</span>
                        {entry.email ? <span className="text-xs text-slate-500">{entry.email}</span> : null}
                      </div>
                      <div className="font-semibold text-slate-900">{entry.message}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {String(entry.details?.analysisType || 'unknown')} via {String(entry.details?.endpoint || 'unknown')}
                      </div>
                    </div>
                  ))}
                  {dashboard.analysisIssues.recentIssues.length === 0 ? (
                    <div className="text-sm text-slate-500">No failed or stuck analysis requests were found in the selected period.</div>
                  ) : null}
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Analysis types">
              <BreakdownList items={dashboard.usage.analysisTypeBreakdown} />
            </SectionCard>
            <SectionCard title="Quick vs deep">
              <BreakdownList items={dashboard.usage.analysisModeBreakdown} />
            </SectionCard>
            <SectionCard title="Model split">
              <BreakdownList items={dashboard.usage.modelBreakdown} />
            </SectionCard>
            <SectionCard title="Ask the Aunt modes">
              <BreakdownList items={dashboard.usage.askTheAuntModeBreakdown} />
            </SectionCard>
            <SectionCard title="Share platforms">
              <BreakdownList items={dashboard.usage.sharePlatformBreakdown} />
            </SectionCard>
            <SectionCard title="Button leaderboard">
              <BreakdownList items={dashboard.usage.buttonLeaderboard.slice(0, 12)} />
            </SectionCard>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <SectionCard
              title="Users"
              action={
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      placeholder="Search by email or user ID"
                      className="rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                    />
                  </div>
                  <button
                    onClick={() => loadUsers(userSearch)}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
                  >
                    Search
                  </button>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Uploads</th>
                      <th className="pb-3">Last activity</th>
                      <th className="pb-3">Subscription</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.userId}
                        className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50"
                        onClick={() => loadUserDetail(user.userId)}
                      >
                        <td className="py-3 font-medium text-slate-900">{user.email || user.userId}</td>
                        <td className="py-3">{user.totalUploads} total / {user.uploadsToday} today</td>
                        <td className="py-3">{formatTimestamp(user.lastActivity)}</td>
                        <td className="py-3">{user.subscriptionStatus || 'none'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {selectedUserDetail ? (
              <SectionCard
                title={`User detail: ${selectedUserDetail.user.email || selectedUserDetail.user.userId}`}
                action={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
              >
                <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <MetricCard title="Account type" value="Standard" />
                      <MetricCard title="Rolling quota" value="3 / 24h" />
                      <MetricCard title="Uploads" value={`${selectedUserDetail.user.totalUploads}`} hint={`${selectedUserDetail.user.uploadsToday} today`} />
                      <MetricCard title="Legacy subscription" value={selectedUserDetail.user.subscriptionStatus || 'none'} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Recent feedback">
                      <div className="space-y-3">
                        {selectedUserDetail.feedback.slice(0, 5).map((entry) => (
                          <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <div className="mb-1 text-xs text-slate-500">{formatTimestamp(entry.timestamp)}</div>
                            <div className="font-semibold text-slate-900">Rating {entry.rating}/10</div>
                            <div className="mt-1 text-sm text-slate-600">{entry.comment || 'No comment'}</div>
                          </div>
                        ))}
                        {selectedUserDetail.feedback.length === 0 ? <div className="text-sm text-slate-500">No feedback yet.</div> : null}
                      </div>
                    </SectionCard>
                  </div>
                </div>
              </SectionCard>
            ) : null}
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard title="Feedback submissions" value={String(feedbackSummary?.totalFeedback ?? dashboard.feedback.totalFeedback)} />
              <MetricCard title="Average rating" value={(feedbackSummary?.averageRating ?? dashboard.feedback.averageRating)?.toFixed(2) || 'N/A'} />
              <MetricCard title="With comments" value={String(feedbackSummary?.withCommentCount ?? dashboard.feedback.withCommentCount)} />
              <MetricCard title="Low ratings" value={String(feedbackSummary?.lowRatingCount ?? dashboard.feedback.lowRatingCount)} />
              <MetricCard title="Positive ratings" value={String(feedbackSummary?.positiveRatingCount ?? dashboard.feedback.positiveRatingCount)} />
            </div>

            <SectionCard
              title="Feedback explorer"
              action={
                <div className="flex items-center gap-2">
                  <input
                    value={feedbackQuery}
                    onChange={(event) => setFeedbackQuery(event.target.value)}
                    placeholder="Search comment, email, or user ID"
                    className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={feedbackCommentOnly}
                      onChange={(event) => setFeedbackCommentOnly(event.target.checked)}
                    />
                    Comment only
                  </label>
                  <button onClick={() => loadFeedback()} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white cursor-pointer">Apply</button>
                </div>
              }
            >
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={feedbackHistogram}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="rating" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#7c3aed" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboard.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="feedbackCount" stroke="#2563eb" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Feedback entries">
              <div className="space-y-3">
                {feedbackEntries.slice(0, 40).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusBadge label={`${entry.rating}/10`} tone={entry.rating <= 4 ? 'red' : entry.rating >= 8 ? 'green' : 'amber'} />
                      <StatusBadge label={entry.analysisType || 'unknown'} tone="slate" />
                      <span className="text-xs text-slate-500">{entry.userEmail || entry.userId}</span>
                      <span className="text-xs text-slate-400">{formatTimestamp(entry.timestamp)}</span>
                    </div>
                    <div className="text-sm text-slate-700">{entry.comment || 'No comment provided.'}</div>
                  </div>
                ))}
                {feedbackEntries.length === 0 ? <div className="text-sm text-slate-500">No feedback entries match the current filters.</div> : null}
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard title="Input tokens" value={dashboard.aiOps.totalInputTokens.toLocaleString()} />
              <MetricCard title="Output tokens" value={dashboard.aiOps.totalOutputTokens.toLocaleString()} />
              <MetricCard title="Total cost" value={formatCurrency(dashboard.aiOps.totalCostUsd)} />
              <MetricCard title="Average duration" value={`${dashboard.aiOps.averageDurationMs} ms`} />
              <MetricCard title="Failure rate" value={formatPercent(dashboard.aiOps.failureRate)} />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard title="Cost by model">
                <BreakdownList items={dashboard.aiOps.costByModel} />
              </SectionCard>
              <SectionCard title="Cost by feature">
                <BreakdownList items={dashboard.aiOps.costByFeature} />
              </SectionCard>
            </div>
            <SectionCard title="Endpoint performance">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-3">Endpoint</th>
                      <th className="pb-3">Average duration</th>
                      <th className="pb-3">Failure rate</th>
                      <th className="pb-3">Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.aiOps.endpointPerformance.map((item) => (
                      <tr key={item.endpoint} className="border-t border-slate-100">
                        <td className="py-3 font-medium text-slate-900">{item.endpoint}</td>
                        <td className="py-3">{item.averageDurationMs} ms</td>
                        <td className="py-3">{formatPercent(item.failureRate)}</td>
                        <td className="py-3">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === 'prompts' && (
          <div className="space-y-6">
            <SectionCard
              title="Prompt status"
              action={
                <Link href="/admin/prompts" className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                  <Settings2 className="h-4 w-4" />
                  Open prompt manager
                </Link>
              }
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-3">Prompt</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Modified</th>
                      <th className="pb-3">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.prompts.map((prompt: AdminPromptStatus) => (
                      <tr key={prompt.id} className="border-t border-slate-100">
                        <td className="py-3">
                          <div className="font-semibold text-slate-900">{prompt.name}</div>
                          <div className="text-xs text-slate-500">{prompt.description}</div>
                        </td>
                        <td className="py-3">
                          <StatusBadge
                            label={prompt.status}
                            tone={prompt.status === 'testing' ? 'amber' : prompt.status === 'draft' ? 'blue' : 'green'}
                          />
                        </td>
                        <td className="py-3">{formatTimestamp(prompt.lastModified)}</td>
                        <td className="py-3">{prompt.modifiedBy || 'system'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === 'logs' && (
          <SectionCard
            title="Recent logs"
            action={
              <button onClick={() => loadLogs()} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white cursor-pointer">
                Refresh logs
              </button>
            }
          >
            <div className="space-y-3">
              {logs.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge label={entry.level} tone={entry.level === 'error' ? 'red' : entry.level === 'warning' ? 'amber' : 'blue'} />
                    <StatusBadge label={entry.category} tone="slate" />
                    <span className="text-xs text-slate-500">{formatTimestamp(entry.timestamp)}</span>
                    {entry.email ? <span className="text-xs text-slate-500">{entry.email}</span> : null}
                  </div>
                  <div className="font-semibold text-slate-900">{entry.message}</div>
                  {entry.details ? (
                    <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
