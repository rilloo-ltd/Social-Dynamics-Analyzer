'use client';

import React, { useState } from 'react';
import { X, Sparkles, Gift } from 'lucide-react';
import { redeemPromoCodeAction } from '@/app/actions/admin-actions';

interface PromoCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSuccess: () => void;
}

export default function PromoCodeModal({ isOpen, onClose, userId, onSuccess }: PromoCodeModalProps) {
  const [promoCode, setPromoCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!promoCode.trim()) {
      setErrorMessage('אנא הזן קוד');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await redeemPromoCodeAction(userId, promoCode);
      
      if (result.success) {
        alert(result.message);
        onSuccess();
        onClose();
      } else {
        setErrorMessage(result.message || 'קוד לא תקין');
      }
    } catch (error) {
      console.error('Error redeeming promo code:', error);
      setErrorMessage('אירעה שגיאה. נסה שוב.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-fadeIn">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 text-gray-400 hover:text-gray-600 transition-colors"
          disabled={isLoading}
        >
          <X className="w-6 h-6" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-yellow-100 to-amber-100 rounded-full mb-4">
            <Gift className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            קוד חברים מיוחד
          </h2>
          <p className="text-gray-600 text-sm">
            יש לך קוד? קבל גישה בלתי מוגבלת לאפליקציה! 🎉
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="promoCode" className="block text-sm font-medium text-gray-700 mb-2 text-right">
              הזן קוד
            </label>
            <input
              type="text"
              id="promoCode"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase());
                setErrorMessage('');
              }}
              placeholder="FRIENDS2026"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg text-center text-lg font-mono font-bold tracking-wider uppercase focus:border-amber-500 focus:ring-2 focus:ring-amber-200 focus:outline-none transition-all"
              disabled={isLoading}
              maxLength={20}
            />
          </div>

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !promoCode.trim()}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold rounded-lg hover:from-amber-600 hover:to-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>מאמת קוד...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>הפעל קוד</span>
              </>
            )}
          </button>
        </form>

        {/* Info */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center">
            💡 קוד חברים נותן לך גישה בלתי מוגבלת לניתוחים
          </p>
        </div>
      </div>
    </div>
  );
}
