'use client';

import React, { useState } from 'react';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';
import { readChatUploadFile } from '@/lib/chat-file-utils';

interface FileUploadProps {
  onFileLoaded: (content: string) => void;
  canUpload?: boolean;
  onAuthRequired?: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileLoaded, canUpload = true, onAuthRequired }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!canUpload) {
      onAuthRequired?.();
      return;
    }

    setIsLoading(true);
    try {
      const content = await readChatUploadFile(file, MAX_FILE_SIZE_BYTES);
      onFileLoaded(content);
    } catch (error) {
      console.error('Error processing file:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : 'נסו להעלות את קובץ ה-TXT ישירות, או בדקו שהקובץ תקין.';
      alert(`❌ אירעה שגיאה בעיבוד הקובץ\n\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      e.target.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-all duration-300 relative cursor-pointer ${
        isDragging
          ? 'border-blue-500 bg-blue-50 scale-[1.02]'
          : 'border-slate-300 bg-white hover:border-blue-400 shadow-sm'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".txt,.zip"
        onChange={handleFileChange}
      />
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-blue-600 font-medium">פותח את הקובץ...</p>
        </div>
      )}

      <svg xmlns="http://www.w3.org/2000/svg" className={`h-12 w-12 mb-4 transition-colors ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p className={`text-lg font-bold mb-2 transition-colors ${isDragging ? 'text-blue-600' : 'text-slate-800'}`}>
        {isDragging ? 'שחרר את הקובץ כאן...' : 'העלה קובץ צ\'אט (TXT או ZIP)'}
      </p>

      <div className="text-center max-w-sm mb-6 space-y-4">
        <p className="text-sm text-slate-500">
          ייצא את הצ'אט מוואטסאפ (ללא מדיה), גרור אותו לכאן או בחר קובץ ידנית.
        </p>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-right text-xs text-slate-600 space-y-2 leading-relaxed">
          <p className="flex items-start gap-2">
            <span className="shrink-0 text-base">💡</span>
            <span><b>טיפ לתוצאות מעולות:</b> מומלץ להעלות שיחות עם היסטוריה עשירה - כמו קבוצת משפחה, קבוצת חברים או שיחה אישית ארוכה עם קולגה.</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="shrink-0 text-base">🔒</span>
            <span><b>הפרטיות שלכם מוגנת:</b> המערכת מבצעת אנונימיזציה מלאה במכשיר שלכם. אף אחד מהשמות לא נחשף ל-AI. פרטים נוספים בהסבר הפרטיות המפורט למטה.</span>
          </p>
        </div>
      </div>

      <div className={`font-bold py-2.5 px-8 rounded-full transition duration-300 shadow-md pointer-events-none ${
        isDragging || isLoading ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white'
      }`}>
        <span>בחר קובץ מהמכשיר</span>
      </div>
    </div>
  );
};
