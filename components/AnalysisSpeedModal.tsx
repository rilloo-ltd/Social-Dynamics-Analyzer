'use client';

import { Clock3, Sparkles, X } from 'lucide-react';
import { AnalysisDepthMode } from '@/types';

interface AnalysisSpeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (mode: AnalysisDepthMode) => void;
}

const OPTION_STYLES: Record<AnalysisDepthMode, string> = {
  standard: 'from-slate-900 to-slate-700 text-white shadow-slate-300',
  deep: 'from-indigo-600 to-violet-600 text-white shadow-indigo-300',
};

export default function AnalysisSpeedModal({
  isOpen,
  onClose,
  onSelect,
}: AnalysisSpeedModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-indigo-100 via-sky-50 to-cyan-100 p-6 md:p-8" dir="rtl">
          <div className="relative">
            <button
              type="button"
              onClick={onClose}
              className="absolute left-0 top-0 rounded-full p-2 text-slate-500 transition-colors hover:bg-white/80 cursor-pointer"
              title="סגור"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="pr-2">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-indigo-700 shadow-sm">
                <Sparkles className="h-4 w-4" />
                בחירת סוג הניתוח
              </div>
              <h2 className="text-3xl font-black text-slate-900 md:text-4xl">איזה סוג ניתוח תרצו עכשיו?</h2>
              <p className="mt-3 max-w-2xl text-base leading-8 text-slate-600">
                אפשר לבחור מחדש בכל בקשה. ברירת המחדל היא ניתוח מהיר.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8" dir="rtl">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => onSelect('standard')}
              className={`rounded-[1.75rem] border border-slate-900 bg-gradient-to-br p-6 text-right transition-all hover:-translate-y-0.5 hover:shadow-xl cursor-pointer ${OPTION_STYLES.standard}`}
            >
              <div className="mb-4 flex items-center justify-between">
                <Clock3 className="h-6 w-6 text-white" />
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white">
                  ברירת מחדל
                </span>
              </div>
              <h3 className="text-xl font-black text-white">ניתוח מהיר</h3>
              <p className="mt-3 text-sm leading-7 text-slate-100">
                מתאים כשרוצים תשובה מהירה יותר ולהתחיל מיד.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onSelect('deep')}
              className={`rounded-[1.75rem] border border-indigo-700 bg-gradient-to-br p-6 text-right transition-all hover:-translate-y-0.5 hover:shadow-xl cursor-pointer ${OPTION_STYLES.deep}`}
            >
              <div className="mb-4 flex items-center justify-between">
                <Sparkles className="h-6 w-6 text-white" />
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white">
                  יסודי יותר
                </span>
              </div>
              <h3 className="text-xl font-black text-white">ניתוח איטי ומעמיק</h3>
              <p className="mt-3 text-sm leading-7 text-indigo-50">
                מתאים כשרוצים תשובה עשירה יותר ומוכנים לחכות קצת יותר.
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
