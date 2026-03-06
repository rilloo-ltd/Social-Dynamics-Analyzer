
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmail, signInWithGoogle } from '../../lib/auth';
import { LOGO_URL } from '@/lib/constants';
import { Mail, Lock, AlertCircle } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 left-1/3 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-md w-full">
        {/* Logo and Header */}
        <div className="text-center mb-8 animate-fadeIn">
          <div className="flex justify-center mb-4">
            <img 
              src={LOGO_URL} 
              alt="Logo" 
              className="w-20 h-20 rounded-full shadow-2xl border-4 border-white/50"
            />
          </div>
          <h1 className="text-4xl font-black text-white mb-2" dir="rtl">ברוכים השבים!</h1>
          <p className="text-white/80 text-sm" dir="rtl">התחברו כדי להמשיך לניתוחים הפסיכולוגיים שלכם</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 backdrop-blur-sm border border-white/20 animate-slideUp">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-shake" dir="rtl">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Google Sign In Button */}
          <button 
            onClick={handleGoogleSignIn} 
            disabled={loading}
            className="w-full bg-white border-2 border-slate-200 text-slate-700 py-3.5 px-4 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-3 font-semibold shadow-sm hover:shadow-md mb-6 group"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>{loading ? 'מתחבר...' : 'התחבר עם Google'}</span>
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-500 font-medium">או עם אימייל</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2 text-right" dir="rtl">
                כתובת אימייל
              </label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="your@email.com" 
                  disabled={loading}
                  className="w-full pr-11 pl-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:bg-slate-50 transition-all"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2 text-right" dir="rtl">
                סיסמה
              </label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="••••••••" 
                  disabled={loading}
                  className="w-full pr-11 pl-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:bg-slate-50 transition-all"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3.5 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-bold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 mt-6"
            >
              {loading ? 'מתחבר...' : 'התחבר'}
            </button>
          </form>

          {/* Sign Up Link */}
          <p className="text-center mt-6 text-slate-600" dir="rtl">
            עדיין אין לך חשבון?{' '}
            <a href="/signup" className="text-indigo-600 hover:text-indigo-700 font-semibold hover:underline transition-colors">
              הירשם כאן
            </a>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center mt-6 text-white/70 text-sm" dir="rtl">
          בהתחברות, אתה מסכים{' '}
          <a href="#" className="underline hover:text-white transition-colors">לתנאי השימוש</a>
          {' '}ו
          <a href="#" className="underline hover:text-white transition-colors">למדיניות הפרטיות</a>
        </p>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out both;
        }
        
        .animate-slideUp {
          animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
        }

        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}
