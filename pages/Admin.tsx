import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format, parseISO } from 'date-fns';
import { Eye, ChevronDown, ChevronUp, Download, Trash2, Lock } from 'lucide-react';
import { AnalysisType } from '../types';
import { Header } from '../components/Header';
import { auth } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

interface UploadStat {
  timestamp: string;
  participants: number;
}

interface GeminiUsage {
    timestamp: string;
    promptTokens: number;
    responseTokens: number;
    model: string;
}

interface SessionData {
    id: string;
    timestamp: string;
    participants: number;
    anonymizedText: string | any[]; // Handle legacy array format
    chatCode?: string;
    chatOutputs?: Record<string, { output: any, timestamp: string }>;
    buttonsPressed: { buttonId: string, timestamp: string }[];
    shares: { type: string, platform: string, timestamp: string }[];
    geminiUsage: { promptTokens: number, responseTokens: number, model: string, timestamp: string }[];
    imagesGenerated: { model: string, timestamp: string }[];
    feedbacks?: { rating: number, comment: string, timestamp: string }[];
    initialTokenCount?: number;
}

interface StatsData {
  uploads: UploadStat[];
  buttonPresses: Record<string, number>;
  geminiUsage: GeminiUsage[];
  sessions?: Record<string, SessionData>;
}

const INPUT_COST_PER_1M = 0.50; // $0.50 per 1M input tokens
const OUTPUT_COST_PER_1M = 3.00; // $3.00 per 1M output tokens
const IMAGE_INPUT_COST_PER_1M = 0.30; // $0.30 per 1M input tokens for images
const IMAGE_OUTPUT_COST_PER_IMAGE = 0.039; // $0.039 per generated image
const ESTIMATED_IMAGE_PROMPT_TOKENS = 150; // Estimated tokens for the image generation prompt

const ChatViewerModal: React.FC<{ text: string | any[], onClose: () => void }> = ({ text, onClose }) => {
    const displayText = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
    
    return (
        <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="text-lg font-bold">Full Anonymized Chat</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">Close</button>
                </div>
                <div className="flex-1 p-4 overflow-auto bg-gray-50 font-mono text-xs whitespace-pre-wrap" dir="rtl">
                    {displayText}
                </div>
            </div>
        </div>
    );
};

