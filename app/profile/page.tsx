'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { AlertCircle, Calendar, CheckCircle, Loader2, LogOut, X } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getStoredTestAuthEmail, logOut } from '@/lib/auth';
import { LOGO_URL } from '@/lib/constants';

interface SubmissionQuota {
  currentCount: number;
  maxSubmissions: number;
  remainingSubmissions: number;
  resetAt: string | null;
}

interface UserData {
  subscriptionId?: string;
  subscriptionStatus?: string;
  nextBillingDate?: string;
  email?: string;
}

interface Transaction {
  id: string;
  type: string;
  amount?: number;
  currency?: string;
  timestamp: string;
  subscriptionId?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [testAuthEmail, setTestAuthEmail] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [quota, setQuota] = useState<SubmissionQuota>({ currentCount: 0, maxSubmissions: 3, remainingSubmissions: 3, resetAt: null });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        const storedTestAuthEmail = getStoredTestAuthEmail();
        if (storedTestAuthEmail) {
          setTestAuthEmail(storedTestAuthEmail);
          setLoading(false);
          return;
        }

        router.push('/login');
        return;
      }

      setTestAuthEmail(null);
      setUser(currentUser);
      void fetchUserData(currentUser);
    });

    return () => unsubscribe();
  }, [router]);

  const fetchUserData = async (currentUser: User) => {
    try {
      setLoading(true);
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/user-data?userId=${currentUser.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (data.success) {
        setUserData(data.userData || {});
        setQuota(data.submissionQuota || { currentCount: 0, maxSubmissions: 3, remainingSubmissions: 3, resetAt: null });
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user || !userData?.subscriptionId) return;

    if (!confirm('לבטל את המנוי הקיים ב-PayPal?')) {
      return;
    }

    setCancelLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.uid, subscriptionId: userData.subscriptionId }),
      });
      const data = await response.json();

      if (data.success) {
        alert('המנוי בוטל בהצלחה.');
        await fetchUserData(user);
      } else {
        alert(data.error || 'שגיאה בביטול המנוי. אנא נסה שוב.');
      }
    } catch (error) {
      console.error('Cancel subscription error:', error);
      alert('שגיאה בביטול המנוי. אנא נסה שוב.');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleLogout = async () => {
    await logOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-slate-700" />
          <p className="text-slate-600">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  const email = user?.email || testAuthEmail || userData?.email || '';
  const resetLabel = quota.resetAt
    ? new Date(quota.resetAt).toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const hasLegacyActiveSubscription = Boolean(userData?.subscriptionId && userData.subscriptionStatus === 'ACTIVE');

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <button type="button" onClick={() => router.push('/')} className="flex items-center gap-3 cursor-pointer">
            <img src={LOGO_URL} alt="" className="h-10 w-10 rounded-full" />
            <span className="font-black text-slate-900">הדודה</span>
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            התנתק
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-black text-slate-900">הפרופיל שלי</h1>
          <p className="mt-2 text-sm text-slate-600">{email}</p>
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-900">מכסת העלאות</h2>
              <p className="mt-1 text-sm text-slate-600">אפשר לשלוח 3 קבצים או טקסטים בכל 24 שעות.</p>
            </div>
            <div className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">
              {quota.remainingSubmissions} נותרו
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-slate-700">
              <span>שימוש ב-24 השעות האחרונות</span>
              <span>{quota.currentCount} / {quota.maxSubmissions}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-slate-900 transition-all"
                style={{ width: `${Math.min(100, (quota.currentCount / Math.max(quota.maxSubmissions, 1)) * 100)}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {resetLabel ? `העלאה חדשה תתפנה סביב ${resetLabel}.` : 'יש לך מכסה זמינה כרגע.'}
            </p>
          </div>
        </section>

        {hasLegacyActiveSubscription && (
          <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="mb-4 flex items-start gap-3">
              <AlertCircle className="mt-1 h-5 w-5 text-amber-700" />
              <div>
                <h2 className="text-xl font-black text-amber-950">מנוי PayPal קיים</h2>
                <p className="mt-1 text-sm leading-7 text-amber-800">
                  המנוי כבר לא נותן הרשאות נוספות באפליקציה. אפשר לבטל אותו כאן.
                </p>
                {userData?.nextBillingDate && (
                  <p className="mt-2 inline-flex items-center gap-2 text-sm text-amber-800">
                    <Calendar className="h-4 w-4" />
                    חיוב הבא: {new Date(userData.nextBillingDate).toLocaleDateString('he-IL')}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleCancelSubscription}
              disabled={cancelLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
            >
              {cancelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              בטל מנוי
            </button>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-2xl font-black text-slate-900">היסטוריית חיובים ישנה</h2>
          {transactions.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-6 text-center text-slate-600">אין חיובים להצגה.</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                  <div>
                    <div className="font-bold text-slate-800">
                      {transaction.type === 'subscription_activated' && 'מנוי הופעל'}
                      {transaction.type === 'subscription_payment' && 'תשלום חודשי'}
                      {transaction.type === 'subscription_cancelled' && 'מנוי בוטל'}
                      {!['subscription_activated', 'subscription_payment', 'subscription_cancelled'].includes(transaction.type) && transaction.type}
                    </div>
                    <div className="text-sm text-slate-500">{new Date(transaction.timestamp).toLocaleString('he-IL')}</div>
                  </div>
                  {transaction.amount ? (
                    <div className="font-black text-slate-900">${transaction.amount.toFixed(2)}</div>
                  ) : (
                    <CheckCircle className="h-5 w-5 text-slate-400" />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
