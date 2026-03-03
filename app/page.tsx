'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FileUpload } from '@/components/FileUpload';
import { parseChatFile } from '@/services/chatParser';
import { ChatMessage, ParsedChat, AnalysisType, CardColor, UserTier } from '@/types';
import { serverAnalyzeChatFull, serverAnalyzeGroupDynamics, serverAnalyzeRomanticDynamics } from '@/lib/gemini-server';
import { getChatMetadata, getTruncatedMessages } from '@/lib/chat-utils';
import { uploadChatAction, updateChatCacheAction, logUploadAction, logButtonClickAction, logShareAction, logImageGenerationAction, logFeedbackAction } from '@/app/actions/analytics-actions';
import { AnalysisCard } from '@/components/AnalysisCard';
import { AnalysisModal } from '@/components/AnalysisModal';
import { GroupParticipantSelector } from '@/components/GroupParticipantSelector';
import { HowToExport } from '@/components/HowToExport';
import { BrainIcon, GroupIcon, HappyIcon, SecretIcon, WarningIcon } from '@/components/Icons';
import { Lock, Star, Zap, User, Heart, Shield, Search, Sparkles, Quote, FileText } from 'lucide-react';
import { 
  LOGO_URL, 
  TIER_CONFIG, 
  ANALYSIS_CONFIG, 
  PRIVACY_DISCLAIMER_TEXT,
  LOADING_MESSAGES_PHASE_1,
  LOADING_MESSAGES_PHASE_2,
  LOADING_MESSAGES_PHASE_3
} from '@/lib/constants';
import AuthDetails from '@/components/AuthDetails';

