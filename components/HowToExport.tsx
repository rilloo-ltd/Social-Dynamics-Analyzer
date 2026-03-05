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
          <span className="text-lg font-bold text-slate-700">איך מייצאים צ'אט מוואטסאפ? (מדריך קצר)</span>
        </div>
        <div className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? 'max-h-[800px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
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
                <li>4. בחרו באפשרות <b>ללא מדיה (Without Media)</b> - זה חשוב!</li>
                <li>5. שמרו את הקובץ ב"קבצים" (Files) או שלחו אותו לעצמכם במייל/טלגרם.</li>
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
          <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3 items-start">
            <div className="text-amber-500 mt-1"><Sparkles className="w-5 h-5" /></div>
            <div>
              <h5 className="font-bold text-amber-800 text-sm mb-1">השלב האחרון: העלאה לאתר</h5>
              <p className="text-amber-700 text-xs">
                אחרי ששמרתם את קובץ ה-ZIP או ה-TXT, פשוט <b>גררו אותו</b> לריבוע הלבן כאן למטה, או לחצו עליו כדי לבחור את הקובץ מהמחשב/טלפון.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
