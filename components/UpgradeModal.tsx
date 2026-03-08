'use client';

import React, { useState } from 'react';
import { Sparkles, Zap, TrendingUp, RefreshCw } from 'lucide-react';
import { PayPalButtons } from '@paypal/react-paypal-js';
import { useRouter } from 'next/navigation';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (tier: 'basic' | 'super') => void;
  currentCount: number;
  maxUploads: number;
  userId?: string;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ 
  isOpen, 
  onClose, 
  onUpgrade,
  currentCount,
  maxUploads,
  userId
}) => {
  const router = useRouter();
  const [selectedTier, setSelectedTier] = useState<'basic' | 'super' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const tierPrices = {
    basic: '5.00',
    super: '30.00'
  };

  const handleReset = async () => {
    if (!userId) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/reset-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ המגבלה אופסה בהצלחה! אתה יכול להמשיך להעלות קבצים.');
        onClose();
        router.refresh();
      } else {
        alert('שגיאה באיפוס המגבלה. אנא נסה שוב.');
      }
    } catch (error) {
      console.error('Reset error:', error);
      alert('שגיאה באיפוס המגבלה. אנא נסה שוב.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = async (orderId: string) => {
    if (!selectedTier || !userId) return;

    setIsProcessing(true);

    try {
      const response = await fetch('/api/paypal-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId as string, // Type assertion: userId is guaranteed to be string here
          orderId,
          tier: selectedTier,
          amount: parseFloat(tierPrices[selectedTier])
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`🎉 תשלום התקבל בהצלחה! שודרגת למנוי ${selectedTier === 'basic' ? 'בסיסי' : 'על'}!`);
        onUpgrade(selectedTier);
        onClose();
        router.refresh();
      } else {
        alert('שגיאה באימות התשלום. אנא צור קשר עם התמיכה.');
      }
    } catch (error) {
      console.error('Payment processing error:', error);
      alert('שגיאה בעיבוד התשלום. אנא נסה שוב.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity cursor-pointer" 
        onClick={onClose} 
      />
      
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-slideUp border-2 border-slate-100">
        {/* Gradient Header */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-40 h-40 bg-white rounded-full translate-x-1/3 translate-y-1/3"></div>
          </div>
          
          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2" dir="rtl">
              הגעת למגבלה היומית! 🎉
            </h2>
            <p className="text-white/90 text-sm" dir="rtl">
              השתמשת ב-{currentCount} מתוך {maxUploads} ניתוחים בחינם להיום
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 text-right" dir="rtl">
          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="bg-indigo-200 p-2 rounded-lg mt-0.5">
                <Zap className="w-5 h-5 text-indigo-700" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 mb-1">ניתוחים ללא הגבלה</h3>
                <p className="text-sm text-slate-600">קבל גישה לניתוחים בלתי מוגבלים ביום</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl border border-purple-100">
              <div className="bg-purple-200 p-2 rounded-lg mt-0.5">
                <TrendingUp className="w-5 h-5 text-purple-700" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 mb-1">ניתוחים מתקדמים</h3>
                <p className="text-sm text-slate-600">גישה מוקדמת לפיצ'רים חדשים ומתקדמים</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-pink-50 rounded-xl border border-pink-100">
              <div className="bg-pink-200 p-2 rounded-lg mt-0.5">
                <Sparkles className="w-5 h-5 text-pink-700" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 mb-1">תמיכה עדיפות</h3>
                <p className="text-sm text-slate-600">קבל תמיכה מהירה וגישה לסטטיסטיקות מתקדמות</p>
              </div>
            </div>
          </div>

          {/* Pricing Tiers */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            {/* Basic Tier */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-5 border-2 border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-blue-900">מנוי בסיסי</h3>
                  <p className="text-sm text-blue-700">10 ניתוחים ביום</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-blue-900">
                    $5
                  </div>
                  <span className="text-xs text-blue-600">תשלום חד-פעמי</span>
                </div>
              </div>
              
              {selectedTier === 'basic' && userId ? (
                <div className="mt-3">
                  <PayPalButtons
                    style={{ layout: 'horizontal', label: 'pay', tagline: false }}
                    disabled={isProcessing}
                    createOrder={(data, actions) => {
                      return actions.order.create({
                        intent: 'CAPTURE',
                        purchase_units: [{
                          amount: {
                            currency_code: 'USD',
                            value: tierPrices.basic
                          },
                          description: 'מנוי בסיסי - 10 ניתוחים ביום'
                        }]
                      });
                    }}
                    onApprove={async (data, actions) => {
                      if (!actions.order) return;
                      const details = await actions.order.capture();
                      if (details.id) {
                        await handlePaymentSuccess(details.id);
                      }
                    }}
                    onError={(err) => {
                      console.error('PayPal error:', err);
                      alert('שגיאה בתשלום. אנא נסה שוב.');
                    }}
                  />
                </div>
              ) : (
                <button 
                  onClick={() => setSelectedTier('basic')}
                  className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all shadow-md cursor-pointer"
                  disabled={isProcessing}
                >
                  {isProcessing ? 'מעבד...' : 'בחר מנוי בסיסי'}
                </button>
              )}
            </div>

            {/* Super Tier */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-100 rounded-2xl p-5 border-2 border-purple-300 relative overflow-hidden">
              <div className="absolute top-2 left-2 bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md z-10">
                הכי פופולרי ⭐
              </div>
              <div className="flex items-center justify-between mb-3 mt-2">
                <div>
                  <h3 className="text-lg font-bold text-purple-900">מנוי-על</h3>
                  <p className="text-sm text-purple-700">50 ניתוחים ביום</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-purple-900">
                    $30
                  </div>
                  <span className="text-xs text-purple-600">תשלום חד-פעמי</span>
                </div>
              </div>
              
              {selectedTier === 'super' && userId ? (
                <div className="mt-3">
                  <PayPalButtons
                    style={{ layout: 'horizontal', label: 'pay', tagline: false }}
                    disabled={isProcessing}
                    createOrder={(data, actions) => {
                      return actions.order.create({
                        intent: 'CAPTURE',
                        purchase_units: [{
                          amount: {
                            currency_code: 'USD',
                            value: tierPrices.super
                          },
                          description: 'מנוי-על - 50 ניתוחים ביום'
                        }]
                      });
                    }}
                    onApprove={async (data, actions) => {
                      if (!actions.order) return;
                      const details = await actions.order.capture();
                      if (details.id) {
                        await handlePaymentSuccess(details.id);
                      }
                    }}
                    onError={(err) => {
                      console.error('PayPal error:', err);
                      alert('שגיאה בתשלום. אנא נסה שוב.');
                    }}
                  />
                </div>
              ) : (
                <button 
                  onClick={() => setSelectedTier('super')}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm hover:from-purple-700 hover:to-pink-700 transition-all shadow-md cursor-pointer"
                  disabled={isProcessing}
                >
                  {isProcessing ? 'מעבד...' : 'בחר מנוי-על'}
                </button>
              )}
            </div>
          </div>

          {selectedTier && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-sm text-blue-800 font-medium">
                {selectedTier === 'basic' ? '✓ בחרת מנוי בסיסי' : '✓ בחרת מנוי-על'}
              </p>
            </div>
          )}

          <p className="text-xs text-center text-slate-500 mb-4">תשלום מאובטח דרך PayPal • גישה מיידית</p>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            {userId && (
              <button
                onClick={handleReset}
                disabled={isProcessing}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold hover:from-green-700 hover:to-emerald-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-5 h-5 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>{isProcessing ? 'מאפס...' : 'אפס מגבלה (לבדיקות)'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-white text-slate-600 font-medium border-2 border-slate-200 hover:bg-slate-50 transition-all cursor-pointer"
            >
              אולי מאוחר יותר
            </button>
          </div>

          <p className="text-xs text-center text-slate-400 mt-4">
            המגבלה תתאפס מחר בחצות 🌙
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out both;
        }
        
        .animate-slideUp {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
    </div>
  );
};
