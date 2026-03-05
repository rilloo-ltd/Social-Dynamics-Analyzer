'use client';

import React, { useState, useEffect } from 'react';

interface GroupParticipantSelectorProps {
  isOpen: boolean;
  participants: string[];
  onClose: () => void;
  onConfirm: (selectedParticipants: string[]) => void;
}

export const GroupParticipantSelector: React.FC<GroupParticipantSelectorProps> = ({
  isOpen,
  participants,
  onClose,
  onConfirm,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Initialize with top 15 by default when opening
  useEffect(() => {
    if (isOpen) {
      const top15 = participants.slice(0, 15);
      setSelected(new Set(top15));
    }
  }, [isOpen, participants]);

  const toggleParticipant = (p: string) => {
    const newSet = new Set(selected);
    if (newSet.has(p)) {
      newSet.delete(p);
    } else {
      if (newSet.size >= 15) {
        alert("ניתן לבחור עד 15 משתתפים לניתוח מעמיק.");
        return;
      }
      newSet.add(p);
    }
    setSelected(newSet);
  };

  const selectTop15 = () => {
    const top15 = participants.slice(0, 15);
    setSelected(new Set(top15));
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fadeIn cursor-pointer"
        onClick={onClose}
      />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="p-6 bg-indigo-600 text-white shrink-0">
          <h2 className="text-2xl font-black text-center mb-2">בחירת משתתפים לניתוח</h2>
          <p className="text-indigo-100 text-center text-sm">
            בחר את האנשים שתרצה לכלול בדוח הדינמיקה הקבוצתית (עד 15).
          </p>
        </div>

        {/* Toolbar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
          <button 
            onClick={clearSelection}
            className="text-xs font-bold text-slate-500 hover:text-red-600 px-3 py-1 cursor-pointer"
          >
            נקה הכל
          </button>
          <div className="text-sm font-bold text-slate-700">
            נבחרו: <span className="text-indigo-600">{selected.size}</span>
          </div>
          <button 
            onClick={selectTop15}
            className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 hover:bg-indigo-100 cursor-pointer"
          >
            בחר 15 פעילים
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white" dir="rtl">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {participants.map((p) => {
              const isSelected = selected.has(p);
              return (
                <button
                  key={p}
                  onClick={() => toggleParticipant(p)}
                  className={`
                    p-3 rounded-xl text-right text-sm font-medium transition-all duration-200 border relative overflow-hidden group cursor-pointer
                    ${isSelected 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-[1.02]' 
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <span className="truncate pl-2">{p}</span>
                    {isSelected && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex gap-3">
           <button 
             onClick={onClose}
             className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
           >
             ביטול
           </button>
           <button 
             onClick={() => {
               if (selected.size === 0) {
                 alert("יש לבחור לפחות משתתף אחד.");
                 return;
               }
               onConfirm(Array.from(selected));
             }}
             className="flex-[2] py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-lg flex items-center justify-center gap-2 cursor-pointer"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
             </svg>
             <span>התחל ניתוח קבוצתי</span>
           </button>
        </div>
      </div>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-slideUp { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out both; }
      `}</style>
    </div>
  );
};