export default function HomePage() {
  const router = useRouter();
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
  const [selectedTier, setSelectedTier] = useState<UserTier>('free');
  const [loadingMessages, setLoadingMessages] = useState<{phase1: string[], phase2: string[], phase3: string[]}>({    phase1: LOADING_MESSAGES_PHASE_1,
    phase2: LOADING_MESSAGES_PHASE_2,
    phase3: LOADING_MESSAGES_PHASE_3
  });
  const usedHighlightIndicesRef = useRef<Set<number>>(new Set());
  const usedMessagesRef = useRef<Set<string>>(new Set());
  const isLoadingRef = useRef(false);
  isLoadingRef.current = loading || isProcessingFile;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatCode, setChatCode] = useState<string | null>(null);
  const [cachedOutputs, setCachedOutputs] = useState<Record<string, any>>({});
  const [isNewSessionMode, setIsNewSessionMode] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/messages')
      .then(res => res.json())
      .then(data => {
        if (data && data.phase1) {
          setLoadingMessages(data);
        }
      })
      .catch(err => console.error("Failed to load messages", err));
  }, []);

  const isAnalyzing = loading;

  const logUpload = async (participantsCount: number, anonymizedText: string, tokenCount: number, chatCode?: string | null) => {
    try {
      const data = await logUploadAction(participantsCount, tokenCount);
      setSessionId(data.sessionId);
    } catch (e) { console.error("Log upload failed", e); }
  };

  const logButton = async (buttonId: string) => {
    try {
      await logButtonClickAction(buttonId);
    } catch (e) { console.error("Log button failed", e); }
  };
  
  const logShare = async (type: string, platform: string) => {
    if (!sessionId) return;
    try {
        await logShareAction(sessionId, type, platform);
    } catch (e) { console.error("Log share failed", e); }
  };

  const logImageGeneration = async () => {
    if (!sessionId) return;
    try {
        await logImageGenerationAction(sessionId, 'generated_cartoon_image');
    } catch (e) { console.error("Log image generation failed", e); }
  };

  const logFeedback = async (rating: number, comment: string) => {
    if (!sessionId) return;
    try {
        await logFeedbackAction(sessionId, rating, comment);
    } catch (e) { console.error("Log feedback failed", e); }
  };

  const storeChat = async (text: string) => {
    try {
      const data = await uploadChatAction(text, isNewSessionMode);
      if (data.code) {
        setChatCode(data.code);
        console.log("Chat stored with code:", data.code);
        
        if (data.existingOutputs && !isNewSessionMode) {
          console.log("Found existing outputs:", Object.keys(data.existingOutputs));
          setCachedOutputs(data.existingOutputs);
        } else {
          setCachedOutputs({});
        }
        
        return data.code;
      }
    } catch (e) { console.error("Store chat failed", e); }
    return null;
  };

  const handleFileLoaded = async (text: string) => {
    setIsProcessingFile(true);
    setProcessingProgress(0);
    setHighlights([]);
    usedHighlightIndicesRef.current.clear();
    setSessionId(null); // Reset session on new file
    setChatCode(null); // Reset chat code
    setCachedOutputs({}); // Reset cached outputs

    try {
      const parsed = await parseChatFile(text, (percent) => setProcessingProgress(percent));
      if (!parsed || parsed.messages.length === 0) {
        alert("לא נמצאו הודעות בקובץ.");
        setIsProcessingFile(false);
        return;
      }

      let lastDate = "";
      let lastSender = "";

      let formattedAnonymizedText = parsed.anonymizedMessages.map(m => {
        const dateStr = m.date.toLocaleDateString('en-GB'); // d/m/y
        let line = "";

        // Rule 5: Only keep the first date of every day
        if (dateStr !== lastDate) {
           line += `${dateStr}\n`;
           lastDate = dateStr;
           lastSender = ""; 
        }

        // Rule 7: When the same participant writes several messages in a row, don't write their names
        if (m.sender !== lastSender) {
            line += `${m.sender}:${m.content}`;
            lastSender = m.sender;
        } else {
            line += `${m.content}`;
        }
        
        return line;
      }).join('\n');

      // Truncate based on selected tier
      const limit = TIER_CONFIG[selectedTier].limit;
      if (formattedAnonymizedText.length > limit) {
          formattedAnonymizedText = formattedAnonymizedText.slice(-limit);
          // Ensure we don't cut in the middle of a line
          const firstNewLine = formattedAnonymizedText.indexOf('\n');
          if (firstNewLine !== -1) {
              formattedAnonymizedText = formattedAnonymizedText.slice(firstNewLine + 1);
          }
      }

      // Calculate token count based on character count / 4
      const estimatedTokens = Math.ceil(formattedAnonymizedText.length / 4);
      console.log(`[App] Uploading text length: ${formattedAnonymizedText.length}, Estimated Tokens: ${estimatedTokens}`);

      const code = await storeChat(formattedAnonymizedText);
      await logUpload(parsed.participants.length, formattedAnonymizedText, estimatedTokens, code);

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
    logButton(type);
    if (!chatData) return;

    if (type === AnalysisType.GROUP_DYNAMICS) {
      setLoading(true);
      setActiveAnalysisType(type);
      setCurrentLoadingSnippet(getNextHighlight());
      try {
        const limit = TIER_CONFIG[selectedTier].limit;
        
        // Check cache for group dynamics
        const cacheKey = participants && participants.length > 0 
            ? `group_dynamics:${participants.sort().join(',')}` 
            : 'group_dynamics:all';
        
        let result = "";
        if (cachedOutputs[cacheKey]) {
            console.log("Using cached group dynamics analysis");
            result = cachedOutputs[cacheKey].output;
        } else {
            result = await serverAnalyzeGroupDynamics(chatData.anonymizedMessages, participants, limit);
            // Update cache locally so subsequent calls use it
            setCachedOutputs(prev => ({ ...prev, [cacheKey]: { output: result, timestamp: new Date().toISOString() } }));
            // Persist to storage
            if (chatCode) {
                updateChatCacheAction(chatCode, cacheKey, result).catch(e => console.error('Failed to cache group dynamics', e));
            }
        }

        const deanonymize = (t: string) => {
            let txt = t || "";
            if (!chatData.reverseMap) return txt;
            // Normalize [Participant_X] to PX to handle model output discrepancies
            txt = txt.replace(/\[Participant_(\d+)\]/g, 'P$1');
            
            const sortedKeys = Object.keys(chatData.reverseMap).sort((a, b) => b.length - a.length);
            const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "g");
            return txt.replace(pattern, matched => chatData.reverseMap[matched] || matched);
        };
        setUserAnalysisData(prev => ({ ...prev, GROUP: { content: PRIVACY_DISCLAIMER_TEXT + deanonymize(result) } }));
      } catch (e: any) { alert(e.message); setActiveAnalysisType(null); }
      finally { setLoading(false); }
      return;
    }

    if (type === AnalysisType.ROMANTIC_DYNAMICS) {
      setLoading(true);
      setActiveAnalysisType(type);
      setCurrentLoadingSnippet(getNextHighlight());
      try {
        const limit = TIER_CONFIG[selectedTier].limit;
        
        // Check cache
        const cacheKey = 'romantic_dynamics';
        let result = "";
        if (cachedOutputs[cacheKey]) {
            console.log("Using cached romantic dynamics analysis");
            result = cachedOutputs[cacheKey].output;
        } else {
            result = await serverAnalyzeRomanticDynamics(chatData.anonymizedMessages, limit);
            setCachedOutputs(prev => ({ ...prev, [cacheKey]: { output: result, timestamp: new Date().toISOString() } }));
            // Persist to storage
            if (chatCode) {
                updateChatCacheAction(chatCode, cacheKey, result).catch(e => console.error('Failed to cache romantic dynamics', e));
            }
        }

        const deanonymize = (t: string) => {
            let txt = t || "";
            if (!chatData.reverseMap) return txt;
            txt = txt.replace(/\[Participant_(\d+)\]/g, 'P$1');
            const sortedKeys = Object.keys(chatData.reverseMap).sort((a, b) => b.length - a.length);
            const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "g");
            return txt.replace(pattern, matched => chatData.reverseMap[matched] || matched);
        };
        setUserAnalysisData(prev => ({ ...prev, ROMANTIC: { content: PRIVACY_DISCLAIMER_TEXT + deanonymize(result) } }));
      } catch (e: any) { alert(e.message); setActiveAnalysisType(null); }
      finally { setLoading(false); }
      return;
    }

    if (!selectedUser) return;

    // Check if we already have full analysis for this user in local state
    if (userAnalysisData[selectedUser]) {
      setActiveAnalysisType(type);
      return;
    }

    setLoading(true);
    setActiveAnalysisType(type);
    setCurrentLoadingSnippet(getNextHighlight());

    try {
      const limit = TIER_CONFIG[selectedTier].limit;
      const anonUser = chatData.nameMap[selectedUser] || selectedUser;
      
      // Check cache for full analysis
      const cacheKey = `full_analysis:${anonUser}`;
      let rawResult: Record<string, string> = {};

      if (cachedOutputs[cacheKey]) {
          console.log(`Using cached full analysis for ${anonUser}`);
          rawResult = cachedOutputs[cacheKey].output;
      } else {
          rawResult = await serverAnalyzeChatFull(chatData.anonymizedMessages, anonUser, limit);
          // Update cache locally
          setCachedOutputs(prev => ({ ...prev, [cacheKey]: { output: rawResult, timestamp: new Date().toISOString() } }));
          // Persist to storage
          if (chatCode) {
              updateChatCacheAction(chatCode, cacheKey, rawResult).catch(e => console.error('Failed to cache full analysis', e));
          }
      }
      
      const deanonymize = (t: string) => {
        let txt = t || "";
        if (!chatData.reverseMap) return txt;
        // Normalize [Participant_X] to PX to handle model output discrepancies
        txt = txt.replace(/\[Participant_(\d+)\]/g, 'P$1');

        const sortedKeys = Object.keys(chatData.reverseMap).sort((a, b) => b.length - a.length);
        const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "g");
        return txt.replace(pattern, matched => chatData.reverseMap[matched] || matched);
      };

      // Map server response keys to AnalysisType enum values
      const finalData: Record<string, string> = {
        [AnalysisType.PERSONALITY]: PRIVACY_DISCLAIMER_TEXT + deanonymize(rawResult.personality || ""),
        [AnalysisType.OTHERS_THOUGHTS]: PRIVACY_DISCLAIMER_TEXT + deanonymize(rawResult.othersThoughts || ""),
        [AnalysisType.IMPROVEMENT]: PRIVACY_DISCLAIMER_TEXT + deanonymize(rawResult.improvement || ""),
        [AnalysisType.HIDDEN_THOUGHTS]: PRIVACY_DISCLAIMER_TEXT + deanonymize(rawResult.hiddenThoughts || ""),
      };

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
        let pool = loadingMessages.phase1;
        if (elapsed >= 10 && elapsed < 30) {
          pool = loadingMessages.phase2;
        } else if (elapsed >= 30) {
          pool = loadingMessages.phase3;
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
    if (activeAnalysisType === AnalysisType.ROMANTIC_DYNAMICS) return userAnalysisData['ROMANTIC']?.content || "";
    if (!selectedUser) return "";
    return userAnalysisData[selectedUser]?.[activeAnalysisType] || "";
  };

  if (isProcessingFile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative">
        <button 
          onClick={() => router.push('/admin')} 
          className="fixed top-4 left-4 p-2 text-slate-400 hover:text-slate-600 transition-colors z-50 opacity-50 hover:opacity-100"
          title="Admin Login"
        >
          <Lock className="w-4 h-4" />
        </button>
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
      <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 overflow-x-hidden relative">
        <AuthDetails />
        <button 
          onClick={() => router.push('/admin')} 
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-600 transition-colors z-50 opacity-50 hover:opacity-100"
          title="Admin Login"
        >
          <Lock className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setIsNewSessionMode(!isNewSessionMode)} 
          className={`absolute top-4 left-14 p-2 transition-colors z-50 opacity-50 hover:opacity-100 ${isNewSessionMode ? 'text-indigo-600 bg-indigo-50 rounded-full' : 'text-slate-400 hover:text-slate-600'}`}
          title={isNewSessionMode ? "New Session Mode: ON" : "New Session Mode: OFF"}
        >
          <FileText className="w-4 h-4" />
        </button>

        {/* Hero Section */}
        <div className="bg-gradient-to-br from-teal-50 via-sky-50 to-indigo-50 relative overflow-hidden pb-24 pt-16 text-center text-slate-800">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]"></div>
           <div className="absolute -bottom-1 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent"></div>
           
           <div className="max-w-5xl mx-auto px-4 relative z-10">
              <div className="inline-flex items-center justify-center p-1 bg-white/60 backdrop-blur-md rounded-full mb-8 shadow-xl animate-bounce-slow ring-4 ring-teal-100/50">
                 <img src={LOGO_URL} className="w-24 h-24 rounded-full border-4 border-white shadow-sm" />
              </div>
              <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tight text-teal-900 drop-shadow-sm animate-fadeIn">הפסיכולוגית</h1>
              <p className="text-xl md:text-3xl text-slate-600 max-w-3xl mx-auto mb-10 font-light leading-relaxed animate-fadeIn">
                הבינה המלאכותית שחושפת <span className="font-bold text-teal-700 border-b-2 border-teal-300">סודות, אהבות וקשיים</span> בשיחות ווטסאפ (ועוזרת לפתור אותם)
              </p>
              
              <HowToExport />

              <div className="max-w-xl mx-auto bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl border border-white/50 transform hover:scale-[1.02] transition-transform duration-300">
                 <FileUpload onFileLoaded={handleFileLoaded} />
                 <p className="text-xs text-slate-400 mt-3 flex items-center justify-center gap-1">
                    <Shield className="w-3 h-3" />
                    הפרטיות מובטחת: הניתוח מתבצע באופן אנונימי לחלוטין
                 </p>
              </div>
           </div>
        </div>

        {/* Value Proposition */}
        <div className="max-w-6xl mx-auto px-4 py-16 -mt-10 relative z-20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/90 backdrop-blur p-8 rounded-3xl shadow-lg border border-slate-100 text-center hover:shadow-xl transition-shadow">
                    <div className="w-14 h-14 bg-teal-100 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Search className="w-7 h-7" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-3">חשיפת הסאבטקסט</h3>
                    <p className="text-slate-600 leading-relaxed">גלו מה באמת מסתתר בין השורות. העקיצות, הרמזים והרגשות שלא נאמרים במפורש.</p>
                </div>
                <div className="bg-white/90 backdrop-blur p-8 rounded-3xl shadow-lg border border-slate-100 text-center hover:shadow-xl transition-shadow">
                    <div className="w-14 h-14 bg-rose-100 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Heart className="w-7 h-7" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-3">שיפור מערכות יחסים</h3>
                    <p className="text-slate-600 leading-relaxed">קבלו כלים מעשיים וטיפים מותאמים אישית לשיפור התקשורת עם בן/בת הזוג, חברים או משפחה.</p>
                </div>
                <div className="bg-white/90 backdrop-blur p-8 rounded-3xl shadow-lg border border-slate-100 text-center hover:shadow-xl transition-shadow">
                    <div className="w-14 h-14 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Sparkles className="w-7 h-7" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-3">פרופיל פסיכולוגי</h3>
                    <p className="text-slate-600 leading-relaxed">קבלו ניתוח אישיות מעמיק ומדויק להפליא, המבוסס על דפוסי הכתיבה וההתנהגות שלכם.</p>
                </div>
            </div>
        </div>

        {/* User Tiers */}
        <div className="bg-slate-50 py-16 border-t border-slate-200">
            <div className="max-w-4xl mx-auto px-4 text-center">
                <h2 className="text-3xl font-black text-slate-800 mb-10">בחרו את רמת הניתוח המתאימה לכם</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(Object.entries(TIER_CONFIG) as [UserTier, typeof TIER_CONFIG[UserTier]][]).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedTier(key)}
                      className={`relative p-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-4 group ${
                        selectedTier === key 
                          ? `${config.color.split(' ')[0]} ${config.color.split(' ')[1]} ring-4 ring-offset-2 ring-teal-100 scale-105 shadow-xl border-teal-200` 
                          : 'bg-white border-slate-100 hover:border-teal-200 hover:bg-teal-50/30 hover:shadow-lg'
                      }`}
                    >
                      <div className={`p-4 rounded-full transition-colors ${selectedTier === key ? 'bg-white shadow-sm' : 'bg-slate-50 group-hover:bg-white'}`}>
                        {config.icon}
                      </div>
                      <div className="text-center">
                        <div className={`text-lg font-bold mb-2 ${selectedTier === key ? config.color.split(' ')[2] : 'text-slate-800'}`}>{config.label}</div>
                        <div className="text-sm text-slate-500 leading-snug">{config.description}</div>
                      </div>
                      {selectedTier === key && (
                          <div className="absolute -top-3 bg-teal-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md">נבחר</div>
                      )}
                    </button>
                  ))}
                </div>
            </div>
        </div>

        {/* Reviews Section */}
        <div className="bg-white py-20 border-t border-slate-100">
            <div className="max-w-5xl mx-auto px-4">
                <h2 className="text-3xl font-black text-center text-slate-800 mb-16">מה המשתמשים אומרים?</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-teal-50/50 p-8 rounded-3xl relative border border-teal-100/50">
                        <Quote className="absolute top-6 right-6 w-8 h-8 text-teal-200" />
                        <p className="text-slate-700 leading-relaxed mb-6 relative z-10">"הייתי בטוחה שהכל בסדר בינינו, עד שהפסיכולוגית הראתה לי מה באמת קורה מתחת לפני השטח. זה פשוט פתח לי את העיניים בצורה שלא האמנתי."</p>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center font-bold text-teal-600">מ</div>
                            <div>
                                <div className="font-bold text-slate-900">מאיה כהן</div>
                                <div className="text-xs text-slate-500">תל אביב</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-indigo-50/50 p-8 rounded-3xl relative border border-indigo-100/50">
                        <Quote className="absolute top-6 right-6 w-8 h-8 text-indigo-200" />
                        <p className="text-slate-700 leading-relaxed mb-6 relative z-10">"הניתוח הקבוצתי היה מדויק בצורה מפחידה. סוף סוף הבנו מי באמת מנהל את העניינים בקבוצה של החבר'ה. צחקנו שעות!"</p>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center font-bold text-indigo-600">ע</div>
                            <div>
                                <div className="font-bold text-slate-900">עומר לוי</div>
                                <div className="text-xs text-slate-500">חיפה</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-rose-50/50 p-8 rounded-3xl relative border border-rose-100/50">
                        <Quote className="absolute top-6 right-6 w-8 h-8 text-rose-200" />
                        <p className="text-slate-700 leading-relaxed mb-6 relative z-10">"כלי חובה לכל מי שרוצה להבין את מערכות היחסים שלו טוב יותר. הטיפים לשיפור היו מעולים וממש עזרו לי."</p>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center font-bold text-rose-600">נ</div>
                            <div>
                                <div className="font-bold text-slate-900">נועה אברהם</div>
                                <div className="text-xs text-slate-500">ירושלים</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-900 text-slate-400 py-12 text-center text-sm">
            <p>© 2026 הפסיכולוגית. כל הזכויות שמורות.</p>
            <p className="mt-2 opacity-60">הניתוח מתבצע באמצעות בינה מלאכותית ונועד למטרות בידור והעשרה בלבד.</p>
        </div>

        <style>{`
          @keyframes bounce-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
          .animate-bounce-slow { animation: bounce-slow 4s ease-in-out infinite; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          .animate-fadeIn { animation: fadeIn 0.8s ease-out both; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans" dir="rtl">
      <div className="bg-white shadow-sm border-b sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
         <div className="flex items-center gap-3"><img src={LOGO_URL} className="w-10 h-10 rounded-full" /><h1 className="font-black text-slate-800 text-xl hidden md:block">הפסיכולוגית</h1></div>
         <div className="flex items-center gap-4">
            <button onClick={() => router.push('/admin')} className="text-slate-400 hover:text-slate-600 transition-colors" title="Admin Login"><Lock className="w-4 h-4" /></button>
            <button onClick={() => setChatData(null)} className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors">החלף צ'אט</button>
         </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-12 text-center">
           <button onClick={() => { setIsGroupSelectorOpen(true); logButton('GROUP_ANALYSIS_INIT'); }} className="group relative w-full max-w-4xl block mx-auto bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
              <div className="relative z-10 flex items-center justify-between text-white">
                 <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-xl"><GroupIcon className="w-8 h-8" /></div>
                    <div className="text-right"><h3 className="text-xl font-black">ניתוח קבוצתי מלא</h3><p className="text-indigo-100 text-sm">מי המנהיג? מי הטרבלמייקר?</p></div>
                 </div>
                 <div className="bg-white/20 rounded-full p-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg></div>
              </div>
           </button>

           {/* Romantic Dynamics Button */}
           <button 
             onClick={() => chatData.participants.length === 2 && triggerAnalysis(AnalysisType.ROMANTIC_DYNAMICS)} 
             disabled={chatData.participants.length !== 2}
             className={`group relative w-full max-w-4xl block mx-auto rounded-2xl p-6 shadow-xl transition-all duration-300 mt-4 ${
               chatData.participants.length !== 2 
                 ? 'bg-slate-100 cursor-not-allowed opacity-70 border-2 border-slate-200' 
                 : 'bg-gradient-to-r from-pink-500 to-rose-500 hover:shadow-2xl'
             }`}
           >
              <div className="relative z-10 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${chatData.participants.length !== 2 ? 'bg-slate-200 text-slate-400' : 'bg-white/20 text-white'}`}>
                       <Heart className="w-8 h-8" />
                    </div>
                    <div className="text-right">
                       <h3 className={`text-xl font-black ${chatData.participants.length !== 2 ? 'text-slate-500' : 'text-white'}`}>ניתוח זוגיות</h3>
                       <p className={`text-sm ${chatData.participants.length !== 2 ? 'text-slate-400' : 'text-pink-100'}`}>
                          {chatData.participants.length !== 2 ? "זמין רק לצ'אטים עם 2 משתתפים" : "אבחון מעמיק של הדינמיקה הזוגית"}
                       </p>
                    </div>
                 </div>
                 {chatData.participants.length === 2 && (
                   <div className="bg-white/20 rounded-full p-2 text-white">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                       </svg>
                   </div>
                 )}
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
           {Object.entries(ANALYSIS_CONFIG).map(([type, config], idx) => {
             if (type === AnalysisType.GROUP_DYNAMICS || type === AnalysisType.ROMANTIC_DYNAMICS) return null;
             
             return (
               <AnalysisCard 
                 key={type} 
                 title={config.title} 
                 description={config.description} 
                 icon={config.icon} 
                 color={config.color} 
                 index={idx} 
                 onClick={() => triggerAnalysis(type as AnalysisType)} 
               />
             );
           })}
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
        onShare={(platform) => logShare(activeAnalysisType || 'UNKNOWN', platform)}
        onLogImageGeneration={logImageGeneration}
        onLogFeedback={logFeedback}
        chatCode={chatCode}
      />

      {isGroupSelectorOpen && (
        <GroupParticipantSelector
          isOpen={isGroupSelectorOpen}
          participants={(() => {
             const limit = TIER_CONFIG[selectedTier].limit;
             const truncatedMsgs = getTruncatedMessages(chatData.anonymizedMessages, limit);
             const counts: Record<string, number> = {};
             truncatedMsgs.forEach(m => {
                 counts[m.sender] = (counts[m.sender] || 0) + 1;
             });
             // Sort all participants: those with counts first (desc), then those with 0
             return [...chatData.participants].sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
          })()}
          onClose={() => setIsGroupSelectorOpen(false)}
          onConfirm={(selected) => { setIsGroupSelectorOpen(false); triggerAnalysis(AnalysisType.GROUP_DYNAMICS, selected); }}
        />
      )}
    </div>
  );
}
