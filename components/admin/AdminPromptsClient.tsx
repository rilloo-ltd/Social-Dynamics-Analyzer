'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Save, FlaskConical, Trash2, UploadCloud } from 'lucide-react';
import { AdminPromptDetail } from '@/types';
import { useAdminAccess } from './useAdminAccess';

function StatusPill({ label, tone }: { label: string; tone: 'slate' | 'amber' | 'green' }) {
  const classes = {
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  }[tone];

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>{label}</span>;
}

export default function AdminPromptsClient() {
  const router = useRouter();
  const { checking, isAdmin, visibleEmail, getAuthHeaders } = useAdminAccess();
  const [prompts, setPrompts] = useState<AdminPromptDetail[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const callPromptApi = useCallback(async <T,>(init?: RequestInit): Promise<T> => {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/admin/prompts', {
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
      throw new Error(payload?.error || 'Prompt request failed');
    }

    return payload as T;
  }, [getAuthHeaders, router]);

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await callPromptApi<{ success: boolean; data: AdminPromptDetail[] }>();
      setPrompts(result.data);
      if (!selectedPromptId && result.data.length > 0) {
        setSelectedPromptId(result.data[0].id);
        setEditedContent(result.data[0].draft || result.data[0].production);
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to load prompts' });
    } finally {
      setLoading(false);
    }
  }, [callPromptApi, selectedPromptId]);

  useEffect(() => {
    if (!checking && !isAdmin) {
      router.replace('/');
    }
  }, [checking, isAdmin, router]);

  useEffect(() => {
    if (!checking && isAdmin) {
      loadPrompts();
    }
  }, [checking, isAdmin, loadPrompts]);

  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedPromptId) || null,
    [prompts, selectedPromptId]
  );

  useEffect(() => {
    if (selectedPrompt) {
      setEditedContent(selectedPrompt.draft || selectedPrompt.production);
    }
  }, [selectedPrompt]);

  const runPromptAction = useCallback(async (action: string, extraBody?: Record<string, unknown>) => {
    if (!selectedPromptId) {
      return;
    }

    setBusyAction(action);
    setMessage(null);
    try {
      const response = await callPromptApi<{ success: boolean; commitSha?: string }>({
        method: 'POST',
        body: JSON.stringify({
          action,
          promptId: selectedPromptId,
          ...extraBody,
        }),
      });

      await loadPrompts();
      setMessage({
        tone: 'success',
        text: response.commitSha
          ? `Prompt committed successfully (${response.commitSha.slice(0, 7)})`
          : 'Prompt action completed successfully.',
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Prompt action failed' });
    } finally {
      setBusyAction(null);
    }
  }, [callPromptApi, loadPrompts, selectedPromptId]);

  if (checking || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-6 text-center shadow-sm">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <div className="text-sm font-semibold text-slate-700">Loading prompt manager...</div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 cursor-pointer"
              title="Back to admin dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Prompt Manager</h1>
              <p className="text-sm text-slate-500">Signed in as {visibleEmail}</p>
            </div>
          </div>
          <button
            onClick={() => loadPrompts()}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[320px_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 text-lg font-black text-slate-900">Prompts</div>
          <div className="space-y-2">
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                onClick={() => setSelectedPromptId(prompt.id)}
                className={`w-full rounded-2xl border p-4 text-left transition cursor-pointer ${
                  selectedPromptId === prompt.id
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="mb-2 font-semibold text-slate-900">{prompt.name}</div>
                <div className="mb-3 text-xs text-slate-500">{prompt.description}</div>
                <div className="flex gap-2">
                  {prompt.useDraft ? <StatusPill label="Testing" tone="amber" /> : null}
                  {!prompt.useDraft && prompt.draft ? <StatusPill label="Draft" tone="slate" /> : null}
                  {!prompt.draft ? <StatusPill label="Production" tone="green" /> : null}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {message ? (
            <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${message.tone === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {message.text}
            </div>
          ) : null}

          {selectedPrompt ? (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">{selectedPrompt.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedPrompt.description}</p>
                  <p className="mt-2 text-xs text-slate-400">Last modified: {selectedPrompt.lastModified ? new Date(selectedPrompt.lastModified).toLocaleString() : 'N/A'}</p>
                </div>
                <div className="flex gap-2">
                  {selectedPrompt.useDraft ? <StatusPill label="Testing mode" tone="amber" /> : null}
                  {!selectedPrompt.useDraft && selectedPrompt.draft ? <StatusPill label="Draft available" tone="slate" /> : null}
                  {!selectedPrompt.draft ? <StatusPill label="Production only" tone="green" /> : null}
                </div>
              </div>

              <textarea
                value={editedContent}
                onChange={(event) => setEditedContent(event.target.value)}
                className="min-h-[420px] w-full rounded-3xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-800 outline-none focus:border-indigo-400 focus:bg-white"
              />

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => runPromptAction('saveDraft', { draftContent: editedContent })}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
                  disabled={busyAction !== null}
                >
                  <Save className="h-4 w-4" />
                  Save draft
                </button>
                <button
                  onClick={() => runPromptAction('activateDraft')}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50 cursor-pointer"
                  disabled={busyAction !== null || !selectedPrompt.draft}
                >
                  <FlaskConical className="h-4 w-4" />
                  Activate testing
                </button>
                <button
                  onClick={() => runPromptAction('deactivateDraft')}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 cursor-pointer"
                  disabled={busyAction !== null || !selectedPrompt.useDraft}
                >
                  <FlaskConical className="h-4 w-4" />
                  Return to production
                </button>
                <button
                  onClick={() => window.confirm('Discard this draft?') && runPromptAction('discardDraft')}
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50 cursor-pointer"
                  disabled={busyAction !== null || !selectedPrompt.draft}
                >
                  <Trash2 className="h-4 w-4" />
                  Discard draft
                </button>
                <button
                  onClick={() => window.confirm('Commit this draft to production?') && runPromptAction('commit')}
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
                  disabled={busyAction !== null || !selectedPrompt.draft}
                >
                  <UploadCloud className="h-4 w-4" />
                  Commit to production
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">Select a prompt to edit.</div>
          )}
        </div>
      </div>
    </div>
  );
}
