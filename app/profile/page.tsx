'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { LOGO_URL } from '@/lib/constants';
import { 
  CreditCard, 
  Calendar, 
  TrendingUp, 
  X,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  LogOut
} from 'lucide-react';

interface UserData {
  tier: 'free' | 'basic' | 'super';
  maxDailyUploads: number;
  subscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionPlanId?: string;
  nextBillingDate?: string;
  subscriptionStartDate?: string;
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
  const [userData, setUserData] = useState<UserData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/login');
      } else {
        setUser(currentUser);
        fetchUserData(currentUser.uid);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const fetchUserData = async (userId: string) => {
    try {
      setLoading(true);
      
      // Get auth token
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        console.error('No auth token available');
        return;
      }
      
      // Fetch user data
      const response = await fetch(`/api/user-data?userId=${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setUserData(data.userData);
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!userData?.subscriptionId || !user) return;

    const confirmed = confirm('האם אתה בטוח שברצונך לבטל את המנוי? תאבד גישה לתכונות הפרימיום.');
    
    if (!confirmed) return;

    try {
      setCancelLoading(true);
      
      // Get auth token
      const token = await user.getIdToken();
      if (!token) {
        alert('שגיאה באימות. אנא התחבר מחדש.');
        return;
      }
      
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: user.uid,
          subscriptionId: userData.subscriptionId
        })
      });

      const data = await response.json();

      if (data.success) {
        alert('המנוי בוטל בהצלחה. תוכל להמשיך להשתמש עד תאריך החיוב הבא.');
        await fetchUserData(user.uid);
      } else {
        alert('שגיאה בביטול המנוי. אנא צור קשר עם התמיכה.');
      }
    } catch (error) {
      console.error('Cancel subscription error:', error);
      alert('שגיאה בביטול המנוי. אנא נסה שוב.');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  const getTierConfig = (tier: string) => {
    switch (tier) {
      case 'basic':
        return {
          label: 'מנוי בסיסי',
          color: 'from-blue-500 to-blue-600',
          icon: <TrendingUp className="w-6 h-6" />
        };
      case 'super':
        return {
          label: 'מנוי-על',
          color: 'from-purple-500 to-pink-600',
          icon: <CreditCard className="w-6 h-6" />
        };
      default:
        return {
          label: 'חינם',
          color: 'from-slate-500 to-slate-600',
          icon: <AlertCircle className="w-6 h-6" />,
          description: '2 ניתוחים ביום'
        };
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'CANCELLED':
      case 'SUSPENDED':
      case 'EXPIRED':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'פעיל';
      case 'CANCELLED':
        return 'מבוטל';
      case 'SUSPENDED':
        return 'מושהה';
      case 'EXPIRED':
        return 'פג תוקף';
      default:
        return 'לא ידוע';
    }
  };

  const tierConfig = getTierConfig(userData?.tier || 'free');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 left-1/3 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <img 
            src={LOGO_URL} 
            alt="Logo" 
            className="h-12 cursor-pointer hover:scale-105 transition-transform"
            onClick={() => router.push('/')}
          />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>התנתק</span>
          </button>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6">
          <h1 className="text-3xl font-black text-slate-800 mb-6 text-right" dir="rtl">
            הפרופיל שלי
          </h1>

          {/* User Info */}
          <div className="mb-8 p-6 bg-gradient-to-r from-slate-50 to-slate-100 rounded-2xl" dir="rtl">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-slate-800">{user?.email}</div>
                <div className="text-sm text-slate-600">משתמש רשום</div>
              </div>
            </div>
          </div>

          {/* Subscription Status */}
          <div className={`mb-8 p-6 bg-gradient-to-r ${tierConfig.color} rounded-2xl text-white`} dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {tierConfig.icon}
                <div>
                  <div className="text-xl font-bold">{tierConfig.label}</div>
                  <div className="text-sm opacity-90">{userData?.maxDailyUploads} ניתוחים ביום</div>
                </div>
              </div>
              {userData?.subscriptionStatus && (
                <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
                  {getStatusIcon(userData.subscriptionStatus)}
                  <span className="font-bold">{getStatusText(userData.subscriptionStatus)}</span>
                </div>
              )}
            </div>

            {userData?.nextBillingDate && userData.subscriptionStatus === 'ACTIVE' && (
              <div className="flex items-center gap-2 text-sm opacity-90">
                <Calendar className="w-4 h-4" />
                <span>חיוב הבא: {new Date(userData.nextBillingDate).toLocaleDateString('he-IL')}</span>
              </div>
            )}
          </div>

          {/* Subscription Actions */}
          {userData?.subscriptionId && userData.subscriptionStatus === 'ACTIVE' && (
            <div className="mb-8 p-6 bg-red-50 border-2 border-red-200 rounded-2xl" dir="rtl">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-red-800 mb-2">ביטול מנוי</h3>
                  <p className="text-sm text-red-600 mb-4">
                    ביטול המנוי יחזיר אותך למנוי החינם בתום תקופת החיוב הנוכחית.
                  </p>
                  <button
                    onClick={handleCancelSubscription}
                    disabled={cancelLoading}
                    className="px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {cancelLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>מבטל...</span>
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4" />
                        <span>בטל מנוי</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Transaction History */}
          <div dir="rtl">
            <h2 className="text-2xl font-black text-slate-800 mb-4">היסטוריית תשלומים</h2>
            
            {transactions.length === 0 ? (
              <div className="p-8 bg-slate-50 rounded-xl text-center">
                <p className="text-slate-600">אין תשלומים להצגה</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((transaction) => (
                  <div 
                    key={transaction.id} 
                    className="p-4 bg-slate-50 rounded-xl flex items-center justify-between hover:bg-slate-100 transition-all"
                  >
                    <div className="flex-1">
                      <div className="font-bold text-slate-800">
                        {transaction.type === 'subscription_activated' && 'מנוי הופעל'}
                        {transaction.type === 'subscription_payment' && 'תשלום חודשי'}
                        {transaction.type === 'subscription_cancelled' && 'מנוי בוטל'}
                      </div>
                      <div className="text-sm text-slate-600">
                        {new Date(transaction.timestamp).toLocaleString('he-IL')}
                      </div>
                    </div>
                    {transaction.amount && (
                      <div className="text-lg font-bold text-slate-800">
                        ${transaction.amount.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Back Button */}
        <div className="text-center">
          <button
            onClick={() => router.push('/')}
            className="px-8 py-3 bg-white text-purple-600 rounded-2xl font-bold hover:bg-purple-50 transition-all shadow-lg cursor-pointer"
          >
            חזרה לדף הבית
          </button>
        </div>
      </div>
    </div>
  );
}
