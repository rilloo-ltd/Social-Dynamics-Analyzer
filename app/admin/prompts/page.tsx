'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  getPromptsAction,
  savePromptDraftAction,
  activateDraftAction,
  deactivateDraftAction,
  discardDraftAction,
  commitPromptAction,
} from '@/app/actions/prompt-actions';
import { verifyAdminPasswordAction } from '@/app/actions/admin-actions';

interface PromptInfo {
  id: string;
  name: string;
  description: string;
  production: string;
  draft: string | null;
  useDraft: boolean;
  lastModified: string | null;
  modifiedBy?: string;
}

export default function PromptsAdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [storedPassword, setStoredPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string; commitUrl?: string } | null>(null);
  const [showCommitWarning, setShowCommitWarning] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);

    try {
      const result = await verifyAdminPasswordAction(password);

      if (result.success) {
        setIsAuthenticated(true);
        setStoredPassword(password);
        fetchPrompts(password);
      } else {
        setError(result.message || 'Invalid password');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Login failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const fetchPrompts = async (pwd: string) => {
    setLoading(true);
    try {
      const result = await getPromptsAction(pwd);
      if (result.success && result.prompts) {
        setPrompts(result.prompts);
      } else {
        setActionMessage({ type: 'error', text: result.error || 'Failed to fetch prompts' });
      }
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
      setActionMessage({ type: 'error', text: 'Failed to fetch prompts' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrompt = (promptId: string) => {
    const prompt = prompts.find((p) => p.id === promptId);
    if (prompt) {
      setSelectedPrompt(promptId);
      // Show draft if it exists, otherwise show production
      setEditedContent(prompt.draft || prompt.production);
      setActionMessage(null);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedPrompt || !storedPassword) return;

    setActionLoading(true);
    setActionMessage(null);

    try {
      const result = await savePromptDraftAction(storedPassword, selectedPrompt, editedContent);
      if (result.success) {
        setActionMessage({ type: 'success', text: 'Draft saved successfully!' });
        await fetchPrompts(storedPassword);
      } else {
        setActionMessage({ type: 'error', text: result.error || 'Failed to save draft' });
      }
    } catch (error) {
      console.error('Save draft error:', error);
      setActionMessage({ type: 'error', text: 'Failed to save draft' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivateDraft = async () => {
    if (!selectedPrompt || !storedPassword) return;

    setActionLoading(true);
    setActionMessage(null);

    try {
      const result = await activateDraftAction(storedPassword, selectedPrompt);
      if (result.success) {
        setActionMessage({ type: 'success', text: 'Draft activated for testing!' });
        await fetchPrompts(storedPassword);
      } else {
        setActionMessage({ type: 'error', text: result.error || 'Failed to activate draft' });
      }
    } catch (error) {
      console.error('Activate draft error:', error);
      setActionMessage({ type: 'error', text: 'Failed to activate draft' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivateDraft = async () => {
    if (!selectedPrompt || !storedPassword) return;

    setActionLoading(true);
    setActionMessage(null);

    try {
      const result = await deactivateDraftAction(storedPassword, selectedPrompt);
      if (result.success) {
        setActionMessage({ type: 'success', text: 'Draft deactivated. Back to production.' });
        await fetchPrompts(storedPassword);
      } else {
        setActionMessage({ type: 'error', text: result.error || 'Failed to deactivate draft' });
      }
    } catch (error) {
      console.error('Deactivate draft error:', error);
      setActionMessage({ type: 'error', text: 'Failed to deactivate draft' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!selectedPrompt || !storedPassword) return;

    if (!confirm('Are you sure you want to discard the draft? This cannot be undone.')) {
      return;
    }

    setActionLoading(true);
    setActionMessage(null);

    try {
      const result = await discardDraftAction(storedPassword, selectedPrompt);
      if (result.success) {
        setActionMessage({ type: 'success', text: 'Draft discarded successfully!' });
        await fetchPrompts(storedPassword);
        // Reset editor to production version
        const prompt = prompts.find((p) => p.id === selectedPrompt);
        if (prompt) {
          setEditedContent(prompt.production);
        }
      } else {
        setActionMessage({ type: 'error', text: result.error || 'Failed to discard draft' });
      }
    } catch (error) {
      console.error('Discard draft error:', error);
      setActionMessage({ type: 'error', text: 'Failed to discard draft' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCommit = async () => {
    setShowCommitWarning(false);
    if (!selectedPrompt || !storedPassword) return;

    setActionLoading(true);
    setActionMessage(null);

    try {
      const result = await commitPromptAction(
        storedPassword,
        selectedPrompt,
        `chore: update prompt "${selectedPrompt}" via admin panel`
      );
      if (result.success) {
        setActionMessage({
          type: 'success',
          text: result.commitSha
            ? `✅ Committed to GitHub (${result.commitSha.slice(0, 7)}) — Firebase will auto-deploy shortly.`
            : '✅ Promoted to production in Firestore.',
          commitUrl: result.commitUrl,
        });
        await fetchPrompts(storedPassword);
      } else {
        setActionMessage({ type: 'error', text: result.error || 'Failed to commit prompt' });
      }
    } catch (error) {
      console.error('Commit error:', error);
      setActionMessage({ type: 'error', text: 'Failed to commit prompt' });
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && storedPassword) {
      fetchPrompts(storedPassword);
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-lg shadow-md w-96">
          <h2 className="text-2xl font-bold mb-6 text-center">Admin Login - Prompts</h2>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            className="w-full p-2 border rounded mb-4"
            disabled={isLoggingIn}
          />
          {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
          <button
            type="submit"
            className={`w-full text-white p-2 rounded transition-colors ${
              isLoggingIn ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
            }`}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    );
  }

  const selectedPromptData = prompts.find((p) => p.id === selectedPrompt);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              title="Back to Main Page"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-3xl font-bold">AI Prompts Management</h1>
          </div>
          <button
            onClick={() => fetchPrompts(storedPassword)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left sidebar - Prompts list */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">Prompts</h2>
            {loading ? (
              <p className="text-gray-500">Loading...</p>
            ) : (
              <div className="space-y-2">
                {prompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => handleSelectPrompt(prompt.id)}
                    className={`w-full text-left p-3 rounded border transition-colors cursor-pointer ${
                      selectedPrompt === prompt.id
                        ? 'bg-blue-100 border-blue-500'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-semibold">{prompt.name}</div>
                    <div className="text-sm text-gray-600 mb-2">{prompt.description}</div>
                    <div className="flex gap-2">
                      {prompt.draft && (
                        <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">
                          Draft
                        </span>
                      )}
                      {prompt.useDraft && (
                        <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">
                          Testing
                        </span>
                      )}
                      {!prompt.draft && !prompt.useDraft && (
                        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                          Production
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Main editor area */}
          <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md">
            {selectedPromptData ? (
              <>
                <div className="mb-4">
                  <h2 className="text-2xl font-bold mb-2">{selectedPromptData.name}</h2>
                  <p className="text-gray-600 mb-4">{selectedPromptData.description}</p>

                  {/* Status indicators */}
                  <div className="flex gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Status:</span>
                      {selectedPromptData.useDraft ? (
                        <span className="bg-green-200 text-green-800 px-3 py-1 rounded">
                          Testing Draft
                        </span>
                      ) : selectedPromptData.draft ? (
                        <span className="bg-yellow-200 text-yellow-800 px-3 py-1 rounded">
                          Draft Saved
                        </span>
                      ) : (
                        <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded">
                          Production Only
                        </span>
                      )}
                    </div>
                    {selectedPromptData.lastModified && (
                      <div className="text-sm text-gray-500">
                        Last modified: {new Date(selectedPromptData.lastModified).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* Action message */}
                  {actionMessage && (
                    <div
                      className={`p-3 rounded mb-4 ${
                        actionMessage.type === 'success'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {actionMessage.text}
                      {actionMessage.commitUrl && (
                        <a
                          href={actionMessage.commitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 underline font-mono text-sm"
                        >
                          View on GitHub →
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Editor */}
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full h-96 p-4 border rounded font-mono text-sm resize-y"
                  dir="rtl"
                  lang="he"
                  placeholder="Edit prompt here..."
                />

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3 mt-4">
                  <button
                    onClick={handleSaveDraft}
                    className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={actionLoading || editedContent === selectedPromptData.production}
                  >
                    Save Draft
                  </button>

                  {selectedPromptData.draft && !selectedPromptData.useDraft && (
                    <button
                      onClick={handleActivateDraft}
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                      disabled={actionLoading}
                    >
                      🧪 Test Draft
                    </button>
                  )}

                  {selectedPromptData.useDraft && (
                    <button
                      onClick={handleDeactivateDraft}
                      className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                      disabled={actionLoading}
                    >
                      Stop Testing
                    </button>
                  )}

                  {selectedPromptData.draft && (
                    <button
                      onClick={handleDiscardDraft}
                      className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                      disabled={actionLoading}
                    >
                      Discard Draft
                    </button>
                  )}

                  {selectedPromptData.draft && (
                    <button
                      onClick={() => setShowCommitWarning(true)}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                      disabled={actionLoading}
                    >
                      📤 Commit & Deploy
                    </button>
                  )}
                </div>

                {/* Commit warning modal */}
                {showCommitWarning && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
                      <h3 className="text-xl font-bold mb-4">🚀 Confirm Deployment</h3>
                      <p className="mb-4">
                        Are you sure you want to commit <strong>{selectedPromptData?.name}</strong> to production?
                      </p>
                      <ul className="list-disc ml-5 mb-4 space-y-1 text-sm">
                        <li>Promote draft → production in Firestore <span className="text-green-700 font-medium">(takes effect immediately)</span></li>
                        <li>Commit updated <code className="bg-gray-100 px-1 rounded">lib/prompts.ts</code> to GitHub</li>
                        <li>Firebase App Hosting will auto-redeploy from the new commit</li>
                      </ul>
                      <div className="flex gap-3">
                        <button
                          onClick={handleCommit}
                          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer"
                        >
                          Yes, Commit & Deploy
                        </button>
                        <button
                          onClick={() => setShowCommitWarning(false)}
                          className="flex-1 bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Info panel */}
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
                  <h3 className="font-bold mb-2">💡 How it works:</h3>
                  <ul className="text-sm space-y-1">
                    <li><strong>Save Draft:</strong> Save changes without affecting users</li>
                    <li><strong>Test Draft:</strong> Use draft for analyses (only you see it)</li>
                    <li><strong>Stop Testing:</strong> Return to production version</li>
                    <li><strong>Discard Draft:</strong> Delete draft and revert to production</li>
                    <li><strong>Commit &amp; Deploy:</strong> Promotes draft to Firestore production (immediate) + commits <code className="bg-blue-100 px-1 rounded">lib/prompts.ts</code> to GitHub → triggers Firebase auto-redeploy</li>
                  </ul>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500 py-20">
                Select a prompt from the list to edit
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
