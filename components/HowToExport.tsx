'use client';

import React, { useState } from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';

export const HowToExport: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="max-w-3xl mx-auto mb-12">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white/80 backdrop-blur-sm hover:bg-white border-2 border-teal-100 hover:border-teal-300 rounded-2xl p-4 flex items-center justify-between transition-all shadow-sm hover:shadow-md group cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="bg-teal-100 text-teal-600 p-2 rounded-full group-hover:scale-110 transition-transform">
            <HelpCircle className="w-6 h-6" />
          </div>
          <span className="text-lg font-bold text-slate-700">
            איך מייצאים שיחה מוואטסאפ או Slack? (מדריך קצר)
          </span>
        </div>
        <div className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      <div
        className={`overflow-hidden transition-all duration-500 ease-in-out ${
          isOpen ? 'max-h-[1500px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-right">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="font-bold text-teal-700 text-lg mb-4 flex items-center gap-2">
                <span className="bg-teal-100 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                באייפון (iPhone)
              </h4>
              <ol className="space-y-3 text-slate-600 text-sm leading-relaxed">
                <li>1. פתחו את הצ'אט שתרצו לנתח בוואטסאפ.</li>
                <li>2. לחצו על <b>שם איש הקשר</b> או <b>שם הקבוצה</b> בראש המסך.</li>
                <li>3. גללו למטה עד הסוף ולחצו על <b>ייצוא צ'אט (Export Chat)</b>.</li>
                <li>4. בחרו באפשרות <b>ללא מדיה (Without Media)</b> וזה חשוב.</li>
                <li>5. שמרו את הקובץ ב"קבצים" (Files) או שלחו אותו לעצמכם במייל או בטלגרם.</li>
              </ol>
            </div>

            <div>
              <h4 className="font-bold text-indigo-700 text-lg mb-4 flex items-center gap-2">
                <span className="bg-indigo-100 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                באנדרואיד (Android)
              </h4>
              <ol className="space-y-3 text-slate-600 text-sm leading-relaxed">
                <li>1. פתחו את הצ'אט שתרצו לנתח.</li>
                <li>2. לחצו על <b>שלוש הנקודות (⋮)</b> בפינה העליונה.</li>
                <li>3. בחרו ב-<b>עוד (More)</b> ואז <b>ייצוא צ'אט (Export Chat)</b>.</li>
                <li>4. בחרו באפשרות <b>ללא מדיה (Without Media)</b>.</li>
                <li>5. שמרו את הקובץ או שלחו אותו לעצמכם כדי שתוכלו להעלות אותו כאן.</li>
              </ol>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-sky-100 text-sky-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">3</span>
              <h4 className="font-bold text-sky-700 text-lg">ב-Slack</h4>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6">
              <div className="bg-sky-50/70 rounded-2xl border border-sky-100 p-5">
                <ol className="space-y-3 text-slate-600 text-sm leading-relaxed">
                  <li>1. מהמחשב, לחצו על <b>Admin</b> בסרגל הצד של Slack.</li>
                  <li>2. בחרו <b>Workspace settings</b>, ואז לחצו על <b>Security</b>.</li>
                  <li>3. לחצו על <b>Import &amp; export data</b>.</li>
                  <li>4. עברו ללשונית <b>Export</b>.</li>
                  <li>5. בחרו את טווח התאריכים או את סוג הייצוא שזמין לכם.</li>
                  <li>6. לחצו על <b>Start Export</b>. Slack ישלחו לכם אימייל כשהקובץ יהיה מוכן.</li>
                  <li>7. פתחו את האימייל, עברו לעמוד הייצוא, ולחצו על ההורדה כדי לקבל את קובץ ה-<b>ZIP</b>.</li>
                </ol>
              </div>

              <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
                <h5 className="font-bold text-amber-800 text-sm mb-3">חשוב לדעת</h5>
                <div className="space-y-3 text-xs text-amber-700 leading-relaxed">
                  <p>
                    לפי Slack, ייצוא נתונים זמין בעיקר ל-<b>Workspace Owners</b>, <b>Admins</b>, או למי שיש לו הרשאת
                    <b> Export Admin</b>.
                  </p>
                  <p>
                    הזמינות של הייצוא תלויה גם בתוכנית Slack של הארגון, ולכן ייתכן שלא כל ערוץ או סוג שיחה יהיו זמינים.
                  </p>
                  <p>
                    אם אין לכם הרשאות מתאימות, פשוט העתיקו ידנית את כל הטקסט מהערוץ והדביקו אותו בתיבת הטקסט בדף הראשי.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3 items-start">
            <div className="text-amber-500 mt-1">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-amber-800 text-sm mb-1">השלב האחרון: העלאה לאתר</h5>
              <p className="text-amber-700 text-xs">
                אחרי ששמרתם את קובץ ה-ZIP או ה-TXT, פשוט <b>גררו אותו</b> לריבוע הלבן כאן למטה, או לחצו על הריבוע כדי לבחור
                את הקובץ מהמחשב או מהטלפון.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
