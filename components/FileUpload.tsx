'use client';

import React, { useState } from 'react';
import JSZip from 'jszip';

interface FileUploadProps {
  onFileLoaded: (content: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileLoaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const processFile = async (file: File) => {
    setIsLoading(true);
    try {
      // Check for ZIP file
      if (
        file.name.toLowerCase().endsWith('.zip') || 
        file.type === 'application/zip' || 
        file.type === 'application/x-zip-compressed'
      ) {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);
        
        // Find the first .txt file in the zip (usually _chat.txt)
        const txtFile = Object.values(zipContent.files).find(
          (f: any) => !f.dir && f.name.toLowerCase().endsWith('.txt')
        ) as any;

        if (txtFile) {
          const content = await txtFile.async('string');
          onFileLoaded(content);
        } else {
          alert('לא נמצא קובץ טקסט (txt) בתוך קובץ ה-ZIP. אנא ודא שהקובץ תקין.');
        }
      } 
      // Check for Text file
      else if (file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          onFileLoaded(text);
        };
        reader.readAsText(file);
      } else {
        alert('אנא העלה קובץ מסוג TXT או ZIP בלבד.');
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('אירעה שגיאה בעיבוד הקובץ. נסה להעלות את קובץ ה-TXT ישירות.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      // Reset the input value so the same file can be selected again
      e.target.value = '';
    }
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
      className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-all duration-300 relative ${
        isDragging 
          ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
          : 'border-slate-300 bg-white hover:border-blue-400 shadow-sm'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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

      <label className={`relative cursor-pointer font-bold py-2.5 px-8 rounded-full transition duration-300 shadow-md ${
        isDragging || isLoading ? 'bg-blue-700 text-white pointer-events-none' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
      }`}>
        <span>בחר קובץ מהמכשיר</span>
        <input 
          type="file" 
          className="hidden" 
          accept=".txt,.zip" 
          onChange={handleFileChange}
        />
      </label>
    </div>
  );
};
