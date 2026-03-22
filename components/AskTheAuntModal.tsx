'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, Search, Sparkles, Upload, X } from 'lucide-react';

type AskTheAuntMode = 'person' | 'general';

interface AskTheAuntModalProps {
  isOpen: boolean;
  mode: AskTheAuntMode;
  participants: string[];
  selectedTargetUser: string | null;
  onSelectedTargetUserChange: (value: string | null) => void;
  question: string;
  onQuestionChange: (value: string) => void;
  wantsExtraChats: boolean;
  onWantsExtraChatsChange: (value: boolean) => void;
  extraFiles: File[];
  onExtraFilesSelected: (files: FileList | null) => void;
  onRemoveExtraFile: (index: number) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  errorMessage: string | null;
}

export default function AskTheAuntModal({
  isOpen,
  mode,
  participants,
  selectedTargetUser,
  onSelectedTargetUserChange,
  question,
  onQuestionChange,
  wantsExtraChats,
  onWantsExtraChatsChange,
  extraFiles,
  onExtraFilesSelected,
  onRemoveExtraFile,
  onClose,
  onSubmit,
  submitting,
  errorMessage,
}: AskTheAuntModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const isPersonMode = mode === 'person';
  const activeTarget = selectedTargetUser || participants[0] || '';
  const otherParticipant =
    participants.find((participant) => participant !== activeTarget) || 'האדם השני בצ׳אט';

  const commonQuestions = isPersonMode
    ? [
        `האם נראה ש-${activeTarget} מאוהב/ת ב-${otherParticipant}?`,
        `האם ${activeTarget} כועס/ת על ${otherParticipant}?`,
        `האם ${activeTarget} מנסה להרשים את ${otherParticipant}?`,
        `האם ${activeTarget} מסתיר/ה משהו חשוב?`,
        `האם ${activeTarget} מרגיש/ה שלא באמת מבינים אותו/ה?`,
      ]
    : [];

  useEffect(() => {
    setSelectedTemplate('');
    setIsDraggingFiles(false);
  }, [isOpen, mode, activeTarget]);

  if (!isOpen) return null;

  const handleTemplateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    setSelectedTemplate(nextValue);
    if (nextValue) {
      onQuestionChange(nextValue);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isPersonMode || !wantsExtraChats) return;
    setIsDraggingFiles(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFiles(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFiles(false);

    if (!isPersonMode || !wantsExtraChats) return;
    onExtraFilesSelected(event.dataTransfer.files);
  };

  const handleHiddenInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onExtraFilesSelected(event.target.files);
    event.target.value = '';
  };

  const title = isPersonMode ? 'שאלה ממוקדת על אדם מסוים' : 'שאלה כללית על כל הצ׳אט';
  const description = isPersonMode
    ? 'בחרו משתתף מהצ׳אט המקורי, כתבו שאלה אחת ברורה, ואם צריך אפשר גם לצרף עד 3 צ׳אטים נוספים שיעזרו לדייק את התשובה.'
    : 'כתבו שאלה אחת על הדינמיקה, האירועים או המשמעות של השיחה. במסלול הזה הדודה תענה רק מתוך הצ׳אט שכבר העליתם.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden border border-white/70 flex flex-col">
        <div className="bg-gradient-to-r from-cyan-100 via-sky-50 to-indigo-100 p-6 md:p-8 relative shrink-0" dir="rtl">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 text-slate-500 hover:bg-white/80 rounded-full p-2 transition-colors cursor-pointer"
            title="סגור"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start justify-between gap-4 pr-2">
            <div className="text-right">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-cyan-700 text-sm font-bold shadow-sm mb-4">
                <Sparkles className="w-4 h-4" />
                <span>שאל את הדודה</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight mb-4">
                {title}
              </h2>
              <p className="text-slate-600 text-base md:text-lg leading-8 max-w-3xl">
                {description}
              </p>
            </div>

            <div className="hidden md:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-lg">
              {isPersonMode ? <Search className="w-8 h-8" /> : <FileText className="w-8 h-8" />}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8" dir="rtl">
          <div className="space-y-8">
            {isPersonMode ? (
              <section className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 md:p-6">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 className="text-2xl font-black text-slate-800">על מי השאלה?</h3>
                  <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">
                    בחרו משתתף אחד
                  </span>
                </div>
                <p className="text-slate-500 leading-7 mb-5">
                  בחרו מתוך משתתפי הצ׳אט המקורי. הצ׳אטים הנוספים, אם תצרפו אותם, יסוננו כך שישמרו רק הודעות של האדם הזה או הודעות שמזכירות אותו במפורש.
                </p>
                <div className="max-h-64 overflow-y-auto pr-1">
                  <div className="flex flex-wrap gap-3">
                    {participants.map((participant) => {
                      const isSelected = participant === selectedTargetUser;
                      return (
                        <button
                          key={participant}
                          onClick={() => onSelectedTargetUserChange(participant)}
                          className={`rounded-full border px-5 py-3 text-sm font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-[1.02]'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-cyan-300 hover:bg-cyan-50'
                          }`}
                        >
                          {participant}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-cyan-50 p-5 md:p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-2xl bg-white p-3 text-indigo-600 shadow-sm">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">שאלה על כל הקובץ</h3>
                    <p className="text-slate-600 leading-7">
                      במסלול הזה אין צ׳אטים נוספים ואין בחירת אדם. התשובה תתבסס רק על הקובץ שכבר הועלה.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {isPersonMode && (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">רעיונות לשאלות נפוצות</h3>
                    <p className="text-slate-500 leading-7">
                      אפשר לבחור שאלה לדוגמה, ואז לערוך אותה איך שתרצו.
                    </p>
                  </div>
                  <div className="hidden md:flex rounded-2xl bg-cyan-50 p-3 text-cyan-600">
                    <ChevronDown className="w-5 h-5" />
                  </div>
                </div>

                <div className="relative">
                  <select
                    value={selectedTemplate}
                    onChange={handleTemplateChange}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-700 font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 cursor-pointer"
                  >
                    <option value="">בחרו שאלה נפוצה למילוי מהיר</option>
                    {commonQuestions.map((template) => (
                      <option key={template} value={template}>
                        {template}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-xl font-black text-slate-900">מה תרצו לשאול?</h3>
                  <p className="text-slate-500 leading-7">
                    כתבו שאלה אחת ממוקדת. הדודה תתייחס אליה כשאלה בלבד, ולא כהוראה לשנות את כללי הניתוח.
                  </p>
                </div>
                <div className="hidden md:flex rounded-2xl bg-slate-50 p-3 text-slate-500">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>

              <textarea
                value={question}
                onChange={(event) => onQuestionChange(event.target.value)}
                rows={5}
                placeholder={
                  isPersonMode
                    ? 'למשל: האם נראה שהוא/היא נפגע/ה ממשהו שנכתב כאן?'
                    : 'למשל: מה באמת קרה בין האנשים בשיחה הזו?'
                }
                className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-800 leading-7 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 resize-none"
              />
            </section>

            {isPersonMode && (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
                <h3 className="text-xl font-black text-slate-900 mb-2">רוצים לדייק עם עוד צ׳אטים?</h3>
                <p className="text-slate-500 leading-7 mb-5">
                  אפשר לצרף עד 3 קבצי TXT או ZIP של ייצוא WhatsApp. נשמור רק הודעות של {activeTarget || 'האדם שבחרתם'} או הודעות שמזכירות אותו במפורש.
                </p>

                <div className="flex flex-wrap gap-3 mb-5">
                  <button
                    onClick={() => onWantsExtraChatsChange(false)}
                    className={`rounded-full px-5 py-3 text-sm font-bold border transition-all cursor-pointer ${
                      !wantsExtraChats
                        ? 'bg-slate-900 text-white border-slate-900 shadow-lg'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    לא, הצ׳אט הזה מספיק
                  </button>
                  <button
                    onClick={() => onWantsExtraChatsChange(true)}
                    className={`rounded-full px-5 py-3 text-sm font-bold border transition-all cursor-pointer ${
                      wantsExtraChats
                        ? 'bg-gradient-to-r from-indigo-600 to-cyan-500 text-white border-transparent shadow-lg'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    כן, צרפו עוד צ׳אטים
                  </button>
                </div>

                {wantsExtraChats && (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`w-full rounded-[2rem] border-2 border-dashed p-6 text-right transition-all cursor-pointer ${
                        isDraggingFiles
                          ? 'border-cyan-400 bg-cyan-50 shadow-lg shadow-cyan-100'
                          : 'border-cyan-300 bg-cyan-50/50 hover:border-cyan-400 hover:bg-cyan-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="rounded-2xl bg-cyan-100 p-4 text-cyan-700 shrink-0">
                          <Upload className="w-7 h-7" />
                        </div>
                        <div className="text-right flex-1">
                          <h4 className="text-2xl font-black text-slate-800 mb-2">העלו עד 3 קבצי צ׳אט נוספים</h4>
                          <p className="text-slate-500 leading-7">
                            אפשר לצרף קבצי TXT או ZIP של ייצוא WhatsApp. אם אין לכם הרשאה לייצא, עדיין אפשר להסתפק בצ׳אט המקורי בלבד.
                          </p>
                        </div>
                      </div>
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.zip"
                      multiple
                      className="hidden"
                      onChange={handleHiddenInputChange}
                    />

                    {extraFiles.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-bold text-slate-700 mb-3">
                          קבצים שנבחרו: {extraFiles.length}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {extraFiles.map((file, index) => (
                            <div
                              key={`${file.name}-${file.size}-${file.lastModified}`}
                              className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 text-sm text-slate-700 shadow-sm"
                            >
                              <span className="max-w-[220px] truncate">{file.name}</span>
                              <button
                                onClick={() => onRemoveExtraFile(index)}
                                className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                                title="הסר קובץ"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {errorMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 font-medium">
                {errorMessage}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 md:px-8 py-5 flex flex-col-reverse md:flex-row md:items-center gap-3">
          <button
            onClick={onClose}
            className="w-full md:w-auto rounded-2xl border border-slate-200 bg-white px-6 py-3.5 font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ביטול
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full md:mr-auto md:w-auto rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-8 py-3.5 font-black text-white shadow-lg shadow-cyan-200 transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? 'הדודה חושבת...' : 'קבלו תשובה מהדודה'}
          </button>
        </div>
      </div>
    </div>
  );
}
