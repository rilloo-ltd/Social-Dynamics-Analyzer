'use client';

import { X, Clock3, Sparkles } from 'lucide-react';
import { AnalysisDepthMode } from '@/types';

interface LongChatAnalysisChoiceModalProps {
  isOpen: boolean;
  wordCount: number;
  onClose: () => void;
  onChoose: (mode: AnalysisDepthMode) => void;
}

export default function LongChatAnalysisChoiceModal({
  isOpen,
  wordCount,
  onClose,
  onChoose,
}: LongChatAnalysisChoiceModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-white/60">
        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 p-6 relative text-white">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 text-white hover:bg-white/15 rounded-lg p-1 transition-colors cursor-pointer"
            title="סגור"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="pr-10 text-right" dir="rtl">
            <div className="text-sm text-white/80 font-medium mb-2">
              צ׳אט ארוך במיוחד
            </div>
            <h2 className="text-2xl font-black leading-tight">
              העליתם שיחה של בערך {wordCount.toLocaleString()} מילים
            </h2>
          </div>
        </div>

        <div className="p-6 text-right" dir="rtl">
          <p className="text-slate-700 leading-7 mb-6">
            בצ׳אטים ארוכים במיוחד, למשתמשי Basic ו-Super יש אפשרות להריץ ניתוח מעמיק יותר עם כלים מתקדמים יותר.
            ניתוח כזה עשוי להימשך יותר זמן, אבל הוא יכול להפיק תובנות עשירות יותר לאורך היסטוריה רחבה יותר של השיחה.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => onChoose('deep')}
              className="text-right rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <Sparkles className="w-6 h-6 text-indigo-600" />
                <span className="text-xs font-bold tracking-wide text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full">
                  עמוק יותר
                </span>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">ניתוח עמוק יותר</h3>
              <p className="text-sm text-slate-600 leading-6">
                מתאים אם חשוב לכם לקבל ניתוח מקיף יותר על פני יותר היסטוריה, גם אם ההמתנה תהיה ארוכה יותר.
              </p>
            </button>

            <button
              onClick={() => onChoose('standard')}
              className="text-right rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <Clock3 className="w-6 h-6 text-slate-600" />
                <span className="text-xs font-bold tracking-wide text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
                  מהיר יותר
                </span>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">ניתוח רגיל ומהיר יותר</h3>
              <p className="text-sm text-slate-600 leading-6">
                מתאים אם אתם מעדיפים לקבל את הניתוח מהר יותר, באיכות הרגילה.
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
