'use client';

import React from 'react';
import { Clock3, X } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: (tier: 'basic' | 'super') => void;
  currentCount: number;
  maxUploads: number;
  userId?: string;
  resetAt?: string | null;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  currentCount,
  maxUploads,
  resetAt,
}) => {
  if (!isOpen) return null;

  const resetLabel = resetAt
    ? new Date(resetAt).toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
      <button
        type="button"
        aria-label="סגור"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" dir="rtl">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          aria-label="סגור"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="bg-gradient-to-br from-slate-900 to-slate-700 px-8 py-7 text-white">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
            <Clock3 className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-black">מכסת ההעלאות התמלאה</h2>
          <p className="mt-3 text-sm leading-7 text-slate-100">
            אפשר לשלוח עד {maxUploads} קבצים או טקסטים בכל 24 שעות. גם טקסט מודבק נספר כמו קובץ.
          </p>
        </div>

        <div className="space-y-5 p-8">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-sm font-bold text-slate-700">
              <span>שימוש ב-24 השעות האחרונות</span>
              <span>{Math.min(currentCount, maxUploads)} / {maxUploads}</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-slate-800 transition-all"
                style={{ width: `${Math.min(100, (currentCount / Math.max(maxUploads, 1)) * 100)}%` }}
              />
            </div>
          </div>

          <p className="text-sm leading-7 text-slate-600">
            {resetLabel
              ? `ההעלאה הבאה תתאפשר סביב ${resetLabel}.`
              : 'ברגע שאחת ההעלאות האחרונות תהיה בת יותר מ-24 שעות, תתפנה העלאה חדשה.'}
          </p>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-slate-800 cursor-pointer"
          >
            הבנתי
          </button>
        </div>
      </div>
    </div>
  );
};
