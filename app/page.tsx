'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FileUpload } from '@/components/FileUpload';
import { parseChatFile } from '@/services/chatParser';
import { AnalysisDepthMode, ChatMessage, ChatRecordSection, ParsedChat, AnalysisType, CardColor, UserTier } from '@/types';
import { createFullAnalysisCacheKey, createGroupDynamicsCacheKey, createRomanticDynamicsCacheKey } from '@/lib/cache-utils';
import { 
  buildPersonReferenceAliases,
  createMessageLookup,
  createMessageLookupKey,
  formatChatDate,
  getChatMetadata,
  getTotalWordCount,
  getTruncatedMessages,
  isMessageByOrAboutPerson,
  messageIsByPerson,
  replacePersonAliasesInText
} from '@/lib/chat-utils';
import { isSupportedChatUploadFile, readChatUploadFile } from '@/lib/chat-file-utils';
import { updateChatCacheAction, logUploadAction, logButtonClickAction, logShareAction, logImageGenerationAction, logFeedbackAction } from '@/app/actions/analytics-actions';
import { checkUnlimitedAccessAction } from '@/app/actions/admin-actions';
import { AnalysisCard } from '@/components/AnalysisCard';
import { AnalysisModal } from '@/components/AnalysisModal';
import { GroupParticipantSelector } from '@/components/GroupParticipantSelector';
import { HowToExport } from '@/components/HowToExport';
import { UpgradeModal } from '@/components/UpgradeModal';
import RegenerateConfirmModal from '@/components/RegenerateConfirmModal';
import LongChatAnalysisChoiceModal from '@/components/LongChatAnalysisChoiceModal';
import AskTheAuntModal from '@/components/AskTheAuntModal';
import { BrainIcon, GroupIcon, HappyIcon, SecretIcon, WarningIcon, LightbulbIcon } from '@/components/Icons';
import { Lock, Star, Zap, User, Heart, Shield, Search, Sparkles, Quote, FileText, Crown, CheckCircle, XCircle, AlertCircle, TrendingUp, Gift, Hash } from 'lucide-react';
import { 
  LOGO_URL, 
  TIER_CONFIG, 
  ANALYSIS_CONFIG, 
  MAX_FILE_SIZE_BYTES,
  PRIVACY_DISCLAIMER_TEXT,
  LOADING_MESSAGES_PHASE_1,
  LOADING_MESSAGES_PHASE_2,
  LOADING_MESSAGES_PHASE_3
} from '@/lib/constants';
import { logClientError, isServerActionNotFoundError, getClientErrorMessage } from '@/lib/client-logger';
import { getStoredTestAuthEmail } from '@/lib/auth';
import AuthDetails from '@/components/AuthDetails';
import PromoCodeModal from '@/components/PromoCodeModal';
import { auth } from '@/lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  analytics, 
  MixpanelEvents, 
  trackFileUpload, 
  trackAnalysis, 
  trackShare, 
  trackImageGeneration, 
  trackFeedback,
  trackButtonClick 
} from '@/lib/mixpanel';

