import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

interface Stats {
  files: { timestamp: string; participantsCount: number }[];
  tokens: { totalInput: number; totalOutput: number; totalCostUsd: number };
  buttonPresses: Record<string, number>;
}

export const AdminPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');

  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const fetchDebugLogs = async () => {
    try {
      const res = await fetch('/api/debug/logs');
      if (res.ok) {
        const data = await res.json();
        setDebugLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Failed to fetch debug logs');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    
    try {
      console.log('Attempting login...');
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      
      console.log('Login response status:', res.status);
      
      if (res.ok) {
        setIsAuthenticated(true);
        fetchStats();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Invalid password');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Login failed. Please check your connection.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        console.error('Failed to fetch stats:', res.status);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-lg shadow-md w-96">
          <h2 className="text-2xl font-bold mb-6 text-center">Admin Login</h2>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full p-2 border rounded mb-4"
            disabled={isLoggingIn}
          />
          {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
          <button 
            type="submit" 
            className={`w-full text-white p-2 rounded transition-colors ${isLoggingIn ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="fixed bottom-4 right-4">
          <button 
            onClick={() => { setShowDebug(!showDebug); if (!showDebug) fetchDebugLogs(); }}
            className="bg-gray-800 text-white px-4 py-2 rounded-full text-xs shadow-lg hover:bg-gray-700"
          >
            {showDebug ? 'Hide Debug Logs' : 'Show Debug Logs'}
          </button>
        </div>

        {showDebug && (
          <div className="fixed bottom-16 right-4 w-96 h-64 bg-black text-green-400 p-4 rounded-lg shadow-2xl overflow-auto text-xs font-mono border border-gray-700 z-50">
            <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-1">
              <span className="font-bold">Server Logs (Last 50 lines)</span>
              <button onClick={fetchDebugLogs} className="text-white hover:text-blue-300">Refresh</button>
            </div>
            {debugLogs.length === 0 ? (
              <p className="text-gray-500 italic">No logs found yet...</p>
            ) : (
              debugLogs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap mb-1 border-b border-gray-900 pb-1">{log}</div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  if (loading || !stats) {
    return <div className="p-8 text-center">Loading stats...</div>;
  }

  // Process data for charts
  const now = new Date();
  const cutoffDate = new Date();
  if (timeRange === 'week') cutoffDate.setDate(now.getDate() - 7);
  if (timeRange === 'month') cutoffDate.setDate(now.getDate() - 30);
  if (timeRange === 'year') cutoffDate.setDate(now.getDate() - 365);

  const filteredFiles = stats.files.filter(f => new Date(f.timestamp) >= cutoffDate);

  const filesByDate = filteredFiles.reduce((acc, file) => {
    const date = new Date(file.timestamp).toISOString().split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const fileChartData = Object.entries(filesByDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  const buttonChartData = Object.entries(stats.buttonPresses).map(([name, count]) => ({ name, count }));

  const participants = stats.files.map(f => f.participantsCount);
  const minParticipants = participants.length ? Math.min(...participants) : 0;
  const maxParticipants = participants.length ? Math.max(...participants) : 0;
  const avgParticipants = participants.length ? (participants.reduce((a, b) => a + b, 0) / participants.length).toFixed(1) : 0;

  const avgTokensPerFile = stats.files.length ? ((stats.tokens.totalInput + stats.tokens.totalOutput) / stats.files.length).toFixed(0) : 0;
  const avgCostPerFile = stats.files.length ? (stats.tokens.totalCostUsd / stats.files.length).toFixed(4) : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="ltr">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">Admin Dashboard</h1>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-gray-500 text-sm font-medium">Total Files Uploaded</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.files.length}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-gray-500 text-sm font-medium">Total Token Cost</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">${stats.tokens.totalCostUsd.toFixed(2)}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-gray-500 text-sm font-medium">Total Tokens Used</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">{(stats.tokens.totalInput + stats.tokens.totalOutput).toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-gray-500 text-sm font-medium">Avg Cost per File</h3>
            <p className="text-3xl font-bold text-purple-600 mt-2">${avgCostPerFile}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-gray-500 text-sm font-medium">Avg Tokens per File</h3>
            <p className="text-3xl font-bold text-indigo-600 mt-2">{Number(avgTokensPerFile).toLocaleString()}</p>
          </div>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Uploads Over Time</h3>
              <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                {(['week', 'month', 'year'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-1 text-sm rounded-md transition-all ${
                      timeRange === range ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {range.charAt(0).toUpperCase() + range.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fileChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#8884d8" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-bold mb-4">Button Usage</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buttonChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h3 className="text-lg font-bold mb-4">Participant Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-gray-500 text-sm">Smallest Group</p>
              <p className="text-2xl font-bold">{minParticipants}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Largest Group</p>
              <p className="text-2xl font-bold">{maxParticipants}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Average Participants</p>
              <p className="text-2xl font-bold">{avgParticipants}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