export const AdminPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [viewingSessionText, setViewingSessionText] = useState<string | any[] | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(auth.currentUser);

  useEffect(() => {
    console.log("AdminPage mounted");
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("handleLogin called with password length:", password.length);
    if (!password) {
        alert("Please enter a password");
        return;
    }
    
    try {
      console.log("Fetching /api/admin/login...");
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      console.log("Login response status:", res.status);
      if (res.ok) {
        console.log("Login successful");
        setIsAuthenticated(true);
        fetchStats();
      } else {
        const err = await res.json().catch(() => ({}));
        console.log("Login failed with error:", err);
        alert(err.error || 'Invalid password');
      }
    } catch (error) {
      console.error('Login fetch failed:', error);
      alert('Login failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetCache = async () => {
    if (!confirm("Are you sure you want to reset the cache? This will delete all stored chat outputs.")) return;
    try {
      const res = await fetch('/api/admin/reset-cache', { method: 'POST' });
      if (res.ok) {
        alert("Cache reset successfully");
        fetchStats();
      } else {
        alert("Failed to reset cache");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to reset cache");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <Header user={user} onSignOut={() => auth.signOut()} />
        <div className="flex-1 flex items-center justify-center">
            <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
            <div className="text-center mb-4">
                <span className="text-[10px] text-gray-300 uppercase tracking-widest">Admin Module v1.0.1</span>
            </div>
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Admin Login</h2>
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full p-3 border rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button type="submit" className="w-full bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700 transition-colors mb-4">
                Login
            </button>
            <button 
                type="button"
                onClick={() => alert("JavaScript is working!")}
                className="w-full bg-gray-200 text-gray-700 p-2 rounded-lg text-sm hover:bg-gray-300 transition-colors"
            >
                Test JS (Click me)
            </button>
            </form>
        </div>
      </div>
    );
  }

  if (loading || !stats) {
    return <div className="min-h-screen flex items-center justify-center">Loading stats...</div>;
  }

  const totalUploads = stats.uploads.length;
  const totalButtonPresses = (Object.values(stats.buttonPresses) as number[]).reduce((a, b) => a + b, 0);
  
  // Prepare chart data
  const uploadsByDay = stats.uploads.reduce((acc, curr) => {
    const date = curr.timestamp.split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(uploadsByDay).map(([date, count]) => ({
    date,
    uploads: count
  })).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Header user={user} onSignOut={() => auth.signOut()} showAdmin={false} />
      <div className="max-w-7xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-black text-gray-900">Admin Dashboard</h1>
            <div className="flex gap-4 items-center">
                <button 
                  onClick={handleResetCache}
                  className="bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 border border-red-200 text-sm font-bold"
                >
                  <Trash2 className="w-4 h-4" /> Reset Cache
                </button>
                <button onClick={() => setIsAuthenticated(false)} className="text-sm text-red-600 hover:underline">Logout</button>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Total Uploads</h3>
            <p className="text-4xl font-black text-indigo-600">{totalUploads}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Total Interactions</h3>
            <p className="text-4xl font-black text-purple-600">{totalButtonPresses}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Active Sessions</h3>
            <p className="text-4xl font-black text-green-600">{stats.sessions ? Object.keys(stats.sessions).length : 0}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
          <h2 className="text-xl font-bold mb-6">Upload Activity</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(str) => format(parseISO(str), 'MMM dd')} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(str) => format(parseISO(str), 'MMM dd, yyyy')} />
                <Bar dataKey="uploads" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-xl font-bold">Recent Sessions</h2>
            <button onClick={fetchStats} className="text-sm text-indigo-600 hover:underline">Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-medium">
                <tr>
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Code</th>
                  <th className="px-6 py-3">Participants</th>
                  <th className="px-6 py-3">Tokens (Input | Output)</th>
                  <th className="px-6 py-3">Est. Cost</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                  {stats?.sessions && (Object.values(stats.sessions) as SessionData[]).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((session: any) => {
                    const totalPrompt = session.geminiUsage.reduce((acc: any, curr: any) => acc + curr.promptTokens, 0);
                    const totalResponse = session.geminiUsage.reduce((acc: any, curr: any) => acc + curr.responseTokens, 0);
                    
                    // Text usage comes from geminiUsage
                    const textPrompt = totalPrompt;
                    const textResponse = totalResponse;
                    
                    // Image usage comes from imagesGenerated array
                    const imageCount = session.imagesGenerated ? session.imagesGenerated.length : 0;
                    
                    const initialTokens = session.initialTokenCount || 0;

                    const cost = (textPrompt / 1_000_000 * INPUT_COST_PER_1M) + 
                                 (textResponse / 1_000_000 * OUTPUT_COST_PER_1M) + 
                                 (imageCount * ESTIMATED_IMAGE_PROMPT_TOKENS / 1_000_000 * IMAGE_INPUT_COST_PER_1M) + 
                                 (imageCount * IMAGE_OUTPUT_COST_PER_IMAGE);

                    const isExpanded = expandedSessionId === session.id;

                    return (
                      <React.Fragment key={session.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">{format(parseISO(session.timestamp), 'MMM dd, HH:mm')}</td>
                          <td className="px-6 py-4 font-mono text-xs">{session.chatCode || '-'}</td>
                          <td className="px-6 py-4">{session.participants}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-900">{(totalPrompt + totalResponse).toLocaleString()}</span>
                              <span className="text-xs text-gray-400">P: {totalPrompt.toLocaleString()} | R: {totalResponse.toLocaleString()}</span>
                              {initialTokens > 0 && <span className="text-xs text-indigo-500 mt-1">Upload: {initialTokens.toLocaleString()}</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-medium text-green-600">${cost.toFixed(4)}</td>
                          <td className="px-6 py-4">
                            <button 
                                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                className="text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                            <tr className="bg-gray-50/50">
                                <td colSpan={6} className="px-6 py-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Interactions</h4>
                                            <div className="space-y-2">
                                                {session.buttonsPressed.length > 0 ? (
                                                    session.buttonsPressed.map((btn: any, i: number) => {
                                                      let label = btn.buttonId;
                                                      let type = "Action";
                                                      let color = "bg-gray-100 text-gray-800";

                                                      if (btn.buttonId === 'GROUP_ANALYSIS_INIT') {
                                                        label = "Started Group Analysis";
                                                        type = "Group";
                                                        color = "bg-indigo-100 text-indigo-800";
                                                      } else if (Object.values(AnalysisType).includes(btn.buttonId as AnalysisType)) {
                                                        label = `Analyzed: ${btn.buttonId.replace('_', ' ')}`;
                                                        type = "Analysis";
                                                        color = "bg-purple-100 text-purple-800";
                                                      }

                                                      return (
                                                        <div key={i} className="text-sm flex justify-between items-center border-b border-gray-100 pb-2">
                                                            <div className="flex items-center gap-2">
                                                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${color}`}>{type}</span>
                                                              <span className="font-medium">{label}</span>
                                                            </div>
                                                            <span className="text-gray-400 text-xs font-mono">{format(parseISO(btn.timestamp), 'HH:mm:ss')}</span>
                                                        </div>
                                                      );
                                                    })
                                                ) : <span className="text-sm text-gray-400 italic">No interactions recorded</span>}
                                            </div>

                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-6">Shares</h4>
                                            <div className="space-y-2">
                                                {session.shares && session.shares.length > 0 ? (
                                                    session.shares.map((share: any, i: number) => (
                                                        <div key={i} className="text-sm flex justify-between items-center border-b border-gray-100 pb-2">
                                                            <div className="flex items-center gap-2">
                                                              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">Share</span>
                                                              <span className="font-medium">{share.type.replace('_', ' ')} via {share.platform}</span>
                                                            </div>
                                                            <span className="text-gray-400 text-xs font-mono">{format(parseISO(share.timestamp), 'HH:mm:ss')}</span>
                                                        </div>
                                                    ))
                                                ) : <span className="text-sm text-gray-400 italic">No shares recorded</span>}
                                            </div>

                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-6">Images Generated</h4>
                                            <div className="space-y-2">
                                                {session.imagesGenerated && session.imagesGenerated.length > 0 ? (
                                                    session.imagesGenerated.map((img: any, i: number) => (
                                                        <div key={i} className="text-sm flex justify-between items-center border-b border-gray-100 pb-2">
                                                            <div className="flex items-center gap-2">
                                                              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-800">Image</span>
                                                              <span className="font-medium">Generated Cartoon</span>
                                                            </div>
                                                            <span className="text-gray-400 text-xs font-mono">{format(parseISO(img.timestamp), 'HH:mm:ss')}</span>
                                                        </div>
                                                    ))
                                                ) : <span className="text-sm text-gray-400 italic">No images generated</span>}
                                            </div>

                                            {/* User Feedback Section */}
                                            {session.feedbacks && session.feedbacks.length > 0 && (
                                                <div className="mt-6 pt-6 border-t border-gray-100">
                                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">User Feedback</h4>
                                                    <div className="space-y-3">
                                                        {session.feedbacks.map((fb: any, i: number) => (
                                                            <div key={i} className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                                                                <div className="flex justify-between items-start mb-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-yellow-800">Rating: {fb.rating}/10</span>
                                                                        <span className="text-xs text-gray-400">{format(parseISO(fb.timestamp), 'HH:mm:ss')}</span>
                                                                    </div>
                                                                </div>
                                                                {fb.comment && <p className="text-sm text-gray-700 mt-1 italic">"{fb.comment}"</p>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
                                              Anonymized Text Preview
                                              <button 
                                                onClick={() => setViewingSessionText(session.anonymizedText)}
                                                className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md transition-colors"
                                              >
                                                <Eye className="w-3 h-3" /> View Full Chat
                                              </button>
                                            </h4>
                                            <div className="bg-white p-3 rounded-lg border border-gray-200 text-xs font-mono h-32 overflow-y-auto mb-6" dir="rtl">
                                                {typeof session.anonymizedText === 'string' 
                                                  ? (session.anonymizedText || "No text content available")
                                                  : (Array.isArray(session.anonymizedText) ? "Legacy Log Format (Array)" : "Invalid Content")}
                                            </div>

                                            {/* Chat Outputs Section */}
                                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Generated Outputs</h4>
                                            <div className="space-y-2">
                                                {session.chatOutputs && Object.keys(session.chatOutputs).length > 0 ? (
                                                    Object.entries(session.chatOutputs).map(([type, data]: [string, any]) => (
                                                        <div key={type} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-xs font-bold uppercase text-gray-600">{type.replace(/_/g, ' ')}</span>
                                                                <span className="text-[10px] text-gray-400">{format(parseISO(data.timestamp), 'HH:mm')}</span>
                                                            </div>
                                                            <button 
                                                                onClick={() => setViewingSessionText(JSON.stringify(data.output, null, 2))}
                                                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                                                            >
                                                                <Eye className="w-3 h-3" /> View Output
                                                            </button>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                        No outputs recorded for this session.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {viewingSessionText && (
        <ChatViewerModal text={viewingSessionText} onClose={() => setViewingSessionText(null)} />
      )}
    </div>
  );
};