export default function HomePage() {
  const AUTH_DISABLED_FOR_TESTING = true;
  const ASK_THE_AUNT_MAX_EXTRA_FILES = 3;
  const ASK_AUNT_GENERAL_RESULT_KEY = '__ASK_AUNT_GENERAL__';
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
  const pastedChatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const isLoadingRef = useRef(false);
  isLoadingRef.current = loading || isProcessingFile;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatCode, setChatCode] = useState<string | null>(null);
  const [cachedOutputs, setCachedOutputs] = useState<Record<string, any>>({});
  const [isNewSessionMode, setIsNewSessionMode] = useState<boolean>(false);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [testAuthEmail, setTestAuthEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [uploadLimitData, setUploadLimitData] = useState({ currentCount: 0, maxUploads: 2 });
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<{type: AnalysisType, participants?: string[]} | null>(null);
  const [analysisDepthMode, setAnalysisDepthMode] = useState<AnalysisDepthMode | null>(null);
  const [uploadedWordCount, setUploadedWordCount] = useState(0);
  const [showLongChatChoiceModal, setShowLongChatChoiceModal] = useState(false);
  const [pendingLongChatAnalysis, setPendingLongChatAnalysis] = useState<{ type: AnalysisType, participants?: string[] } | null>(null);
  const [showPromoCodeModal, setShowPromoCodeModal] = useState(false);
  const [pastedChatText, setPastedChatText] = useState("");
  const [showAskTheAuntModal, setShowAskTheAuntModal] = useState(false);
  const [isAskTheAuntGeneralQuestion, setIsAskTheAuntGeneralQuestion] = useState(false);
  const [askTheAuntTargetUser, setAskTheAuntTargetUser] = useState<string | null>(null);
  const [askTheAuntQuestion, setAskTheAuntQuestion] = useState('');
  const [askTheAuntWantsExtraChats, setAskTheAuntWantsExtraChats] = useState(false);
  const [askTheAuntExtraFiles, setAskTheAuntExtraFiles] = useState<File[]>([]);
  const [askTheAuntError, setAskTheAuntError] = useState<string | null>(null);
  const [isAskTheAuntSubmitting, setIsAskTheAuntSubmitting] = useState(false);
  const [activeAskTheAuntResultKey, setActiveAskTheAuntResultKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (AUTH_DISABLED_FOR_TESTING) {
      setAuthUser(null);
      setTestAuthEmail(getStoredTestAuthEmail());
      setAuthChecking(false);
      setIsAdmin(false);
      setSelectedTier('super');
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthChecking(false);
      if (user) {
        setTestAuthEmail(null);
        // Check admin status
        user.getIdToken().then(token => {
          fetch('/api/check-admin', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setIsAdmin(data.isAdmin);
            }
          })
          .catch(err => console.error('Error checking admin:', err));
        });
        
        // Check user's tier for analysis limits
        checkUnlimitedAccessAction(user.uid).then(result => {
          if (result.hasUnlimited) {
            // User has unlimited access via promo code
            setSelectedTier('super');
          } else if (result.tier) {
            // Set tier based on their actual tier from Firestore
            setSelectedTier(result.tier as UserTier);
          }
        }).catch(err => {
          console.error('Error checking user tier:', err);
          // Keep default 'free' tier on error
        });
      } else {
        setTestAuthEmail(getStoredTestAuthEmail());
        setIsAdmin(false);
        setSelectedTier('free'); // Reset to free tier when logged out
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle browser back button to clear chat instead of logout
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.hasChatData) {
        // Do nothing, stay on chat view
      } else if (chatData) {
        // User pressed back while viewing chat - clear chat data
        clearLoadedChat();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [chatData]);

  const isAnalyzing = loading;

  const logUpload = async (participantsCount: number, anonymizedText: string, tokenCount: number, chatCode?: string | null) => {
    if (!authUser) return;
    try {
      const data = await logUploadAction(authUser.uid, participantsCount, tokenCount);
      setSessionId(data.sessionId);
      
      // Track in Mixpanel
      trackFileUpload(participantsCount, tokenCount, authUser.uid);
    } catch (e) { console.error("Log upload failed", e); }
  };

  const logButton = async (buttonId: string) => {
    try {
      await logButtonClickAction(buttonId);
      
      // Track in Mixpanel
      trackButtonClick(buttonId, undefined, authUser?.uid);
    } catch (e) { console.error("Log button failed", e); }
  };
  
  const logShare = async (type: string, platform: string) => {
    if (!sessionId || !authUser) return;
    try {
        await logShareAction(authUser.uid, sessionId, type, platform);
        
        // Track in Mixpanel
        trackShare(platform, type, authUser.uid);
    } catch (e) { console.error("Log share failed", e); }
  };

  const logImageGeneration = async () => {
    if (!sessionId || !authUser) return;
    try {
        await logImageGenerationAction(authUser.uid, sessionId, 'generated_cartoon_image');
        
        // Track in Mixpanel
        trackImageGeneration('generated_cartoon_image', authUser.uid);
    } catch (e) { console.error("Log image generation failed", e); }
  };

  const logFeedback = async (rating: number, comment: string) => {
    if (!sessionId || !authUser) return;
    try {
        await logFeedbackAction(authUser.uid, sessionId, rating, comment);
        
        // Track in Mixpanel
        trackFeedback(rating, !!comment, authUser.uid);
    } catch (e) { console.error("Log feedback failed", e); }
  };

  const escapeRegex = (value: string): string => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const deanonymizeText = (value: any, reverseMap: Record<string, string>): string => {
    if (typeof value !== 'string') {
      console.warn('deanonymizeText received non-string type:', typeof value);
      return value;
    }

    let text = value || '';
    text = text.replace(/\[Participant_(\d+)\]/g, 'P$1');

    const sortedKeys = Object.keys(reverseMap).sort((a, b) => b.length - a.length);
    if (sortedKeys.length === 0) {
      return text;
    }

    const pattern = new RegExp(sortedKeys.map((key) => escapeRegex(key)).join('|'), 'g');
    return text.replace(pattern, (matched) => reverseMap[matched] || matched);
  };

  const getApiErrorMessage = async (response: Response, fallback: string): Promise<string> => {
    if ([502, 503, 504, 522, 524].includes(response.status)) {
      return 'שרת הניתוח לא הספיק להשיב בזמן. נסו שוב בעוד רגע, או נסו ניתוח קצר יותר.';
    }

    try {
      const data = await response.clone().json();
      if (typeof data?.error === 'string' && data.error.trim()) {
        return data.error.trim();
      }
    } catch {}

    try {
      const text = await response.text();
      const trimmedText = text.trim();
      if (trimmedText && !/^<!DOCTYPE|^<html/i.test(trimmedText)) {
        return trimmedText;
      }
    } catch {}

    if (response.statusText?.trim()) {
      return `${fallback}: ${response.statusText.trim()}`;
    }

    return `${fallback} (${response.status})`;
  };

  const resetAskTheAuntState = () => {
    setShowAskTheAuntModal(false);
    setIsAskTheAuntGeneralQuestion(false);
    setAskTheAuntTargetUser(null);
    setAskTheAuntQuestion('');
    setAskTheAuntWantsExtraChats(false);
    setAskTheAuntExtraFiles([]);
    setAskTheAuntError(null);
    setIsAskTheAuntSubmitting(false);
    setActiveAskTheAuntResultKey(null);
  };

  const buildAskTheAuntContext = (
    targetDisplayName: string | null,
    extraChats: ParsedChat[]
  ): { chatSections: ChatRecordSection[]; reverseMap: Record<string, string>; targetUser: string | null } => {
    if (!chatData) {
      throw new Error('No chat is currently loaded.');
    }

    if (targetDisplayName === null) {
      return {
        chatSections: [
          {
            label: 'צ׳אט מקורי',
            messages: chatData.anonymizedMessages
          }
        ],
        reverseMap: { ...chatData.reverseMap },
        targetUser: null
      };
    }

    const targetDisplayNameValue = targetDisplayName;
    const aliases = buildPersonReferenceAliases(targetDisplayNameValue, chatData.participants);
    const targetUser = chatData.nameMap[targetDisplayNameValue] || targetDisplayNameValue;
    const combinedReverseMap: Record<string, string> = { ...chatData.reverseMap };
    const globalNameMap: Record<string, string> = { ...chatData.nameMap };
    let nextPlaceholderNumber = Object.keys(combinedReverseMap).reduce((max, key) => {
      const match = key.match(/^P(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;

    const remapChat = (parsedChat: ParsedChat, label: string): ChatRecordSection | null => {
      const anonymizedLookup = createMessageLookup(parsedChat.anonymizedMessages);
      const localToGlobalPlaceholders: Record<string, string> = {};

      Object.entries(parsedChat.reverseMap).forEach(([localPlaceholder, realName]) => {
        if (messageIsByPerson(realName, aliases)) {
          localToGlobalPlaceholders[localPlaceholder] = targetUser;
          combinedReverseMap[targetUser] = targetDisplayNameValue;
          return;
        }

        let globalPlaceholder = globalNameMap[realName];
        if (!globalPlaceholder) {
          globalPlaceholder = `P${nextPlaceholderNumber++}`;
          globalNameMap[realName] = globalPlaceholder;
          combinedReverseMap[globalPlaceholder] = realName;
        }

        localToGlobalPlaceholders[localPlaceholder] = globalPlaceholder;
      });

      const sortedLocalPlaceholders = Object.keys(localToGlobalPlaceholders).sort((a, b) => b.length - a.length);

      const filteredMessages = parsedChat.messages.reduce((acc, message) => {
        if (!isMessageByOrAboutPerson(message, aliases)) {
          return acc;
        }

        const lookupKey = createMessageLookupKey(message);
        const bucket = anonymizedLookup.get(lookupKey);
        const matchedMessage = bucket?.shift();

        if (!matchedMessage) {
          return acc;
        }

        if (bucket && bucket.length === 0) {
          anonymizedLookup.delete(lookupKey);
        }

        let remappedSender = matchedMessage.sender;
        let remappedContent = matchedMessage.content;

        sortedLocalPlaceholders.forEach((localPlaceholder) => {
          const globalPlaceholder = localToGlobalPlaceholders[localPlaceholder];
          const placeholderPattern = new RegExp(escapeRegex(localPlaceholder), 'g');
          remappedContent = remappedContent.replace(placeholderPattern, globalPlaceholder);
          if (remappedSender === localPlaceholder) {
            remappedSender = globalPlaceholder;
          }
        });

        remappedContent = replacePersonAliasesInText(remappedContent, aliases, targetUser);
        if (messageIsByPerson(message.sender, aliases)) {
          remappedSender = targetUser;
        }

        if (!remappedContent.trim()) {
          return acc;
        }

        acc.push({
          ...matchedMessage,
          sender: remappedSender,
          content: remappedContent
        });

        return acc;
      }, [] as ChatMessage[]);

      if (filteredMessages.length === 0) {
        return null;
      }

      return {
        label,
        messages: filteredMessages
      };
    };

    const sections = [
      remapChat(chatData, 'צ׳אט מקורי'),
      ...extraChats.map((parsedChat, index) => remapChat(parsedChat, `צ׳אט נוסף ${index + 1}`))
    ].filter(Boolean) as ChatRecordSection[];

    if (sections.length === 0) {
      throw new Error('לא מצאתי מספיק הודעות רלוונטיות על האדם שבחרתם.');
    }

    return {
      chatSections: sections,
      reverseMap: combinedReverseMap,
      targetUser
    };
  };

  const clearLoadedChat = () => {
    setChatData(null);
    setSelectedUser(null);
    setUserAnalysisData({});
    setActiveAnalysisType(null);
    setCachedOutputs({});
    setChatCode(null);
    setUploadedWordCount(0);
    setAnalysisDepthMode(null);
    setShowLongChatChoiceModal(false);
    setPendingLongChatAnalysis(null);
    resetAskTheAuntState();
  };

  const renderPaidTierBadge = (positionClasses = 'top-4 left-4') => {
    if (selectedTier !== 'basic' && selectedTier !== 'super') {
      return null;
    }

    const isSuperTier = selectedTier === 'super';
    const badgeLabel = isSuperTier ? 'Super User' : 'Basic User';
    const badgeClasses = isSuperTier
      ? 'from-amber-500 to-orange-500 text-white shadow-amber-500/30'
      : 'from-indigo-600 to-violet-600 text-white shadow-indigo-500/30';
    const Icon = isSuperTier ? Star : Zap;

    return (
      <div className={`fixed ${positionClasses} z-[60]`}>
        <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-4 py-2 text-sm font-bold shadow-lg ${badgeClasses}`}>
          <Icon className="w-4 h-4" />
          <span>{badgeLabel}</span>
        </div>
      </div>
    );
  };

  const isPaidTier = selectedTier === 'basic' || selectedTier === 'super';
  const hasVisibleAuthSession = !!authUser || !!testAuthEmail;
  const isPaidLongChat = isPaidTier && uploadedWordCount > 50000;
  const getRequestedAnalysisMode = (): AnalysisDepthMode => {
    if (selectedTier === 'free') {
      return 'standard';
    }

    if (isPaidLongChat) {
      return analysisDepthMode || 'deep';
    }

    return 'deep';
  };

  const getAnalysisModeCacheSuffix = (): string => {
    return isPaidLongChat ? `_${getRequestedAnalysisMode()}` : '';
  };

  const buildCacheKey = (baseKey: string): string => {
    if (!baseKey) return '';
    return `${baseKey}${getAnalysisModeCacheSuffix()}`;
  };

  const hasParticipantAxisSection = (value: unknown): boolean => {
    return (
      typeof value === 'string' &&
      value.includes('מפת הצירים של המשתתפים') &&
      value.includes('דירוג הליברליזם הוא') &&
      value.includes('דירוג ההומור הוא') &&
      !value.includes('עדיין אין מספיק נתונים להשוואה רחבה')
    );
  };

  const handleOpenAskTheAuntModal = (mode: 'person' | 'general' = 'person') => {
    if (!chatData) return;

    const isGeneralMode = mode === 'general';

    setAskTheAuntError(null);
    setIsAskTheAuntGeneralQuestion(isGeneralMode);
    if (isGeneralMode) {
      setAskTheAuntWantsExtraChats(false);
      setAskTheAuntExtraFiles([]);
    } else {
      setAskTheAuntTargetUser(selectedUser || askTheAuntTargetUser || chatData.participants[0] || null);
    }
    setShowAskTheAuntModal(true);
  };

  const handleCloseAskTheAuntModal = () => {
    setShowAskTheAuntModal(false);
    setAskTheAuntError(null);
  };

  const handleAskTheAuntWantsExtraChatsChange = (value: boolean) => {
    if (isAskTheAuntGeneralQuestion) {
      setAskTheAuntWantsExtraChats(false);
      setAskTheAuntExtraFiles([]);
      return;
    }

    setAskTheAuntWantsExtraChats(value);
    setAskTheAuntError(null);

    if (!value) {
      setAskTheAuntExtraFiles([]);
    }
  };

  const handleAskTheAuntExtraFilesSelected = (files: FileList | null) => {
    if (!files) return;

    if (isAskTheAuntGeneralQuestion) {
      setAskTheAuntError('בשאלה כללית אי אפשר לצרף קבצים נוספים.');
      return;
    }

    const incomingFiles = Array.from(files);
    if (incomingFiles.length === 0) return;

    const unsupportedFile = incomingFiles.find((file) => !isSupportedChatUploadFile(file));
    if (unsupportedFile) {
      setAskTheAuntError(`הקובץ "${unsupportedFile.name}" אינו נתמך. העלו קובץ TXT או ZIP בלבד.`);
      return;
    }

    const oversizedFile = incomingFiles.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversizedFile) {
      setAskTheAuntError(`הקובץ "${oversizedFile.name}" גדול מדי. הגודל המקסימלי הוא 10MB.`);
      return;
    }

    const mergedFiles = [...askTheAuntExtraFiles];
    incomingFiles.forEach((file) => {
      const alreadyExists = mergedFiles.some((existingFile) =>
        existingFile.name === file.name &&
        existingFile.size === file.size &&
        existingFile.lastModified === file.lastModified
      );

      if (!alreadyExists) {
        mergedFiles.push(file);
      }
    });

    if (mergedFiles.length > ASK_THE_AUNT_MAX_EXTRA_FILES) {
      setAskTheAuntError(`אפשר לצרף עד ${ASK_THE_AUNT_MAX_EXTRA_FILES} צ'אטים נוספים.`);
      setAskTheAuntExtraFiles(mergedFiles.slice(0, ASK_THE_AUNT_MAX_EXTRA_FILES));
      return;
    }

    setAskTheAuntError(null);
    setAskTheAuntExtraFiles(mergedFiles);
  };

  const handleRemoveAskTheAuntFile = (index: number) => {
    setAskTheAuntExtraFiles((previousFiles) => previousFiles.filter((_, fileIndex) => fileIndex !== index));
    setAskTheAuntError(null);
  };

  const handleAskTheAuntSubmit = async () => {
    if (!chatData) return;

    const targetDisplayName = isAskTheAuntGeneralQuestion ? null : (askTheAuntTargetUser || selectedUser);
    const trimmedQuestion = askTheAuntQuestion.trim();
    const resultKey = targetDisplayName || ASK_AUNT_GENERAL_RESULT_KEY;

    if (!isAskTheAuntGeneralQuestion && !targetDisplayName) {
      setAskTheAuntError('בחרו את האדם שעליו אתם רוצים לשאול.');
      return;
    }

    if (!trimmedQuestion) {
      setAskTheAuntError('כתבו שאלה אחת ברורה כדי שאפשר יהיה לנתח אותה.');
      return;
    }

    if (!isAskTheAuntGeneralQuestion && askTheAuntWantsExtraChats && askTheAuntExtraFiles.length === 0) {
      setAskTheAuntError('סמנו לפחות קובץ אחד, או בחרו להמשיך רק עם הצ׳אט המקורי.');
      return;
    }

    setAskTheAuntError(null);
    setIsAskTheAuntSubmitting(true);
    if (authUser) {
      trackAnalysis(AnalysisType.ASK_AUNT, authUser.uid);
    }

    try {
      const extraParsedChats: ParsedChat[] = [];

      if (!isAskTheAuntGeneralQuestion && askTheAuntWantsExtraChats) {
        for (const file of askTheAuntExtraFiles) {
          const fileText = await readChatUploadFile(file, MAX_FILE_SIZE_BYTES);
          const parsedChat = await parseChatFile(fileText);
          extraParsedChats.push(parsedChat);
        }
      }

      const askContext = buildAskTheAuntContext(targetDisplayName, extraParsedChats);
      if (targetDisplayName) {
        setSelectedUser(targetDisplayName);
      }
      setShowAskTheAuntModal(false);
      setLoading(true);
      setActiveAnalysisType(AnalysisType.ASK_AUNT);
      setActiveAskTheAuntResultKey(resultKey);
      setCurrentLoadingSnippet(getNextHighlight());

      const response = await fetch('/api/ask-the-aunt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatSections: askContext.chatSections,
          targetUser: askContext.targetUser,
          question: trimmedQuestion
        })
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || await getApiErrorMessage(response, 'Analysis failed'));
      }

      const answer = PRIVACY_DISCLAIMER_TEXT + deanonymizeText(responseData.result || '', askContext.reverseMap);
      setUserAnalysisData((previousData) => ({
        ...previousData,
        [resultKey]: {
          ...(previousData[resultKey] || {}),
          [AnalysisType.ASK_AUNT]: answer
        }
      }));

      setAskTheAuntQuestion('');
      setAskTheAuntWantsExtraChats(false);
      setAskTheAuntExtraFiles([]);
      setAskTheAuntError(null);
      if (targetDisplayName) {
        setAskTheAuntTargetUser(targetDisplayName);
      }
    } catch (error: any) {
      logClientError('Ask the Aunt analysis failed', error, {
        userId: authUser?.uid,
        selectedUser: targetDisplayName || undefined,
        chatCode,
        action: 'askTheAunt'
      });
      setActiveAnalysisType(null);
      setShowAskTheAuntModal(true);
      setAskTheAuntError(getClientErrorMessage(error));
    } finally {
      setLoading(false);
      setIsAskTheAuntSubmitting(false);
    }
  };

  const runAnalysis = async (type: AnalysisType, participants?: string[], bypassCache: boolean = false) => {
    logButton(type);

    // Allow guest analysis during local testing; only track identified users.
    if (authUser) {
      trackAnalysis(type, authUser.uid);
    }

    await executeAnalysis(type, participants, bypassCache);
  };

  const handleOpenPromoCodeModal = () => {
    setShowPromoCodeModal(true);
  };

  const refreshUserTier = async () => {
    if (!authUser) return;
    
    try {
      const result = await checkUnlimitedAccessAction(authUser.uid);
      if (result.hasUnlimited) {
        setSelectedTier('super');
      } else if (result.tier) {
        setSelectedTier(result.tier as UserTier);
      }
    } catch (err) {
      console.error('Error refreshing user tier:', err);
    }
  };

  const handleUpgrade = async (tier: 'basic' | 'super') => {
    if (!authUser) return;
    
    const tierNames = {
      basic: 'מנוי בסיסי (10 ניתוחים ביום)',
      super: 'מנוי-על (50 ניתוחים ביום)'
    };
    
    try {
      const response = await fetch('/api/reset-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: authUser.uid, tier })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowUpgradeModal(false);
        alert(`מעולה! שודרגת ל${tierNames[tier]}! המגבלה אופסה ואתה יכול להמשיך לנתח צ׳אטים! 🎉`);
        // Trigger file upload again if needed
      } else {
        alert('אירעה שגיאה. נסה שוב.');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('אירעה שגיאה בשדרוג.');
    }
  };

  const storeChat = async (text: string) => {
    // Chat inputs and analysis outputs are intentionally kept out of persistent storage.
    setCachedOutputs({});
    setChatCode(null);
    return null;
  };

  const handleFileLoaded = async (text: string) => {
    // Allow file upload without login, but check limits for logged-in users
    if (authUser) {
      // Check daily upload limit for authenticated users
      try {
        const checkResponse = await fetch('/api/track-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: authUser.uid, action: 'check' })
        });
        
        if (!checkResponse.ok) {
          const errorData = await checkResponse.json();
          console.error('Upload check failed:', errorData);
          
          // If it's just a missing user document, continue (will be created on increment)
          if (checkResponse.status !== 500) {
            alert('אירעה שגיאה בבדיקת המגבלה היומית.');
            return;
          }
        } else {
          const checkData = await checkResponse.json();
          
          if (!checkData.canUpload) {
            alert('הגעת למגבלה היומית של העלאות. השתמש בקוד חברים (לחץ על כפתור המתנה 🎁) לקבלת גישה בלתי מוגבלת!');
            return;
          }
        }
      } catch (error) {
        console.error('Error checking upload limit:', error);
        // Don't block upload on check error - just log it
      }
    }

    setIsProcessingFile(true);
    setProcessingProgress(0);
    setHighlights([]);
    usedHighlightIndicesRef.current.clear();
    setSessionId(null); // Reset session on new file
    setUploadedWordCount(0);
    setAnalysisDepthMode(null);
    setShowLongChatChoiceModal(false);
    setPendingLongChatAnalysis(null);
    // Don't reset chatCode and cachedOutputs here - let storeChat handle it

    try {
      const parsed = await parseChatFile(text, (percent) => setProcessingProgress(percent));
      if (!parsed || parsed.messages.length === 0) {
        alert("לא נמצאו הודעות בקובץ.");
        setIsProcessingFile(false);
        return;
      }

      const totalWordCount = getTotalWordCount(parsed.anonymizedMessages);

      let lastDate = "";
      let lastSender = "";

      let formattedAnonymizedText = parsed.anonymizedMessages.map(m => {
        const dateStr = formatChatDate(m.date);
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

      // No truncation - analyze full chat history for all users

      // Calculate token count based on character count / 4
      const estimatedTokens = Math.ceil(formattedAnonymizedText.length / 4);

      // Store chat and log upload only for authenticated users
      let code = null;
      if (authUser) {
        code = await storeChat(formattedAnonymizedText);
        await logUpload(parsed.participants.length, formattedAnonymizedText, estimatedTokens, code);
      }

      // Increment upload count after successful upload (only for logged-in users)
      if (authUser) {
        try {
          const incrementResponse = await fetch('/api/track-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: authUser.uid, action: 'increment' })
          });
          
          if (!incrementResponse.ok) {
            console.error('Failed to increment upload count');
          }
        } catch (error) {
          console.error('Error incrementing upload count:', error);
        }
      }

      const deanonymize = (t: any): string => {
        // Type guard - return as-is if not a string
        if (typeof t !== 'string') {
          console.warn('deanonymize received non-string type:', typeof t);
          return t;
        }
        
        let txt = t || "";
        if (!parsed.reverseMap) return txt;
        const sortedKeys = Object.keys(parsed.reverseMap).sort((a, b) => b.length - a.length);
        const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "g");
        txt = txt.replace(pattern, matched => parsed.reverseMap[matched] || matched);
        return txt;
      };

      const metadata = await getChatMetadata(parsed.loadingPreviewMessages);
      if (metadata.highlights) setHighlights(metadata.highlights.map(deanonymize));

      setChatData(parsed);
      setUploadedWordCount(totalWordCount);
      setAnalysisDepthMode(null);
      setSelectedUser(null);
      setUserAnalysisData({});
      setActiveAnalysisType(null);
      
      // Push history state so back button clears chat instead of logout
      window.history.pushState({ hasChatData: true }, '', window.location.href);
    } catch (error: any) {
      logClientError('Error in handleFileLoaded', error, {
        userId: authUser?.uid,
        page: 'main',
        action: 'handleFileLoaded'
      });
      
      const errorMessage = getClientErrorMessage(error);
      alert(`שגיאה: ${errorMessage}`);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handlePastedTextSubmit = async () => {
    const normalizedText = pastedChatText.trim();
    if (!normalizedText) {
      alert("הדביקו כאן טקסט של צ'אט כדי להתחיל בניתוח.");
      return;
    }

    await handleFileLoaded(normalizedText);
  };

  const focusPasteInput = () => {
    pastedChatInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pastedChatInputRef.current?.focus();
  };

  const getNextHighlight = () => {
    if (highlights.length === 0) return "מעבד את הנתונים באופן אנונימי...";
    const available = highlights.map((_, i) => i).filter(i => !usedHighlightIndicesRef.current.has(i));
    const idx = available.length === 0 ? Math.floor(Math.random() * highlights.length) : available[Math.floor(Math.random() * available.length)];
    usedHighlightIndicesRef.current.add(idx);
    return highlights[idx];
  };

  // Helper to check if cache exists for this analysis
  const getCacheKey = (type: AnalysisType, participants?: string[]): string => {
    if (type === AnalysisType.GROUP_DYNAMICS) {
      return buildCacheKey(createGroupDynamicsCacheKey(participants, selectedTier));
    }
    if (type === AnalysisType.ROMANTIC_DYNAMICS) {
      return buildCacheKey(createRomanticDynamicsCacheKey(selectedTier));
    }
    if (selectedUser && chatData) {
      const anonUser = chatData.nameMap[selectedUser] || selectedUser;
      return buildCacheKey(createFullAnalysisCacheKey(anonUser, selectedTier));
    }
    return '';
  };

  // Execute analysis with optional cache bypass
  const executeAnalysis = async (type: AnalysisType, participants?: string[], bypassCache: boolean = false) => {
    if (!chatData) return;
    const requestedAnalysisMode = getRequestedAnalysisMode();

    if (type === AnalysisType.GROUP_DYNAMICS) {
      setLoading(true);
      setActiveAnalysisType(type);
      setCurrentLoadingSnippet(getNextHighlight());
      try {
        // No character limit - analyze full chat history
        const limit = Infinity;
        
        // Check cache for group dynamics
        const cacheKey = buildCacheKey(createGroupDynamicsCacheKey(participants, selectedTier));
        
        let result = "";
        let strategy: 'full' | 'sampled' | undefined;
        let originalWordCount: number | undefined;
        
        const cachedGroupOutput = cachedOutputs[cacheKey]?.output;
        const canUseCachedGroupOutput = !bypassCache && hasParticipantAxisSection(cachedGroupOutput);

        if (canUseCachedGroupOutput) {
            result = cachedGroupOutput;
            strategy = cachedOutputs[cacheKey].strategy;
            originalWordCount = cachedOutputs[cacheKey].originalWordCount;
        } else {
            const response = await fetch('/api/analyze-group-dynamics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: chatData.anonymizedMessages,
                selectedParticipants: participants,
                limit,
                tier: selectedTier,
                analysisMode: requestedAnalysisMode
              })
            });
             
            if (!response.ok) {
              throw new Error(await getApiErrorMessage(response, 'Analysis failed'));
            }
            
            const analysisResult = await response.json();
            result = analysisResult.result;
            strategy = analysisResult.strategy;
            originalWordCount = analysisResult.originalWordCount;
            // Update cache locally so subsequent calls use it
            setCachedOutputs(prev => ({ ...prev, [cacheKey]: { output: result, timestamp: new Date().toISOString(), strategy, originalWordCount } }));
            // Persist to storage
            if (chatCode && authUser) {
                updateChatCacheAction(authUser.uid, chatCode, cacheKey, result).catch(e => console.error('Failed to cache group dynamics', e));
            }
        }

        const deanonymize = (t: any): string => {
            // Type guard - return as-is if not a string
            if (typeof t !== 'string') {
              console.warn('deanonymize received non-string type:', typeof t);
              return t;
            }
            
            let txt = t || "";
            if (!chatData.reverseMap) return txt;
            // Normalize [Participant_X] to PX to handle model output discrepancies
            txt = txt.replace(/\[Participant_(\d+)\]/g, 'P$1');
            
            const sortedKeys = Object.keys(chatData.reverseMap).sort((a, b) => b.length - a.length);
            const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "g");
            return txt.replace(pattern, matched => chatData.reverseMap[matched] || matched);
        };
        
        setUserAnalysisData(prev => ({ ...prev, GROUP: { content: PRIVACY_DISCLAIMER_TEXT + deanonymize(result) } }));
      } catch (e: any) { 
        logClientError('Group dynamics analysis failed', e, {
          userId: authUser?.uid,
          chatCode,
          action: 'analyzeGroupDynamics'
        });
        alert(getClientErrorMessage(e)); 
        setActiveAnalysisType(null); 
      }
      finally { setLoading(false); }
      return;
    }

    if (type === AnalysisType.ROMANTIC_DYNAMICS) {
      setLoading(true);
      setActiveAnalysisType(type);
      setCurrentLoadingSnippet(getNextHighlight());
      try {
        // No character limit - analyze full chat history
        const limit = Infinity;
        
        // Check cache
        const cacheKey = buildCacheKey(createRomanticDynamicsCacheKey(selectedTier));
        let result = "";
        if (!bypassCache && cachedOutputs[cacheKey]) {
            result = cachedOutputs[cacheKey].output;
        } else {
            const response = await fetch('/api/analyze-romantic-dynamics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: chatData.anonymizedMessages,
                limit,
                tier: selectedTier,
                analysisMode: requestedAnalysisMode
              })
            });
             
            if (!response.ok) {
              throw new Error(await getApiErrorMessage(response, 'Analysis failed'));
            }
            
            const responseData = await response.json();
            result = responseData.result ?? responseData;
            setCachedOutputs(prev => ({ ...prev, [cacheKey]: { output: result, timestamp: new Date().toISOString() } }));
            // Persist to storage
            if (chatCode && authUser) {
                updateChatCacheAction(authUser.uid, chatCode, cacheKey, result).catch(e => console.error('Failed to cache romantic dynamics', e));
            }
        }

        const deanonymize = (t: any): string => {
            // Type guard - return as-is if not a string
            if (typeof t !== 'string') {
              console.warn('deanonymize received non-string type:', typeof t);
              return t;
            }
            
            let txt = t || "";
            if (!chatData.reverseMap) return txt;
            txt = txt.replace(/\[Participant_(\d+)\]/g, 'P$1');
            const sortedKeys = Object.keys(chatData.reverseMap).sort((a, b) => b.length - a.length);
            const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "g");
            return txt.replace(pattern, matched => chatData.reverseMap[matched] || matched);
        };
        setUserAnalysisData(prev => ({ ...prev, ROMANTIC: { content: PRIVACY_DISCLAIMER_TEXT + deanonymize(result) } }));
      } catch (e: any) { 
        logClientError('Romantic dynamics analysis failed', e, {
          userId: authUser?.uid,
          chatCode,
          action: 'analyzeRomanticDynamics'
        });
        alert(getClientErrorMessage(e)); 
        setActiveAnalysisType(null); 
      }
      finally { setLoading(false); }
      return;
    }

    if (!selectedUser) return;

    // Check if we already have full analysis for this user in local state
    // Skip this check if we're explicitly regenerating (bypassCache=true)
    if (!bypassCache && userAnalysisData[selectedUser]) {
      setActiveAnalysisType(type);
      return;
    }

    setLoading(true);
    setActiveAnalysisType(type);
    setCurrentLoadingSnippet(getNextHighlight());

    try {
      // No character limit - analyze full chat history
      const limit = Infinity;
      const anonUser = chatData.nameMap[selectedUser] || selectedUser;
      
      // Check cache for full analysis
      const cacheKey = buildCacheKey(createFullAnalysisCacheKey(anonUser, selectedTier));
      let rawResult: any = {};
      let strategy: 'full' | 'sampled' | undefined;
      let originalWordCount: number | undefined;

      if (!bypassCache && cachedOutputs[cacheKey]) {
          rawResult = cachedOutputs[cacheKey].output;
          strategy = cachedOutputs[cacheKey].strategy;
          originalWordCount = cachedOutputs[cacheKey].originalWordCount;
      } else {
          const response = await fetch('/api/analyze-chat-full', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: chatData.anonymizedMessages,
              targetUser: anonUser,
              limit,
              tier: selectedTier,
              analysisMode: requestedAnalysisMode
            })
          });
          
          if (!response.ok) {
            throw new Error(await getApiErrorMessage(response, 'Analysis failed'));
          }
          
          const analysisResult = await response.json();
          rawResult = {
            personality: analysisResult.personality,
            othersThoughts: analysisResult.othersThoughts,
            improvement: analysisResult.improvement,
            hiddenThoughts: analysisResult.hiddenThoughts
          };
          strategy = analysisResult.strategy;
          originalWordCount = analysisResult.originalWordCount;
          // Update cache locally
          setCachedOutputs(prev => ({ ...prev, [cacheKey]: { output: rawResult, timestamp: new Date().toISOString(), strategy, originalWordCount } }));
          // Persist to storage
          if (chatCode && authUser) {
              updateChatCacheAction(authUser.uid, chatCode, cacheKey, rawResult).catch(e => console.error('Failed to cache full analysis', e));
          }
      }
      
      const deanonymize = (t: any): string => {
        // Type guard - return as-is if not a string
        if (typeof t !== 'string') {
          console.warn('deanonymize received non-string type:', typeof t);
          return t;
        }
        
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
    } catch (e: any) { 
      logClientError('Full chat analysis failed', e, {
        userId: authUser?.uid,
        selectedUser,
        chatCode,
        action: 'analyzeChatFull'
      });
      alert(getClientErrorMessage(e)); 
      setActiveAnalysisType(null); 
    }
    finally { setLoading(false); }
  };

  const triggerAnalysis = async (type: AnalysisType, participants?: string[]) => {
    if (!chatData) return;

    if (type === AnalysisType.ASK_AUNT) {
      await logButton('ASK_AUNT_INIT');
      handleOpenAskTheAuntModal('person');
      return;
    }

    if (isPaidLongChat && !analysisDepthMode) {
      setPendingLongChatAnalysis({ type, participants });
      setShowLongChatChoiceModal(true);
      return;
    }

    // Always execute with existing cache (bypassCache: false)
    // User can regenerate from within the modal if they want
    await runAnalysis(type, participants, false);
  };

  const handleUseExistingAnalysis = () => {
    if (pendingAnalysis) {
      runAnalysis(pendingAnalysis.type, pendingAnalysis.participants, false);
    }
    setShowRegenerateConfirm(false);
    setPendingAnalysis(null);
  };

  const handleGenerateNewAnalysis = () => {
    if (pendingAnalysis) {
      // Clear cache and local state before regenerating
      const cacheKey = getCacheKey(pendingAnalysis.type, pendingAnalysis.participants);
      
      // Clear the cache entry
      if (cacheKey) {
        setCachedOutputs(prev => {
          const newCache = { ...prev };
          delete newCache[cacheKey];
          return newCache;
        });
      }
      
      // Clear local state based on analysis type
      if (pendingAnalysis.type === AnalysisType.GROUP_DYNAMICS) {
        setUserAnalysisData(prev => {
          const newData = { ...prev };
          delete newData.GROUP;
          return newData;
        });
      } else if (pendingAnalysis.type === AnalysisType.ROMANTIC_DYNAMICS) {
        setUserAnalysisData(prev => {
          const newData = { ...prev };
          delete newData.ROMANTIC;
          return newData;
        });
      } else if (selectedUser) {
        setUserAnalysisData(prev => {
          const newData = { ...prev };
          delete newData[selectedUser];
          return newData;
        });
      }
      
      // Now execute analysis with cache bypass
      runAnalysis(pendingAnalysis.type, pendingAnalysis.participants, true);
    }
    setShowRegenerateConfirm(false);
    setPendingAnalysis(null);
  };

  const handleCloseRegenerateModal = () => {
    setShowRegenerateConfirm(false);
    setPendingAnalysis(null);
  };

  const handleCloseLongChatChoiceModal = () => {
    setShowLongChatChoiceModal(false);
    setPendingLongChatAnalysis(null);
  };

  const handleChooseLongChatAnalysisMode = async (mode: AnalysisDepthMode) => {
    setAnalysisDepthMode(mode);
    setShowLongChatChoiceModal(false);

    if (pendingLongChatAnalysis) {
      const analysisToRun = pendingLongChatAnalysis;
      setPendingLongChatAnalysis(null);
      await runAnalysis(analysisToRun.type, analysisToRun.participants, false);
    }
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
    if (activeAnalysisType === AnalysisType.ASK_AUNT) {
      const resultKey = activeAskTheAuntResultKey || selectedUser || ASK_AUNT_GENERAL_RESULT_KEY;
      return userAnalysisData[resultKey]?.[AnalysisType.ASK_AUNT] || "";
    }
    if (!selectedUser) return "";
    return userAnalysisData[selectedUser]?.[activeAnalysisType] || "";
  };

  if (isProcessingFile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative">
        {renderPaidTierBadge('top-16 left-4')}
        <button 
          onClick={() => router.push('/admin/prompts')} 
          className="fixed top-4 left-4 p-2 text-slate-400 hover:text-slate-600 transition-colors z-50 opacity-50 hover:opacity-100 cursor-pointer"
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

        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleUpgrade}
          currentCount={uploadLimitData.currentCount}
          maxUploads={uploadLimitData.maxUploads}
          userId={authUser?.uid}
        />

        <RegenerateConfirmModal
          isOpen={showRegenerateConfirm}
          onClose={handleCloseRegenerateModal}
          onUseExisting={handleUseExistingAnalysis}
          onGenerateNew={handleGenerateNewAnalysis}
        />
      </div>
    );
  }

  if (!chatData) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 overflow-x-hidden relative">
        {renderPaidTierBadge()}
        <AuthDetails />

        {/* Top Header Bar for Profile/Admin - Only when logged in */}
        {hasVisibleAuthSession && (
          <div className="absolute top-0 left-0 right-0 z-50 px-4 py-2 sm:py-4 flex justify-end items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => router.push('/admin/prompts')}
                className="p-2 sm:p-2.5 bg-yellow-500/90 backdrop-blur-sm hover:bg-yellow-600 text-white rounded-xl transition-all cursor-pointer shadow-md hover:shadow-lg"
                title="Admin Panel"
              >
                <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
            <button
              onClick={handleOpenPromoCodeModal}
              type="button"
              className="p-2 sm:p-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 backdrop-blur-sm hover:from-amber-600 hover:to-yellow-600 text-white rounded-xl transition-all cursor-pointer shadow-md hover:shadow-lg"
              title="קוד חברים"
            >
              <Gift className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={() => router.push('/profile')}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white/90 backdrop-blur-sm hover:bg-white text-slate-800 rounded-xl transition-all cursor-pointer shadow-md hover:shadow-lg border border-slate-200/50"
            >
              <User className="w-4 h-4" />
              <span className="font-bold text-sm">הפרופיל שלי</span>
            </button>
          </div>
        )}

        {/* Hero Section */}
        <div className="bg-gradient-to-br from-teal-50 via-sky-50 to-indigo-50 relative overflow-hidden pb-24 pt-24 sm:pt-20 text-center text-slate-800">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]"></div>
           <div className="absolute -bottom-1 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent"></div>
           
           <div className="max-w-5xl mx-auto px-4 relative z-10">
              <div 
                onClick={() => hasVisibleAuthSession && router.push('/profile')}
                className={`inline-flex items-center justify-center p-1 bg-white/60 backdrop-blur-md rounded-full mb-8 shadow-xl animate-bounce-slow ring-4 ring-teal-100/50 ${hasVisibleAuthSession ? 'cursor-pointer hover:ring-indigo-200 hover:scale-105 transition-all' : ''}`}
                title={hasVisibleAuthSession ? 'הפרופיל שלי' : ''}
              >
                 <img src={LOGO_URL} className="w-24 h-24 rounded-full border-4 border-white shadow-sm" />
              </div>
              <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tight text-teal-900 drop-shadow-sm animate-fadeIn">הדודה</h1>
              <p className="text-xl md:text-3xl text-slate-600 max-w-3xl mx-auto mb-10 font-light leading-relaxed animate-fadeIn">
                הבינה המלאכותית שחושפת <span className="font-bold text-teal-700 border-b-2 border-teal-300">סודות, אהבות וקשיים</span> בשיחות ווטסאפ (ועוזרת לפתור אותם)
              </p>
              
              <HowToExport />

              <div className="max-w-6xl mx-auto bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl border border-white/50 transform hover:scale-[1.02] transition-transform duration-300">
                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
                    <div className="h-full">
                      <FileUpload onFileLoaded={handleFileLoaded} />
                    </div>

                    <div className="flex flex-col justify-between rounded-3xl border border-teal-100 bg-gradient-to-br from-white via-teal-50/70 to-cyan-50/80 p-5 shadow-sm">
                      <div className="text-right">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-teal-700 shadow-sm mb-4">
                          <FileText className="w-4 h-4" />
                          אפשר גם להדביק טקסט
                        </div>

                        <h3 className="text-2xl font-black text-slate-800 mb-3">
                          הדביקו כאן צ'אט טקסטואלי
                        </h3>

                        <p className="text-sm text-slate-600 leading-7 mb-4">
                          אם יש לכם צ'אטים טקסטואליים, אפשר פשוט להעתיק ולהדביק אותם כאן.
                          אנחנו ממליצים להעלות שיחות ודיונים ארוכים, כי הם מספקים את המשוב הטוב ביותר.
                        </p>
                      </div>

                      <textarea
                        ref={pastedChatInputRef}
                        value={pastedChatText}
                        onChange={(e) => setPastedChatText(e.target.value)}
                        placeholder={"הדביקו כאן את תוכן הצ'אט...\n\nדוגמה:\n[20/03/2026, 10:15] דנה: מה קורה?\n[20/03/2026, 10:16] יעל: הכל טוב, מה איתך?"}
                        className="min-h-[250px] w-full rounded-2xl border border-white/80 bg-white/90 px-4 py-4 text-sm leading-7 text-slate-700 shadow-inner focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 resize-none"
                        dir="rtl"
                      />

                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <p className="text-xs text-slate-500 text-right">
                          מתאים במיוחד לצ'אטים שכבר זמינים לכם כטקסט מוכן להעתקה.
                        </p>

                        <button
                          onClick={handlePastedTextSubmit}
                          disabled={isProcessingFile || !pastedChatText.trim()}
                          className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-md transition-all ${
                            isProcessingFile || !pastedChatText.trim()
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700 active:scale-95'
                          }`}
                        >
                          <Sparkles className="w-4 h-4" />
                          נתח טקסט מודבק
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/80 to-sky-50 p-5 shadow-sm">
                      <div className="text-right">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-indigo-700 shadow-sm mb-4">
                          <Hash className="w-4 h-4" />
                          העלאה מ-Slack
                        </div>

                        <h3 className="text-2xl font-black text-slate-800 mb-3">
                          הביאו טקסט מערוץ Slack
                        </h3>

                        <p className="text-sm text-slate-600 leading-7 mb-4">
                          אם יש לכם גישה לניהול הערוץ, אפשר לייצא את היסטוריית ההודעות מ-Slack,
                          להעתיק את הטקסט ולנתח אותו כאן.
                        </p>

                        <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm text-slate-600 space-y-3 leading-7">
                          <p>
                            1. פתחו את הערוץ הרלוונטי ב-Slack.
                          </p>
                          <p>
                            2. אם יש לכם הרשאות מתאימות, ייצאו את ההודעות או העתיקו את היסטוריית הערוץ.
                          </p>
                          <p>
                            3. אם האפשרות הזו לא זמינה, וזה בדרך כלל המצב למי שאינו אדמין בערוץ,
                            פשוט העתיקו את כל הטקסט ידנית והדביקו אותו בתיבת הטקסט שליד.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-3">
                        <p className="text-xs text-slate-500 text-right">
                          ברוב הארגונים ייצוא מסלאק דורש הרשאות ניהול, לכן תיבת ההדבקה היא החלופה המהירה ביותר.
                        </p>

                        <button
                          onClick={focusPasteInput}
                          className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-md transition-all bg-gradient-to-r from-indigo-600 to-sky-600 text-white hover:from-indigo-700 hover:to-sky-700 active:scale-95"
                        >
                          <FileText className="w-4 h-4" />
                          מעבר לתיבת ההדבקה
                        </button>
                      </div>
                    </div>
                 </div>

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

        {/* Highlighted Tip Section */}
        <div className="max-w-4xl mx-auto px-4 pb-16 -mt-8" dir="rtl">
          <div className="bg-gradient-to-r from-yellow-50 via-amber-50 to-orange-50 p-8 rounded-3xl shadow-lg border-2 border-amber-200/50 flex items-start gap-6">
              <div className="w-16 h-16 bg-amber-400 text-white rounded-2xl flex-shrink-0 flex items-center justify-center">
                  <LightbulbIcon className="w-8 h-8" />
              </div>
              <div>
                  <h3 className="text-2xl font-black text-amber-900 mb-3">איזה צ'אט יספק את הניתוח הטוב ביותר?</h3>
                  <p className="text-amber-800/90 leading-relaxed">
                      כדי לקבל את התוצאות המעמיקות והמדויקות ביותר, מומלץ להעלות צ'אטים ארוכים יותר, בהם אנשים מרגישים בנוח לחשוף רגשות אמיתיים - כמו קבוצות משפחתיות או חברים קרובים. עם זאת, גם שיחות פרטיות בין שני אנשים יכולות לחשוף תובנות מדהימות. אל תהססו, פשוט נסו!
                  </p>
              </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 pb-16 -mt-4" dir="rtl">
          <div className="relative overflow-hidden rounded-[2rem] border border-teal-100/80 bg-gradient-to-br from-white via-teal-50/70 to-cyan-50/80 p-8 shadow-[0_28px_80px_-45px_rgba(15,23,42,0.28)]">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl" />
            <div className="absolute -left-12 bottom-0 h-36 w-36 rounded-full bg-teal-200/20 blur-3xl" />

            <div className="relative z-10">
              <div className="mb-8 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/85 px-4 py-1.5 text-xs font-bold text-teal-700 shadow-sm mb-4">
                  <Shield className="w-4 h-4" />
                  פרטיות לפני הכל
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-3">למה הדודה שומרת עליכם טוב יותר</h2>
                <p className="text-slate-600 max-w-3xl mx-auto leading-7">
                  בנינו את החוויה כך שהצ&apos;אט שלכם ייחשף כמה שפחות, ושגם כשנעזרים ב-AI, המידע האישי שלכם יישאר מוגן ככל האפשר.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-lg shadow-teal-100/60">
                  <div className="w-14 h-14 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center mb-5">
                    <FileText className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-3">קובץ המקור לא נשמר כקובץ בענן</h3>
                  <p className="text-slate-600 leading-7 text-sm">
                    קובץ ה-WhatsApp או הטקסט שאתם מעלים לא נשמר אצלנו כקובץ גולמי בענן. הוא משמש לפענוח ולניתוח, בלי להחזיק עותק מקורי של הקובץ עצמו בשרת.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-lg shadow-cyan-100/60">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-100 text-cyan-700 flex items-center justify-center mb-5">
                    <Lock className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-3">ה-AI לא רואה את השמות האמיתיים שלכם</h3>
                  <p className="text-slate-600 leading-7 text-sm">
                    לפני שהטקסט נשלח למנוע הבינה המלאכותית, הוא עובר אנונימיזציה: השמות מוחלפים בקודים כמו P1 ו-P2. רק אחרי שהניתוח חוזר, השמות מוצמדים מחדש בתצוגה למשתמש.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-lg shadow-sky-100/60">
                  <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center mb-5">
                    <Shield className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-3">לא משתפים את המידע שלכם עם אף אחד</h3>
                  <p className="text-slate-600 leading-7 text-sm">
                    אנחנו לא מעבירים את המידע שלכם לאף גורם חיצוני למעט מנוע ה-AI שמבצע את הניתוח על גרסה אנונימית. לצורכי שימוש שוטף עשויים להישמר מטא-דאטה ותוצרי ניתוח בחשבון שלכם, אבל לא עותק מקורי של קובץ הצ&apos;אט.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="bg-gradient-to-br from-slate-50 to-indigo-50 py-20 border-t border-slate-100">
            <div className="max-w-5xl mx-auto px-4">
                <div className="text-center mb-16">
                    <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">תוכניות מנוי</h2>
                    <p className="text-xl text-slate-600">בחר את התוכנית המתאימה לך</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8" dir="rtl">
                    {/* Free Tier */}
                    <div className="bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition-all">
                        <div className="text-center mb-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
                                <AlertCircle className="w-8 h-8 text-slate-600" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 mb-2">חינם</h3>
                            <div className="text-4xl font-black text-slate-900 mb-2">$0</div>
                            <p className="text-sm text-slate-500">לתמיד</p>
                        </div>
                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center gap-2 text-slate-700">
                                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                <span>2 ניתוחים ביום</span>
                            </li>
                            <li className="flex items-center gap-2 text-slate-700">
                                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                <span>ניתוחים בסיסיים</span>
                            </li>
                            <li className="flex items-center gap-2 text-slate-400">
                                <XCircle className="w-5 h-5 flex-shrink-0" />
                                <span>ניתוחים מתקדמים</span>
                            </li>
                        </ul>
                        <button className="w-full py-3 rounded-xl bg-slate-200 text-slate-600 font-bold cursor-not-allowed">
                            התוכנית הנוכחית
                        </button>
                    </div>

                    {/* Basic Tier */}
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-all border-2 border-blue-200">
                        <div className="text-center mb-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl mb-4">
                                <TrendingUp className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-black text-blue-900 mb-2">מנוי בסיסי</h3>
                            <div className="text-4xl font-black text-blue-900 mb-2">$5</div>
                            <p className="text-sm text-blue-700">לחודש</p>
                        </div>
                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center gap-2 text-blue-900">
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <span className="font-bold">10 ניתוחים ביום</span>
                            </li>
                            <li className="flex items-center gap-2 text-blue-800">
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <span>ניתוחים בסיסיים</span>
                            </li>
                            <li className="flex items-center gap-2 text-blue-800">
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <span>תמיכה סטנדרטית</span>
                            </li>
                        </ul>
                        <button 
                            onClick={() => authUser ? router.push('/profile') : router.push('/signup')}
                            className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all cursor-pointer"
                        >
                            התחל עכשיו
                        </button>
                    </div>

                    {/* Super Tier */}
                    <div className="bg-gradient-to-br from-purple-50 to-pink-100 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all border-2 border-purple-300 relative">
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
                            הכי פופולרי ⭐
                        </div>
                        <div className="text-center mb-6 mt-2">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl mb-4">
                                <Crown className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-black text-purple-900 mb-2">מנוי-על</h3>
                            <div className="text-4xl font-black text-purple-900 mb-2">$30</div>
                            <p className="text-sm text-purple-700">לחודש</p>
                        </div>
                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center gap-2 text-purple-900">
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <span className="font-bold">50 ניתוחים ביום</span>
                            </li>
                            <li className="flex items-center gap-2 text-purple-800">
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <span>ניתוחים מתקדמים</span>
                            </li>
                            <li className="flex items-center gap-2 text-purple-800">
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <span>תמיכה עדיפות</span>
                            </li>
                            <li className="flex items-center gap-2 text-purple-800">
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                                <span>גישה מוקדמת לפיצ'רים</span>
                            </li>
                        </ul>
                        <button 
                            onClick={() => authUser ? router.push('/profile') : router.push('/signup')}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold hover:from-purple-700 hover:to-pink-700 transition-all cursor-pointer shadow-lg"
                        >
                            התחל עכשיו
                        </button>
                    </div>
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
                        <p className="text-slate-700 leading-relaxed mb-6 relative z-10">"הייתי בטוחה שהכל בסדר בינינו, עד שהדודה הראתה לי מה באמת קורה מתחת לפני השטח. זה פשוט פתח לי את העיניים בצורה שלא האמנתי."</p>
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
        <footer className="bg-white border-t border-slate-200 py-8">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-4">
              <span className="text-slate-400 text-sm">© 2026 הדודה</span>
              <span className="hidden md:inline text-slate-300">•</span>
              <button 
                onClick={() => router.push('/terms')}
                className="text-sm text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
              >
                תנאי שימוש
              </button>
              <span className="text-slate-300">•</span>
              <button 
                onClick={() => router.push('/privacy')}
                className="text-sm text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
              >
                מדיניות פרטיות
              </button>
            </div>
            <p className="text-center text-xs text-slate-400 opacity-60">
              הניתוח מתבצע באמצעות בינה מלאכותית ונועד למטרות בידור והעשרה בלבד.
            </p>
          </div>
        </footer>

        <style>{`
          @keyframes bounce-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
          .animate-bounce-slow { animation: bounce-slow 4s ease-in-out infinite; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          .animate-fadeIn { animation: fadeIn 0.8s ease-out both; }
        `}</style>

        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleUpgrade}
          currentCount={uploadLimitData.currentCount}
          maxUploads={uploadLimitData.maxUploads}
          userId={authUser?.uid}
        />

        <RegenerateConfirmModal
          isOpen={showRegenerateConfirm}
          onClose={handleCloseRegenerateModal}
          onUseExisting={handleUseExistingAnalysis}
          onGenerateNew={handleGenerateNewAnalysis}
        />

        {authUser && (
          <PromoCodeModal
            isOpen={showPromoCodeModal}
            onClose={() => {
              setShowPromoCodeModal(false);
            }}
            userId={authUser.uid}
            onSuccess={async () => {
              setShowPromoCodeModal(false);
              // Refresh user tier immediately
              await refreshUserTier();
              alert('✅ הקוד הופעל! עכשיו אתה יכול לנתח את כל ההיסטוריה של השיחות שלך.');
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans" dir="rtl">
      {renderPaidTierBadge('top-20 left-4')}
      <div className="bg-white shadow-sm border-b sticky top-0 z-30 px-4 py-3 flex items-center justify-between">
         <div 
           onClick={() => hasVisibleAuthSession && router.push('/profile')}
           className={`flex items-center gap-3 ${hasVisibleAuthSession ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
           title={hasVisibleAuthSession ? 'הפרופיל שלי' : ''}
         >
           <img src={LOGO_URL} className="w-10 h-10 rounded-full" />
           <h1 className="font-black text-slate-800 text-xl hidden md:block">הדודה</h1>
         </div>
         <div className="flex items-center gap-3">
            {hasVisibleAuthSession && (
              <>
                {isAdmin && (
                  <button
                    onClick={() => router.push('/admin/prompts')}
                    className="p-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-all cursor-pointer"
                    title="Admin Panel"
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => router.push('/profile')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all cursor-pointer"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden md:inline">פרופיל</span>
                </button>
              </>
            )}
            <button onClick={() => setChatData(null)} className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors cursor-pointer">החלף צ'אט</button>
         </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-12 text-center">
           <button onClick={() => { setIsGroupSelectorOpen(true); logButton('GROUP_ANALYSIS_INIT'); }} className="group relative w-full max-w-4xl block mx-auto bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer">
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
                 : 'bg-gradient-to-r from-pink-500 to-rose-500 hover:shadow-2xl cursor-pointer'
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

           <div className="max-w-4xl mx-auto mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
             <button
               onClick={() => handleOpenAskTheAuntModal('person')}
               className="group relative overflow-hidden rounded-[2rem] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-sky-50 p-6 text-right shadow-lg shadow-cyan-100/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-cyan-200/70 cursor-pointer"
             >
               <div className="absolute -left-14 -top-14 h-32 w-32 rounded-full bg-cyan-200/40 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
               <div className="relative z-10 flex items-start justify-between gap-4">
                 <div className="rounded-2xl bg-cyan-100 p-4 text-cyan-700 transition-transform duration-300 group-hover:scale-110">
                   <Search className="w-7 h-7" />
                 </div>
                 <div className="text-right">
                   <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-cyan-700 border border-cyan-100 mb-3">
                     שאל את הדודה
                   </div>
                   <h3 className="text-2xl font-black text-slate-900 mb-2">שאל על אדם מסוים</h3>
                   <p className="text-slate-600 leading-7">
                     בחרו משתתף מהצ׳אט, שאלו שאלה אחת ממוקדת, ואפשר גם לצרף עד 3 צ׳אטים נוספים כדי לדייק את התשובה.
                   </p>
                 </div>
               </div>
             </button>

             <button
               onClick={() => handleOpenAskTheAuntModal('general')}
               className="group relative overflow-hidden rounded-[2rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-6 text-right shadow-lg shadow-indigo-100/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-200/70 cursor-pointer"
             >
               <div className="absolute -right-12 -bottom-14 h-32 w-32 rounded-full bg-indigo-200/40 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
               <div className="relative z-10 flex items-start justify-between gap-4">
                 <div className="rounded-2xl bg-indigo-100 p-4 text-indigo-700 transition-transform duration-300 group-hover:scale-110">
                   <FileText className="w-7 h-7" />
                 </div>
                 <div className="text-right">
                   <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-100 mb-3">
                     שאל את הדודה
                   </div>
                   <h3 className="text-2xl font-black text-slate-900 mb-2">שאל שאלה כללית</h3>
                   <p className="text-slate-600 leading-7">
                     שאלו שאלה על כל הקובץ. במסלול הזה הדודה תסתמך רק על הצ׳אט שכבר העליתם, בלי להציג אפשרות לצרף קבצים נוספים.
                   </p>
                 </div>
               </div>
             </button>
           </div>

           <h2 className="text-2xl font-bold text-slate-800 mt-12 mb-6">או בחר משתתף ספציפי לניתוח אישי</h2>
           <div className="flex flex-wrap justify-center gap-3">
             {chatData.participants.map(p => (
               <button key={p} onClick={() => setSelectedUser(p === selectedUser ? null : p)} className={`px-6 py-3 rounded-full font-bold transition-all cursor-pointer ${selectedUser === p ? 'bg-slate-900 text-white scale-105' : 'bg-white text-slate-700 hover:bg-slate-100 border'}`}>{p}</button>
             ))}
           </div>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto transition-all duration-700 ${selectedUser ? 'opacity-100' : 'opacity-0 pointer-events-none translate-y-10'}`}>
           {Object.entries(ANALYSIS_CONFIG).map(([type, config], idx) => {
             if (type === AnalysisType.GROUP_DYNAMICS || type === AnalysisType.ROMANTIC_DYNAMICS || type === AnalysisType.ASK_AUNT) return null;
             
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
        onRegenerate={activeAnalysisType === AnalysisType.ASK_AUNT ? undefined : async () => {
          if (!activeAnalysisType) return;
          // For group analysis, use undefined (all participants)
          // For individual analysis, no participants needed
          const participants: string[] | undefined = undefined;
          
          // Clear cache
          const cacheKey = getCacheKey(activeAnalysisType, participants);
          if (cacheKey) {
            setCachedOutputs(prev => {
              const newCache = { ...prev };
              delete newCache[cacheKey];
              return newCache;
            });
          }
          
          // Clear local state based on analysis type
          if (activeAnalysisType === AnalysisType.GROUP_DYNAMICS) {
            setUserAnalysisData(prev => {
              const newData = { ...prev };
              delete newData.GROUP;
              return newData;
            });
          } else {
            // Clear all 4 individual analysis types, keep only GROUP if it exists
            setUserAnalysisData(prev => {
              const newData = { ...prev };
              delete newData.PERSONALITY;
              delete newData.WHAT_OTHERS_THINK;
              delete newData.IMPROVEMENT;
              delete newData.HIDDEN_THOUGHTS;
              return newData;
            });
          }
          
          // Execute with cache bypass
          await executeAnalysis(activeAnalysisType, participants, true);
        }}
        analysisType={activeAnalysisType || undefined}
        chatCode={chatCode}
        userId={authUser?.uid || null}
      />

      {isGroupSelectorOpen && (
        <GroupParticipantSelector
          isOpen={isGroupSelectorOpen}
          participants={(() => {
             // Use all messages to count participation (no truncation)
             const truncatedMsgs = getTruncatedMessages(chatData.anonymizedMessages, Infinity);
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

      <AskTheAuntModal
        isOpen={showAskTheAuntModal}
        mode={isAskTheAuntGeneralQuestion ? 'general' : 'person'}
        participants={chatData.participants}
        selectedTargetUser={askTheAuntTargetUser}
        onSelectedTargetUserChange={setAskTheAuntTargetUser}
        question={askTheAuntQuestion}
        onQuestionChange={setAskTheAuntQuestion}
        wantsExtraChats={askTheAuntWantsExtraChats}
        onWantsExtraChatsChange={handleAskTheAuntWantsExtraChatsChange}
        extraFiles={askTheAuntExtraFiles}
        onExtraFilesSelected={handleAskTheAuntExtraFilesSelected}
        onRemoveExtraFile={handleRemoveAskTheAuntFile}
        onClose={handleCloseAskTheAuntModal}
        onSubmit={handleAskTheAuntSubmit}
        submitting={isAskTheAuntSubmitting}
        errorMessage={askTheAuntError}
      />

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgrade={handleUpgrade}
        currentCount={uploadLimitData.currentCount}
        maxUploads={uploadLimitData.maxUploads}
        userId={authUser?.uid}
      />

      <RegenerateConfirmModal
        isOpen={showRegenerateConfirm}
        onClose={handleCloseRegenerateModal}
        onUseExisting={handleUseExistingAnalysis}
        onGenerateNew={handleGenerateNewAnalysis}
      />

      <LongChatAnalysisChoiceModal
        isOpen={showLongChatChoiceModal}
        wordCount={uploadedWordCount}
        onClose={handleCloseLongChatChoiceModal}
        onChoose={handleChooseLongChatAnalysisMode}
      />

      {authUser && (
        <PromoCodeModal
          isOpen={showPromoCodeModal}
          onClose={() => {
            setShowPromoCodeModal(false);
          }}
          userId={authUser.uid}
          onSuccess={async () => {
            setShowPromoCodeModal(false);
            // Refresh user tier immediately
            await refreshUserTier();
            alert('✅ הקוד הופעל! עכשיו אתה יכול לנתח את כל ההיסטוריה של השיחות שלך.');
          }}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-sm text-slate-500">
            <span className="text-slate-400">© 2026 הדודה</span>
            <span className="hidden md:inline text-slate-300">•</span>
            <button 
              onClick={() => router.push('/terms')}
              className="hover:text-indigo-600 transition-colors cursor-pointer"
            >
              תנאי שימוש
            </button>
            <span className="text-slate-300">•</span>
            <button 
              onClick={() => router.push('/privacy')}
              className="hover:text-indigo-600 transition-colors cursor-pointer"
            >
              מדיניות פרטיות
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
