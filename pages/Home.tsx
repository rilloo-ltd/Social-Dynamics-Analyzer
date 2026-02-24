import React, { useState, useEffect, useRef } from 'react';
import { FileUpload } from '../components/FileUpload';
import { parseChatFile } from '../services/chatParser';
import { ChatMessage, ParsedChat, AnalysisType, CardColor } from '../types';
import { analyzeChatFull, analyzeGroupDynamics, getChatMetadata } from '../services/geminiService';
import { AnalysisCard } from '../components/AnalysisCard';
import { AnalysisModal } from '../components/AnalysisModal';
import { GroupParticipantSelector } from '../components/GroupParticipantSelector';

export const LOGO_URL = "https://madaduhcom.wpcomstaging.com/wp-content/uploads/2026/02/logo-psychologist.png";

const BrainIcon: React.FC<{className?: string}> = ({className = "h-6 w-6"}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>;
const GroupIcon: React.FC<{className?: string}> = ({className = "h-6 w-6"}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const HappyIcon: React.FC<{className?: string}> = ({className = "h-6 w-6"}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const SecretIcon: React.FC<{className?: string}> = ({className = "h-6 w-6"}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
const WarningIcon: React.FC<{className?: string}> = ({className = "h-6 w-6"}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
const PrivacyIcon: React.FC<{className?: string}> = ({className = "h-6 w-6"}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;

const PRIVACY_DISCLAIMER_TEXT = "[PRIVACY_NOTICE] השמות המקוריים שאתם רואים בניתוח זה הוחזרו למקומם על ידי המחשב שלכם בלבד. מנוע הבינה המלאכותית ראה אך ורק זהויות אנונימיות (כמו [Participant_1]) כדי להבטיח שהפרטיות שלכם נשמרת במלואה.\n\n";

const LOADING_MESSAGES_PHASE_1 = [
  "קורא את הקובץ. לאט. כי מישהו פה כותב במגילות.",
  "עושה אנונימיזציה כדי לתסבך את כל ההאקרים.",
  "סופר כמה פעמים נכתב \"חחח\" בלי שאף אחד צחק באמת.",
  "ממיר אימוג'ים של בכי לטקסט קר ומנוכר.",
  "מתעלם משגיאות ההקלדה. או לפחות מנסה.",
  "בודק מתי הושארו וי כחולים ללא תגובה. הנתונים קשים.",
  "מאתחל את מודל הסבלנות האלקטרונית שלי.",
  "מסנן תמונות. המערכת שלי לא בנויה להכיל את זה.",
  "קורא את התנאים וההגבלות במקומך. סתם, גם אני לא קורא.",
  "מעבד הודעות של מילה אחת. מרתק.",
  "מחפש את ההקשר שאבד אי שם בנובמבר.",
  "מקטלג סימני קריאה מיותרים. ויש הרבה.",
  "טוען את היסטוריית ההודעות המודחקות.",
  "מוחק הודעות \"ער/ה?\" כדי לחסוך מבוכה מהשרתים.",
  "מוודא שהטקסט בטוח לקריאה. לפחות עבורי.",
  "מנסה להבין מי פה הצד הפגוע. כנראה שניכם.",
  "סורק את ההודעות שנמחקו. אני יודע מה היה שם.",
  "בוחן את זמני התגובה. מישהו פה משחק משחקים.",
  "שותה קפה וירטואלי לפני שאני צולל פנימה.",
  "מנתח את הפסיב-אגרסיב בשורה \"הכל טוב\"."
];

const LOADING_MESSAGES_PHASE_2 = [
  "מחלץ תובנות משמעותיות (אבל למי?).",
  "מודד את רמת החרדה הממוצעת להודעה.",
  "מחפש דפוסי התקשרות נמנעים. מוצא יותר מדי.",
  "משווה את הדינמיקה הזאת לנורמה. הנורמה מנצחת.",
  "מנסה למצוא משמעות עמוקה בתגובה \"סבבה\".",
  "מאבחן בעיות אמון על סמך שימוש מוגזם בשלוש נקודות...",
  "מחשב את יחס התן-וקח. המתמטיקה קורסת.",
  "ממפה פצעי ילדות דרך שימוש באימוג'י של ליצן.",
  "מריץ סימולציה של מה היה קורה אם הייתם פשוט מדברים.",
  "סופר כמה פעמים הייתם צריכים פשוט ללכת לישון.",
  "מחפש בספרות המקצועית מונח למה שקורה פה. כנראה שעוד אין.",
  "מפענח את הסאבטקסט. הוא די עמוק למטה.",
  "מנתח מנגנוני הגנה. נראה שהכחשה מובילה כרגע.",
  "בונה פרופיל פסיכולוגי. מבקש תוספת סיכון.",
  "תוהה אם פרויד היה מסתדר עם וואטסאפ. כנראה שלא.",
  "מודד טראומה בין-דורית לפי כמות הפעמים שמופיעה המילה \"אמא\".",
  "מבודד את הרגע המדויק שבו הכל התחיל להשתבש.",
  "מחפש תוקף רגשי בשיחה. מדווח על שגיאה 404.",
  "מזקק את כל הדרמה הזו לארבע שורות קוד.",
  "בודק חרדת נטישה דרך זמני ההמתנה לתשובה."
];

const LOADING_MESSAGES_PHASE_3 = [
  "שוקל איך לכתוב את הדברים בלי להעליב אף אחד.",
  "עוטף את המציאות המרה במילים יפות.",
  "מוסיף ז'רגון מקצועי כדי להצדיק את קיום האפליקציה הזאת.",
  "מתמצת את האבחנה. זה לא יכנס לפוסט-איט.",
  "מנסח פתרונות פרקטיים שברור לי שלא תיישמו.",
  "מתכונן נפשית לתגובה שלכם.",
  "מוודא שהדו\"ח מכיל מספיק אמפתיה מלאכותית.",
  "מחפש מילת תואר עדינה יותר ל\"קטסטרופה\".",
  "מדפיס את המסקנות לזיכרון. גורס אותן. מדפיס שוב.",
  "מכין קופסת טישו וירטואלית.",
  "מנסח דיסקליימר ארוך שקובע שאני, בסופו של דבר, רק אלגוריתם.",
  "מחליט לא להציג את הכל בבת אחת. פרה פרה.",
  "מוסיף קצת אופטימיות בסוף. עריכה: מוחק אותה שוב.",
  "מצמצם את כמות האשמה שמכוונת ישירות אליכם.",
  "מוודא שהפסיכולוג האמיתי שלכם לא יתבע אותנו.",
  "מתרגם שפת מכונה לאכזבה אנושית.",
  "מרכך את המכה.",
  "מגבה את הנתונים, למקרה שתחליטו להכחיש הכל אחר כך.",
  "אורז הכל לפורמט קריא.",
  "מסיים. לוקח נשימה עמוקה (אם היו לי ריאות)."
];

const ANALYSIS_CONFIG: Record<string, { title: string, description: string, icon: React.ReactNode, color: CardColor }> = {
  [AnalysisType.PERSONALITY]: { title: 'מי אני באמת?', description: 'ניתוח פסיכולוגי מעמיק של האישיות שלך כפי שהיא משתקפת מהודעות הטקסט.', icon: <BrainIcon />, color: 'purple' },
  [AnalysisType.OTHERS_THOUGHTS]: { title: 'מה חושבים עליי?', description: 'גלה מה המשתתפים האחרים באמת מרגישים כלפיך.', icon: <SecretIcon />, color: 'red' },
  [AnalysisType.HIDDEN_THOUGHTS]: { title: 'מחשבות נסתרות', description: 'להסתכל על מה שלא נאמר. חשיפת הסאבטקסט, העקיצות והמטענים הרגשיים המוסתרים.', icon: <WarningIcon />, color: 'orange' },
  [AnalysisType.IMPROVEMENT]: { title: 'איך להשתפר?', description: 'קבל כלים וטיפים מעשיים לשיפור התקשורת, חיזוק הקשרים והעלאת המעמד החברתי.', icon: <HappyIcon />, color: 'green' },
  [AnalysisType.GROUP_DYNAMICS]: { title: 'ניתוח קבוצתי מלא', description: 'גלה מי המנהיג, מי עושה צרות, ומהם המתחים הנסתרים בין 10 המשתתפים המובילים.', icon: <GroupIcon />, color: 'indigo' }
};

export const Home: React.FC = () => {
  const [chatData, setChatData] = useState<ParsedChat | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activeAnalysisType, setActiveAnalysisType] = useState<AnalysisType | null>(null);
  const [userAnalysisData, setUserAnalysisData] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0); 
  const [highlights, setHighlights] = useState<string[]>([]);
  const [currentLoadingSnippet, setCurrentLoadingSnippet] = useState<string | null>(null);
  const [displayedMessage, setDisplayedMessage] = useState<string>("");
  const [isGroupSelectorOpen, setIsGroupSelectorOpen] = useState(false);
  const usedHighlightIndicesRef = useRef<Set<number>>(new Set());
  const usedMessagesRef = useRef<Set<string>>(new Set());
  const isLoadingRef = useRef(false);
  isLoadingRef.current = loading || isProcessingFile;

  const isAnalyzing = loading;

  const handleFileLoaded = async (text: string) => {
    setIsProcessingFile(true);
    setProcessingProgress(0);
    setHighlights([]);
    usedHighlightIndicesRef.current.clear();

    try {
      const parsed = await parseChatFile(text, (percent) => setProcessingProgress(percent));
      if (!parsed || parsed.messages.length === 0) {
        alert("לא נמצאו הודעות בקובץ.");
        setIsProcessingFile(false);
        return;
      }

      // Log file upload
      fetch('/api/log/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantsCount: parsed.participants.length }),
      }).catch(console.error);

      const deanonymize = (t: string) => {
        let txt = t || "";
        if (!parsed.reverseMap) return txt;
        const sortedKeys = Object.keys(parsed.reverseMap).sort((a, b) => b.length - a.length);
        const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "g");
        txt = txt.replace(pattern, matched => parsed.reverseMap[matched] || matched);
        return txt;
      };

      const metadata = await getChatMetadata(parsed.anonymizedMessages);
      if (metadata.highlights) setHighlights(metadata.highlights.map(deanonymize));

      setChatData(parsed);
      setSelectedUser(null);
      setUserAnalysisData({});
      setActiveAnalysisType(null);
    } catch (error) {
      alert("אירעה שגיאה בעיבוד הקובץ.");
    } finally {
      setIsProcessingFile(false);
    }
  };

  const getNextHighlight = () => {
    if (highlights.length === 0) return "מעבד את הנתונים באופן אנונימי...";
    const available = highlights.map((_, i) => i).filter(i => !usedHighlightIndicesRef.current.has(i));
    const idx = available.length === 0 ? Math.floor(Math.random() * highlights.length) : available[Math.floor(Math.random() * available.length)];
    usedHighlightIndicesRef.current.add(idx);
    return highlights[idx];
  };

  const triggerAnalysis = async (type: AnalysisType, participants?: string[]) => {
    if (!chatData) return;

    // Log button press
    fetch('/api/log/button', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buttonId: type }),
    }).catch(console.error);

    if (type === AnalysisType.GROUP_DYNAMICS) {
      setLoading(true);
      setActiveAnalysisType(type);
      setCurrentLoadingSnippet(getNextHighlight());
      try {
        const result = await analyzeGroupDynamics(chatData.anonymizedMessages, participants);
        const deanonymize = (t: string) => {
            let txt = t || "";
            if (!chatData.reverseMap) return txt;
            const sortedKeys = Object.keys(chatData.reverseMap).sort((a, b) => b.length - a.length);
            const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "g");
            return txt.replace(pattern, matched => chatData.reverseMap[matched] || matched);
        };
        setUserAnalysisData(prev => ({ ...prev, GROUP: { content: PRIVACY_DISCLAIMER_TEXT + deanonymize(result) } }));
      } catch (e: any) { alert(e.message); setActiveAnalysisType(null); }
      finally { setLoading(false); }
      return;
    }

    if (!selectedUser) return;

    // Check if we already have full analysis for this user
    if (userAnalysisData[selectedUser]) {
      setActiveAnalysisType(type);
      return;
    }

    setLoading(true);
    setActiveAnalysisType(type);
    setCurrentLoadingSnippet(getNextHighlight());

    try {
      const anonUser = chatData.nameMap[selectedUser] || selectedUser;
      const rawResult = await analyzeChatFull(chatData.anonymizedMessages, anonUser);
      
      const deanonymize = (t: string) => {
        let txt = t || "";
        if (!chatData.reverseMap) return txt;
        const sortedKeys = Object.keys(chatData.reverseMap).sort((a, b) => b.length - a.length);
        const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "g");
        return txt.replace(pattern, matched => chatData.reverseMap[matched] || matched);
      };

      const finalData: Record<string, string> = {};
      Object.entries(rawResult).forEach(([key, val]) => {
        finalData[key] = PRIVACY_DISCLAIMER_TEXT + deanonymize(val);
      });
      // Map 'advice' to IMPROVEMENT key for UI config mapping
      finalData[AnalysisType.IMPROVEMENT] = finalData['advice'];

      setUserAnalysisData(prev => ({ ...prev, [selectedUser]: finalData }));
    } catch (e: any) { alert(e.message); setActiveAnalysisType(null); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let isMounted = true;

    const runLoadingSequence = async () => {
      const startTime = Date.now();
      usedMessagesRef.current.clear();

      while (isMounted && isLoadingRef.current) {
        const elapsed = (Date.now() - startTime) / 1000;
        let pool = LOADING_MESSAGES_PHASE_1;
        if (elapsed >= 10 && elapsed < 30) {
          pool = LOADING_MESSAGES_PHASE_2;
        } else if (elapsed >= 30) {
          pool = LOADING_MESSAGES_PHASE_3;
        }

        const available = pool.filter(m => !usedMessagesRef.current.has(m));
        const msgList = available.length > 0 ? available : pool;
        const randomMsg = msgList[Math.floor(Math.random() * msgList.length)];
        
        usedMessagesRef.current.add(randomMsg);
        
        for (let i = 0; i <= randomMsg.length; i++) {
          if (!isMounted || !isLoadingRef.current) return;
          setDisplayedMessage(randomMsg.substring(0, i));
          await new Promise(r => setTimeout(r, 40)); 
        }

        for (let w = 0; w < 30; w++) {
           if (!isMounted || !isLoadingRef.current) return;
           await new Promise(r => setTimeout(r, 100));
        }
      }
    };

    if (loading || isProcessingFile) {
      runLoadingSequence();
    } else {
      setDisplayedMessage("");
    }

    return () => {
      isMounted = false;
    };
  }, [loading, isProcessingFile]);

  useEffect(() => {
    let interval: any;
    if (loading && highlights.length > 0) {
      interval = setInterval(() => setCurrentLoadingSnippet(getNextHighlight()), 8000);
    }
    return () => clearInterval(interval);
  }, [loading, highlights]);

  const getModalContent = () => {
    if (!activeAnalysisType) return "";
    if (activeAnalysisType === AnalysisType.GROUP_DYNAMICS) return userAnalysisData['GROUP']?.content || "";
    if (!selectedUser) return "";
    return userAnalysisData[selectedUser]?.[activeAnalysisType] || "";
  };

  if (isProcessingFile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-8 max-w-sm w-full animate-fadeIn">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-200 rounded-full animate-ping opacity-75 scale-150"></div>
            <div className="relative bg-white p-8 rounded-full shadow-2xl border-4 border-blue-50 transform hover:rotate-12 transition-transform duration-700">
               <BrainIcon className="w-16 h-16 text-blue-600 animate-pulse" />
            </div>
          </div>
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-black text-slate-800 min-h-[40px]" dir="rtl">
              {displayedMessage || "מנתח את הצ'אט..."}
              <span className="animate-pulse">_</span>
            </h2>
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
             <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300" style={{ width: `${processingProgress}%` }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!chatData) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 overflow-x-hidden">
        <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-b border-white/50 relative overflow-hidden py-20 text-center">
           <div className="max-w-5xl mx-auto px-4 relative z-10">
              <div className="inline-flex items-center justify-center p-3 bg-white/80 rounded-2xl mb-8 shadow-xl animate-bounce-slow">
                 <img src={LOGO_URL} className="w-20 h-20 rounded-full" />
              </div>
              <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 animate-fadeIn">הפסיכולוגית</h1>
              <p className="text-xl md:text-2xl text-slate-600 max-w-3xl mx-auto mb-12 animate-fadeIn">הבינה המלאכותית שתזהה עבורכם דינמיקות חברתיות ורגשות נסתרים - באופן אנונימי לחלוטין.</p>
              <div className="max-w-xl mx-auto bg-white/60 p-4 rounded-3xl shadow-2xl border border-white/50">
                 <FileUpload onFileLoaded={handleFileLoaded} />
              </div>
              <div className="mt-8">
                <a href="/admin" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Admin Login</a>
              </div>
           </div>
        </div>
        <style>{`
          @keyframes bounce-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
          .animate-bounce-slow { animation: bounce-slow 4s ease-in-out infinite; }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          .animate-fadeIn { animation: fadeIn 0.8s ease-out both; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans" dir="rtl">
      <div className="bg-white shadow-sm border-b sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
         <div className="flex items-center gap-3"><img src={LOGO_URL} className="w-10 h-10 rounded-full" /><h1 className="font-black text-slate-800 text-xl hidden md:block">הפסיכולוגית</h1></div>
         <button onClick={() => setChatData(null)} className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors">החלף צ'אט</button>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-12 text-center">
           <button onClick={() => setIsGroupSelectorOpen(true)} className="group relative w-full max-w-4xl block mx-auto bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
              <div className="relative z-10 flex items-center justify-between text-white">
                 <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-xl"><GroupIcon className="w-8 h-8" /></div>
                    <div className="text-right"><h3 className="text-xl font-black">ניתוח קבוצתי מלא</h3><p className="text-indigo-100 text-sm">מי המנהיג? מי הטרבלמייקר?</p></div>
                 </div>
                 <div className="bg-white/20 rounded-full p-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg></div>
              </div>
           </button>

           <h2 className="text-2xl font-bold text-slate-800 mt-12 mb-6">או בחר משתתף ספציפי לניתוח אישי</h2>
           <div className="flex flex-wrap justify-center gap-3">
             {chatData.participants.map(p => (
               <button key={p} onClick={() => setSelectedUser(p === selectedUser ? null : p)} className={`px-6 py-3 rounded-full font-bold transition-all ${selectedUser === p ? 'bg-slate-900 text-white scale-105' : 'bg-white text-slate-700 hover:bg-slate-100 border'}`}>{p}</button>
             ))}
           </div>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto transition-all duration-700 ${selectedUser ? 'opacity-100' : 'opacity-0 pointer-events-none translate-y-10'}`}>
           {Object.entries(ANALYSIS_CONFIG).map(([type, config], idx) => (
             type !== AnalysisType.GROUP_DYNAMICS && (
             <AnalysisCard key={type} title={config.title} description={config.description} icon={config.icon} color={config.color} index={idx} onClick={() => triggerAnalysis(type as AnalysisType)} />
             )
           ))}
        </div>
      </div>

      <AnalysisModal
        isOpen={!!activeAnalysisType}
        onClose={() => { if (!loading) setActiveAnalysisType(null); }}
        title={activeAnalysisType ? ANALYSIS_CONFIG[activeAnalysisType].title : ""}
        icon={activeAnalysisType ? ANALYSIS_CONFIG[activeAnalysisType].icon : null}
        color={activeAnalysisType ? ANALYSIS_CONFIG[activeAnalysisType].color : "blue"}
        content={getModalContent()}
        loading={loading}
        loadingHighlight={currentLoadingSnippet}
        loadingMessage={displayedMessage}
      />

      {isGroupSelectorOpen && (
        <GroupParticipantSelector
          isOpen={isGroupSelectorOpen}
          participants={chatData.participants}
          onClose={() => setIsGroupSelectorOpen(false)}
          onConfirm={(selected) => { setIsGroupSelectorOpen(false); triggerAnalysis(AnalysisType.GROUP_DYNAMICS, selected); }}
        />
      )}
    </div>
  );
};
