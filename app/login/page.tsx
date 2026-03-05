
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmail, signInWithGoogle } from '../../lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { user, error } = await signInWithEmail(email, password);
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      router.push('/');
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const { user, error } = await signInWithGoogle();
    setLoading(false);
    if (error) {
      setError(error);
    } else if (user) {
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-center mb-6">Login</h1>
        {error && <p className="text-red-500 text-center mb-4">{error}</p>}
        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            placeholder="Email" 
            disabled={loading}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            placeholder="Password" 
            disabled={loading}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign In with Email'}
          </button>
        </form>
        <div className="my-4 text-center text-slate-500">OR</div>
        <button 
          onClick={handleGoogleSignIn} 
          disabled={loading}
          className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? 'Signing in...' : 'Sign In with Google'}
        </button>
        <p className="text-center mt-4">
          Don't have an account? <a href="/signup" className="text-indigo-600 hover:underline">Sign Up</a>
        </p>
      </div>
    </div>
  );
}
