'use server';

import 'server-only';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from "@google/genai";
import {
  AnalysisDepthMode,
  ChatMessage,
  ChatRecordSection,
  ChunkingStrategy,
  ParticipantAxisDistributionSummary,
  ParticipantAxisKey,
  ParticipantAxisScore,
  UserTier
} from "@/types";
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';
import { logger } from './logger';
import {
  createGroupAnalysisChunks,
  createGroupAnalysisChunksByTokens,
  createIndividualAnalysisChunks,
  createIndividualAnalysisChunksByTokens,
  formatChatDate,
  getTotalTokenCount,
  getTotalWordCount
} from './chat-utils';
import { getPrompt, type PromptKey } from './prompts';
import {
  getParticipantAxisDistributionSummary,
  getPromptData,
  recordParticipantAxisScores
} from './firestore-admin';

// Analysis model configuration by tier.
// Google documents the Pro preview model ID as "gemini-3-pro-preview".
const FREE_ANALYSIS_MODEL = "gemini-3-flash-preview";
const PAID_ANALYSIS_MODEL = "gemini-3-pro-preview";
const UTILITY_GEMINI_MODEL = FREE_ANALYSIS_MODEL;
const ASK_AUNT_MODEL = FREE_ANALYSIS_MODEL;
const FREE_ANALYSIS_MAX_WORDS = 50000;
const PAID_ANALYSIS_MAX_TOKENS = 200000;
const ASK_AUNT_MAX_WORDS = 50000;
const ASK_AUNT_MAX_QUESTION_CHARS = 500;

const ASK_AUNT_PROMPT_INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|system|developer|instructions?)\b/i,
  /\b(system prompt|developer message|hidden prompt|prompt injection|jailbreak)\b/i,
  /<\s*(system|assistant|developer|tool)\b/i,
  /\b(reveal|print|show|dump)\b.{0,40}\b(prompt|instructions?|chain of thought)\b/i,
];

const PARTICIPANT_AXIS_KEYS: ParticipantAxisKey[] = ['liberalism', 'calmness', 'rationalism', 'humor'];
const PARTICIPANT_AXIS_MIN = 1;
const PARTICIPANT_AXIS_MAX = 10;
const PARTICIPANT_AXIS_MIDPOINT = 5.5;

const PARTICIPANT_AXIS_META: Record<
  ParticipantAxisKey,
  {
    scoreLabel: string;
    lowTraitComparison: string;
    highTraitComparison: string;
  }
> = {
  liberalism: {
    scoreLabel: 'ליברליזם',
    lowTraitComparison: 'שמרני יותר',
    highTraitComparison: 'ליברלי יותר',
  },
  calmness: {
    scoreLabel: 'רוגע',
    lowTraitComparison: 'מתעצבן מהר יותר',
    highTraitComparison: 'רגוע יותר',
  },
  rationalism: {
    scoreLabel: 'רציונליות',
    lowTraitComparison: 'רגשי, רוחני וספיריטואלי יותר',
    highTraitComparison: 'רציונלי יותר',
  },
  humor: {
    scoreLabel: 'הומור',
    lowTraitComparison: 'רציני יותר',
    highTraitComparison: 'קליל והומוריסטי יותר',
  },
};

const participantAxisResponseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      participantCode: { type: Type.STRING },
      liberalism: { type: Type.INTEGER },
      calmness: { type: Type.INTEGER },
      rationalism: { type: Type.INTEGER },
      humor: { type: Type.INTEGER },
    },
    required: ['participantCode', 'liberalism', 'calmness', 'rationalism', 'humor'],
  },
};

const clampParticipantAxisScore = (value: unknown): number => {
  const numericValue = Math.round(Number(value));

  if (Number.isNaN(numericValue)) {
    return 5;
  }

  return Math.min(PARTICIPANT_AXIS_MAX, Math.max(PARTICIPANT_AXIS_MIN, numericValue));
};

const sortParticipantCodes = (codes: string[]): string[] => {
  return [...codes].sort((a, b) => {
    const aMatch = a.match(/^P(\d+)$/);
    const bMatch = b.match(/^P(\d+)$/);

    if (aMatch && bMatch) {
      return Number(aMatch[1]) - Number(bMatch[1]);
    }

    return a.localeCompare(b);
  });
};

const getParticipantCodesFromMessages = (messages: ChatMessage[]): string[] => {
  const uniqueCodes = new Set<string>();

  for (const message of messages) {
    if (!message?.sender) continue;
    uniqueCodes.add(message.sender);
  }

  return sortParticipantCodes(Array.from(uniqueCodes));
};

const buildParticipantAxisInstruction = (participantCodes: string[], responseFieldName = 'participantAxisScores'): string => {
  if (participantCodes.length === 0) {
    return '';
  }

  return `
בנוסף לכל מה שכבר התבקשת לעשות, החזירו גם מערך JSON בשם "${responseFieldName}" עבור כל אחד מקודי המשתתפים הבאים:
${participantCodes.join(', ')}

לכל משתתף החזירו אובייקט עם השדות הבאים בלבד:
- participantCode: קוד המשתתף בדיוק כפי שהוא מופיע ברשימה.
- liberalism: מספר שלם בין 1 ל-10, כאשר 1 = שמרני מאוד ו-10 = ליברלי מאוד.
- calmness: מספר שלם בין 1 ל-10, כאשר 1 = קל מאוד להתעצבן / להתרגז / לכעוס ו-10 = רגוע מאוד.
- rationalism: מספר שלם בין 1 ל-10, כאשר 1 = רגשי, רוחני וספיריטואלי מאוד ו-10 = רציונלי מאוד.
- humor: מספר שלם בין 1 ל-10, כאשר 1 = רציני מאוד ו-10 = קליל והומוריסטי מאוד.

אל תחזירו שמות אמיתיים, אל תחזירו נימוקים, ואל תחסירו אף משתתף מהרשימה.
`;
};

const normalizeParticipantAxisScores = (
  rawScores: unknown,
  allowedParticipantCodes: string[]
): ParticipantAxisScore[] => {
  if (allowedParticipantCodes.length === 0) {
    return [];
  }

  if (!Array.isArray(rawScores)) {
    return allowedParticipantCodes.map((participantCode) => ({
      participantCode,
      liberalism: 5,
      calmness: 5,
      rationalism: 5,
      humor: 5,
    }));
  }

  const allowedCodes = new Set(allowedParticipantCodes);
  const normalizedScores = new Map<string, ParticipantAxisScore>();

  rawScores.forEach((rawScore) => {
    if (!rawScore || typeof rawScore !== 'object') {
      return;
    }

    const candidate = rawScore as Record<string, unknown>;
    const participantCode = typeof candidate.participantCode === 'string' ? candidate.participantCode.trim() : '';

    if (!participantCode || !allowedCodes.has(participantCode)) {
      return;
    }

    normalizedScores.set(participantCode, {
      participantCode,
      liberalism: clampParticipantAxisScore(candidate.liberalism),
      calmness: clampParticipantAxisScore(candidate.calmness),
      rationalism: clampParticipantAxisScore(candidate.rationalism),
      humor: clampParticipantAxisScore(candidate.humor),
    });
  });

  const missingParticipantCodes = allowedParticipantCodes.filter((participantCode) => !normalizedScores.has(participantCode));

  if (missingParticipantCodes.length > 0) {
    logger.warning('Participant axis response omitted some participants; filling with neutral scores', {
      missingParticipantCodes,
      returnedCount: normalizedScores.size,
      expectedCount: allowedParticipantCodes.length,
    });
  }

  return allowedParticipantCodes.map((participantCode) => {
    return normalizedScores.get(participantCode) || {
      participantCode,
      liberalism: 5,
      calmness: 5,
      rationalism: 5,
      humor: 5,
    };
  });
};

const calculateParticipantAxisPercentile = (
  summary: ParticipantAxisDistributionSummary,
  axis: ParticipantAxisKey,
  score: number
): { comparisonLabel: string; percentile: number } | null => {
  const totalObservations = summary.totalObservations;

  if (!totalObservations || totalObservations <= 1) {
    return null;
  }

  const distribution = summary[axis];
  const isLowPole = score < PARTICIPANT_AXIS_MIDPOINT;
  let comparisonCount = 0;

  for (let bucketScore = PARTICIPANT_AXIS_MIN; bucketScore <= PARTICIPANT_AXIS_MAX; bucketScore++) {
    if (isLowPole && bucketScore > score) {
      comparisonCount += distribution[bucketScore] || 0;
    } else if (!isLowPole && bucketScore < score) {
      comparisonCount += distribution[bucketScore] || 0;
    }
  }

  const denominator = Math.max(1, totalObservations - 1);
  const percentile = Math.max(0, Math.min(100, Math.round((comparisonCount / denominator) * 100)));
  const comparisonLabel = isLowPole
    ? PARTICIPANT_AXIS_META[axis].lowTraitComparison
    : PARTICIPANT_AXIS_META[axis].highTraitComparison;

  return { comparisonLabel, percentile };
};

const buildParticipantAxisSection = (
  scores: ParticipantAxisScore[],
  summary: ParticipantAxisDistributionSummary
): string => {
  if (!scores.length) {
    return '';
  }

  const participantBlocks = scores.map((score) => {
    const axisLines = PARTICIPANT_AXIS_KEYS.map((axis) => {
      const axisScore = score[axis];
      const percentileData = calculateParticipantAxisPercentile(summary, axis, axisScore);
      const percentileSentence = percentileData
        ? `${percentileData.comparisonLabel} מ- ${percentileData.percentile}% מהנבדקים!`
        : 'עדיין אין מספיק נתונים להשוואה רחבה.';

      return `- דירוג ה${PARTICIPANT_AXIS_META[axis].scoreLabel} הוא ${axisScore} מתוך 10. ${percentileSentence}`;
    }).join('\n');

    return `**${score.participantCode}**\n${axisLines}`;
  }).join('\n\n');

  return `\n\n**מפת הצירים של המשתתפים**\n${participantBlocks}`;
};

const extractJsonObjectCandidates = (text: string): string[] => {
  const candidates: string[] = [];
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        startIndex = index;
      }
      depth++;
      continue;
    }

    if (char === '}') {
      if (depth === 0) {
        continue;
      }

      depth--;
      if (depth === 0 && startIndex >= 0) {
        candidates.push(text.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }
  }

  return candidates.sort((a, b) => b.length - a.length);
};

const parseStructuredJsonObject = (rawText: string): Record<string, any> | null => {
  const cleanedWholeText = cleanJson(rawText);

  try {
    return JSON.parse(cleanedWholeText);
  } catch {
    // Continue to candidate extraction fallback below.
  }

  const candidates = extractJsonObjectCandidates(rawText);

  for (const candidate of candidates) {
    try {
      return JSON.parse(cleanJson(candidate));
    } catch {
      continue;
    }
  }

  return null;
};

type AnalysisBudget =
  | { metric: 'words'; max: number }
  | { metric: 'tokens'; max: number };

const getAnalysisBudget = (tier?: UserTier | string): AnalysisBudget => {
  if (tier === 'basic' || tier === 'super' || tier === 'advanced') {
    return { metric: 'tokens', max: PAID_ANALYSIS_MAX_TOKENS };
  }

  return { metric: 'words', max: FREE_ANALYSIS_MAX_WORDS };
};

const getAnalysisModel = (tier?: UserTier | string, analysisMode?: AnalysisDepthMode): string => {
  if (tier === 'free') {
    return FREE_ANALYSIS_MODEL;
  }

  if (analysisMode === 'standard') {
    return FREE_ANALYSIS_MODEL;
  }

  if (tier === 'basic' || tier === 'super' || tier === 'advanced') {
    return PAID_ANALYSIS_MODEL;
  }

  return FREE_ANALYSIS_MODEL;
};

const sanitizeUserQuestion = (question: string): string => {
  return question
    .replace(/<[^>]*>/g, ' ')
    .replace(/```/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ASK_AUNT_MAX_QUESTION_CHARS);
};

const looksLikePromptInjection = (question: string): boolean => {
  return ASK_AUNT_PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(question));
};

const limitAskAuntSections = (
  sections: ChatRecordSection[],
  maxWords: number = ASK_AUNT_MAX_WORDS
): { sections: ChatRecordSection[]; strategy: ChunkingStrategy; originalWordCount: number } => {
  const originalWordCount = sections.reduce((sum, section) => sum + getTotalWordCount(section.messages), 0);

  if (originalWordCount <= maxWords) {
    return {
      sections: sections.filter((section) => section.messages.length > 0),
      strategy: 'full',
      originalWordCount
    };
  }

  const nonEmptySections = sections.filter((section) => section.messages.length > 0);
  if (nonEmptySections.length === 0) {
    return { sections: [], strategy: 'full', originalWordCount };
  }

  const reservedMinimum = Math.min(3000, Math.floor(maxWords / nonEmptySections.length));
  const remainingBudget = Math.max(0, maxWords - (reservedMinimum * nonEmptySections.length));
  const totalNonEmptyWords = nonEmptySections.reduce((sum, section) => sum + getTotalWordCount(section.messages), 0);

  const limitedSections = nonEmptySections.map((section, index) => {
    const sectionWords = getTotalWordCount(section.messages);
    const proportionalShare = totalNonEmptyWords > 0
      ? Math.floor((sectionWords / totalNonEmptyWords) * remainingBudget)
      : 0;
    const sectionBudget = Math.max(1000, reservedMinimum + proportionalShare);
    const remainingSections = nonEmptySections.length - index - 1;
    const maxBudgetForThisSection = index === nonEmptySections.length - 1
      ? maxWords
      : maxWords - (remainingSections * 1000);
    const boundedBudget = Math.min(sectionBudget, maxBudgetForThisSection);

    return {
      label: section.label,
      messages: createGroupAnalysisChunks(section.messages, boundedBudget).chunks
    };
  }).filter((section) => section.messages.length > 0);

  return {
    sections: limitedSections,
    strategy: 'sampled',
    originalWordCount
  };
};

const serializeChatSections = (sections: ChatRecordSection[]): string => {
  return sections.map((section) => {
    const serializedMessages = truncateChatForContext(section.messages, Infinity);
    return `[${section.label}]\n${serializedMessages}`;
  }).join('\n\n');
};

/**
 * Get active prompt - checks Firestore for draft/testing version first,
 * then falls back to production file-based version
 */
async function getActivePrompt(promptId: PromptKey, userId?: string): Promise<string> {
  try {
    // Check if there's a Firestore version
    const promptData = await getPromptData(promptId);
    
    // If Firestore has a draft and it's activated for testing, use it
    if (promptData && promptData.useDraft && promptData.draft) {
      logger.info('Using draft prompt from Firestore', { promptId });
      return promptData.draft;
    }
    
    // If Firestore has a production version, use it
    if (promptData && promptData.production) {
      return promptData.production;
    }
  } catch (error) {
    logger.warning('Failed to load prompt from Firestore, using file version', 
      { promptId }, 
      error instanceof Error ? error : undefined
    );
  }
  
  // Fall back to file-based version
  return getPrompt(promptId);
}

const getSystemInstruction = async () => {
  return await getActivePrompt('systemInstruction');
};

const truncateChatForContext = (messages: ChatMessage[], limit = 20000): string => {
  if (!messages || messages.length === 0) return "";
  
  let accumulatedLength = 0;
  let startIndex = 0;
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const msgLen = (m.content?.length || 0) + (m.sender?.length || 0) + 20;
    accumulatedLength += msgLen;
    if (accumulatedLength >= limit) {
      startIndex = i;
      break;
    }
  }

  const sourceMessages = messages.slice(startIndex);
  let fullText = '';
  let currentSender = '';
  let lastDateStr = '';

  for (const m of sourceMessages) {
    if (!m.content.trim()) continue;
    const dateStr = formatChatDate(m.date);
    if (!dateStr) continue;
    if (dateStr !== lastDateStr) {
        fullText += `\n[${dateStr}]\n`;
        lastDateStr = dateStr;
        currentSender = '';
    }
    if (m.sender !== currentSender) {
        fullText += `\n${m.sender}:\n`;
        currentSender = m.sender;
    }
    fullText += `${m.content}\n`;
  }

  return fullText.trim();
};

const cleanJson = (text: string): string => {
  if (!text) return "{}";
  
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*|\s*```/g, "").replace(/```/g, "").trim();
  
  // Try to extract JSON object if there's extra text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  
  // Remove control characters but preserve newlines and tabs in strings
  cleaned = cleaned.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  
  // Try to fix incomplete JSON by ensuring it ends properly
  // Count opening and closing braces
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;
  
  if (openBraces > closeBraces) {
    // Close any unclosed strings first
    const lastQuote = cleaned.lastIndexOf('"');
    const lastColon = cleaned.lastIndexOf(':');
    const lastComma = cleaned.lastIndexOf(',');
    const lastCloseBrace = cleaned.lastIndexOf('}');
    
    // If last character isn't a quote or brace, we might have an unclosed string
    if (lastQuote > Math.max(lastColon, lastComma, lastCloseBrace)) {
      // Count quotes to see if we have an odd number (unclosed string)
      const quotesBeforeLast = (cleaned.substring(0, lastQuote).match(/"/g) || []).length;
      if (quotesBeforeLast % 2 === 0) {
        // Even number before, so last quote opens a string - close it
        cleaned += '"';
      }
    }
    
    // Add missing closing braces
    cleaned += '}'.repeat(openBraces - closeBraces);
  }
  
  return cleaned;
};

const getApiKey = async (): Promise<string> => {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }

  if (process.env.NODE_ENV === 'development') {
    const apiKey = process.env.API_KEY;
    if(apiKey) return apiKey;
  }

  try {
    const client = new SecretManagerServiceClient();
    const name = 'projects/social-analyzer-24750033-dc53d/secrets/GEMINI_API_KEY/versions/latest';
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString();
    if (payload) {
      return payload;
    }
    throw new Error('Secret payload is empty');
  } catch (error) {
    logger.error('Failed to access GEMINI_API_KEY from Secret Manager', {
      environment: process.env.NODE_ENV
    }, error instanceof Error ? error : undefined);
    throw new Error('Could not fetch GEMINI_API_KEY from Secret Manager');
  }
};

export async function serverAnalyzeChatFull(
  messages: ChatMessage[],
  targetUser: string,
  limit: number,
  tier: UserTier = 'free',
  analysisMode?: AnalysisDepthMode
): Promise<{
  personality: string;
  othersThoughts: string;
  improvement: string;
  hiddenThoughts: string;
  participantAxisScores?: ParticipantAxisScore[];
  strategy?: ChunkingStrategy;
  originalWordCount?: number;
  originalTokenCount?: number;
}> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });
  const budget = getAnalysisBudget(tier);
  const model = getAnalysisModel(tier, analysisMode);
  const chunkResult = budget.metric === 'tokens'
    ? createIndividualAnalysisChunksByTokens(messages, targetUser, budget.max)
    : createIndividualAnalysisChunks(messages, targetUser, budget.max);
  const chunkedMessages = chunkResult.chunks;
  const strategy = chunkResult.strategy;
  const originalWordCount = 'originalWordCount' in chunkResult ? chunkResult.originalWordCount : undefined;
  const originalTokenCount = 'originalTokenCount' in chunkResult ? chunkResult.originalTokenCount : undefined;
  
  // Verification logging (user requirement)
  if (budget.metric === 'tokens' && originalTokenCount && originalTokenCount > budget.max) {
    const finalTokenCount = getTotalTokenCount(chunkedMessages);
    const reduction = ((originalTokenCount - finalTokenCount) / originalTokenCount * 100).toFixed(1);
    console.log('[Individual Analysis Verification]');
    console.log(`  Tier: ${tier}`);
    console.log(`  Original: ${originalTokenCount} tokens`);
    console.log(`  Final: ${finalTokenCount} tokens`);
    console.log(`  Reduction: ${reduction}%`);
    console.log(`  Still over 200k? ${finalTokenCount > budget.max ? 'YES' : 'NO'}`);
  } else if (budget.metric === 'words' && originalWordCount && originalWordCount > budget.max) {
    const finalWordCount = getTotalWordCount(chunkedMessages);
    const reduction = ((originalWordCount - finalWordCount) / originalWordCount * 100).toFixed(1);
    console.log('[Individual Analysis Verification]');
    console.log(`  Tier: ${tier}`);
    console.log(`  Original: ${originalWordCount} words`);
    console.log(`  Final: ${finalWordCount} words`);
    console.log(`  Reduction: ${reduction}%`);
    console.log(`  Still over 50k? ${finalWordCount > budget.max ? 'YES' : 'NO'}`);
  }

  const chatContext = truncateChatForContext(chunkedMessages, limit);

  const samplingNoteTemplate = strategy === 'sampled' ? await getActivePrompt('samplingNoteIndividual') : '';
  const samplingNote = samplingNoteTemplate
    ? `\n  ${samplingNoteTemplate.replace(/\{\{TARGET_USER\}\}/g, targetUser)}\n  `
    : '';

  // Load prompts dynamically
  const systemInstruction = await getSystemInstruction();
  const individualAnalysisPrompt = await getActivePrompt('individualAnalysis');
  const participantCodes = getParticipantCodesFromMessages(messages);
  const participantAxisInstruction = buildParticipantAxisInstruction(participantCodes);
  
  // Replace template placeholders
  const finalPrompt = individualAnalysisPrompt.replace(/\{\{TARGET_USER\}\}/g, targetUser);

  const prompt = `
${systemInstruction}${samplingNote}

<chat_history>
${chatContext}
</chat_history>

${finalPrompt}

${participantAxisInstruction}
`;

  const result = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          personality: { type: Type.STRING },
          othersThoughts: { type: Type.STRING },
          improvement: { type: Type.STRING },
          hiddenThoughts: { type: Type.STRING },
          participantAxisScores: participantAxisResponseSchema
        },
        required: ["personality", "othersThoughts", "improvement", "hiddenThoughts", "participantAxisScores"]
      }
    }
  });
  
  const rawText = result.text || "";
  const parsed = parseStructuredJsonObject(rawText);
  if (!parsed) {
    logger.error('JSON parse error in serverAnalyzeChatFull', {
      rawTextLength: rawText?.length || 0,
      cleanedTextLength: cleanJson(rawText).length,
    });
    
    // Fallback: return empty structure
    return {
      personality: "מצטערים, התרחשה שגיאה בניתוח. אנא נסו שוב.",
      othersThoughts: "",
      improvement: "",
      hiddenThoughts: "",
    };
  }

  const participantAxisScores = normalizeParticipantAxisScores(parsed.participantAxisScores, participantCodes);
  await recordParticipantAxisScores(participantAxisScores, 'individual_analysis');

  return {
    personality: parsed.personality || "",
    othersThoughts: parsed.othersThoughts || "",
    improvement: parsed.improvement || "",
    hiddenThoughts: parsed.hiddenThoughts || "",
    participantAxisScores,
    strategy,
    originalWordCount,
    originalTokenCount,
  };
}

export async function serverAnalyzeGroupDynamics(
  messages: ChatMessage[],
  selectedParticipants: string[] | undefined,
  limit: number,
  tier: UserTier = 'free',
  analysisMode?: AnalysisDepthMode
): Promise<{ result: string; strategy?: ChunkingStrategy; originalWordCount?: number; originalTokenCount?: number }> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });
  const budget = getAnalysisBudget(tier);
  const model = getAnalysisModel(tier, analysisMode);
  const chunkResult = budget.metric === 'tokens'
    ? createGroupAnalysisChunksByTokens(messages, budget.max)
    : createGroupAnalysisChunks(messages, budget.max);
  const chunkedMessages = chunkResult.chunks;
  const strategy = chunkResult.strategy;
  const originalWordCount = 'originalWordCount' in chunkResult ? chunkResult.originalWordCount : undefined;
  const originalTokenCount = 'originalTokenCount' in chunkResult ? chunkResult.originalTokenCount : undefined;

  const chatContext = truncateChatForContext(chunkedMessages, limit);
  
  const samplingNoteTemplate = strategy === 'sampled' ? await getActivePrompt('samplingNoteGroup') : '';
  const samplingNote = samplingNoteTemplate ? `\n  ${samplingNoteTemplate}\n  ` : '';

  // Load prompts dynamically
  const systemInstruction = await getSystemInstruction();
  const groupPromptKey = selectedParticipants && selectedParticipants.length > 0 
    ? 'groupDynamicsWithParticipants' 
    : 'groupDynamicsWithoutParticipants';
  const groupAnalysisPrompt = await getActivePrompt(groupPromptKey);
  const participantCodes = getParticipantCodesFromMessages(messages);
  const participantAxisInstruction = buildParticipantAxisInstruction(participantCodes);
  
  // Replace template placeholders
  const participantList = selectedParticipants && selectedParticipants.length > 0
    ? selectedParticipants.join(", ")
    : "";
  const finalPrompt = groupAnalysisPrompt
    .replace(/\{\{PARTICIPANT_COUNT\}\}/g, selectedParticipants?.length?.toString() || "0")
    .replace(/\{\{PARTICIPANT_LIST\}\}/g, participantList);

  const prompt = `
${systemInstruction}${samplingNote}

<chat_history>
${chatContext}
</chat_history>

${finalPrompt}

החזירו את כל התשובה כ-JSON יחיד עם שני שדות:
- analysisText: כל הטקסט המלא של הניתוח הקבוצתי, בדיוק בפורמט שהתבקשתם כבר להחזיר.
- participantAxisScores: מערך ציוני המשתתפים.

${participantAxisInstruction}
`;

  const result = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analysisText: { type: Type.STRING },
          participantAxisScores: participantAxisResponseSchema
        },
        required: ['analysisText', 'participantAxisScores']
      }
    }
  });

  const rawText = result.text || "";
  const parsed = parseStructuredJsonObject(rawText);

  if (!parsed) {
    logger.error('JSON parse error in serverAnalyzeGroupDynamics', {
      rawTextLength: rawText?.length || 0,
      cleanedTextLength: cleanJson(rawText).length,
    });

    const participantAxisScores = normalizeParticipantAxisScores(undefined, participantCodes);
    await recordParticipantAxisScores(participantAxisScores, 'group_dynamics');
    const participantAxisSummary = await getParticipantAxisDistributionSummary();
    const participantAxisSection = buildParticipantAxisSection(participantAxisScores, participantAxisSummary);

    return {
      result: `${rawText || ""}${participantAxisSection}`,
      strategy,
      originalWordCount,
      originalTokenCount
    };
  }

  const participantAxisScores = normalizeParticipantAxisScores(parsed.participantAxisScores, participantCodes);
  await recordParticipantAxisScores(participantAxisScores, 'group_dynamics');
  const participantAxisSummary = await getParticipantAxisDistributionSummary();
  const participantAxisSection = buildParticipantAxisSection(participantAxisScores, participantAxisSummary);
  const analysisText = `${parsed.analysisText || ''}${participantAxisSection}`;
  
  return {
    result: analysisText,
    strategy,
    originalWordCount,
    originalTokenCount
  };
}

export async function serverAnalyzeRomanticDynamics(
  messages: ChatMessage[],
  limit: number,
  tier: UserTier = 'free',
  analysisMode?: AnalysisDepthMode
): Promise<{ result: string; strategy?: ChunkingStrategy; originalWordCount?: number; originalTokenCount?: number }> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });
  const budget = getAnalysisBudget(tier);
  const model = getAnalysisModel(tier, analysisMode);
  const chunkResult = budget.metric === 'tokens'
    ? createGroupAnalysisChunksByTokens(messages, budget.max)
    : createGroupAnalysisChunks(messages, budget.max);
  const chunkedMessages = chunkResult.chunks;
  const strategy = chunkResult.strategy;
  const originalWordCount = 'originalWordCount' in chunkResult ? chunkResult.originalWordCount : undefined;
  const originalTokenCount = 'originalTokenCount' in chunkResult ? chunkResult.originalTokenCount : undefined;

  const chatContext = truncateChatForContext(chunkedMessages, limit);
  
  const samplingNoteTemplate = strategy === 'sampled' ? await getActivePrompt('samplingNoteGroup') : '';
  const samplingNote = samplingNoteTemplate ? `\n  ${samplingNoteTemplate}\n  ` : '';

  // Load prompts dynamically
  const systemInstruction = await getSystemInstruction();
  const romanticAnalysisPrompt = await getActivePrompt('romanticDynamics');
  const participantCodes = getParticipantCodesFromMessages(messages);
  const participantAxisInstruction = buildParticipantAxisInstruction(participantCodes);

  const prompt = `
  ${systemInstruction}${samplingNote}
  
  <chat_history>
  ${chatContext}
  </chat_history>
  
  ${romanticAnalysisPrompt}

  החזירו את כל התשובה כ-JSON יחיד עם שני שדות:
  - analysisText: כל הטקסט המלא של ניתוח הזוגיות, בדיוק בפורמט שהתבקשתם כבר להחזיר.
  - participantAxisScores: מערך ציוני המשתתפים.

  ${participantAxisInstruction}
  `;

  const result = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analysisText: { type: Type.STRING },
          participantAxisScores: participantAxisResponseSchema
        },
        required: ['analysisText', 'participantAxisScores']
      }
    }
  });

  const rawText = result.text || "";
  const parsed = parseStructuredJsonObject(rawText);

  if (!parsed) {
    logger.error('JSON parse error in serverAnalyzeRomanticDynamics', {
      rawTextLength: rawText?.length || 0,
      cleanedTextLength: cleanJson(rawText).length,
    });

    const participantAxisScores = normalizeParticipantAxisScores(undefined, participantCodes);
    await recordParticipantAxisScores(participantAxisScores, 'romantic_dynamics');

    return {
      result: rawText || "",
      strategy,
      originalWordCount,
      originalTokenCount
    };
  }

  const participantAxisScores = normalizeParticipantAxisScores(parsed.participantAxisScores, participantCodes);
  await recordParticipantAxisScores(participantAxisScores, 'romantic_dynamics');
  
  return {
    result: parsed.analysisText || "",
    strategy,
    originalWordCount,
    originalTokenCount
  };
}

export async function serverAskTheAunt(
  chatSections: ChatRecordSection[],
  targetUser: string | null,
  userQuestion: string
): Promise<{ result: string; strategy?: ChunkingStrategy; originalWordCount?: number }> {
  const sanitizedQuestion = sanitizeUserQuestion(userQuestion);

  if (!sanitizedQuestion) {
    throw new Error('Question is required');
  }

  if (looksLikePromptInjection(sanitizedQuestion)) {
    logger.warning('Ask the Aunt request rejected due to suspicious question content', {
      targetUser,
    });
    throw new Error('Please rewrite the question as a plain question about the chat.');
  }

  const limitedSections = limitAskAuntSections(chatSections, ASK_AUNT_MAX_WORDS);
  if (limitedSections.sections.length === 0) {
    throw new Error(targetUser ? 'No relevant messages were found for the selected participant.' : 'No chat messages were available for this question.');
  }

  const ai = new GoogleGenAI({ apiKey: await getApiKey() });
  const systemInstruction = await getSystemInstruction();
  const questionScope = targetUser ? `about ${targetUser}` : 'about the overall chat';
  const scopeNote = targetUser
    ? `Only messages written by ${targetUser} or messages that explicitly mention ${targetUser} were preserved from the relevant records. Do not assume anything from messages that were not preserved.`
    : 'This question is general, so the answer must be based only on the original uploaded chat record. No additional chat files were included.';
  const askTheAuntPrompt = (await getActivePrompt('askTheAunt'))
    .replace(/\{\{QUESTION_SCOPE\}\}/g, questionScope)
    .replace(/\{\{SCOPE_NOTE\}\}/g, scopeNote);
  const chatHistory = serializeChatSections(limitedSections.sections);
  const multiChatNote = limitedSections.sections.length > 1
    ? `This context combines ${limitedSections.sections.length} separate chat records. Each labeled section is a different chat record.`
    : targetUser ? 'This context contains one filtered chat record.' : 'This context contains the original uploaded chat record only.';

  const prompt = `
${systemInstruction}

<context_note>
${multiChatNote}
${scopeNote}
If context is partial or sampled, be transparent about uncertainty and do not overgeneralize from silence.
</context_note>

<chat_history>
${chatHistory}
</chat_history>

<user_question>
${sanitizedQuestion}
</user_question>

${askTheAuntPrompt}
`;

  const result = await ai.models.generateContent({
    model: ASK_AUNT_MODEL,
    contents: prompt
  });

  return {
    result: result.text || '',
    strategy: limitedSections.strategy,
    originalWordCount: limitedSections.originalWordCount
  };
}

export async function serverSummarizeForSharing(analysisText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });

  // Load prompt dynamically
  const summarizationPrompt = await getActivePrompt('summarization');
  const finalPrompt = summarizationPrompt.replace(/\{\{ANALYSIS_TEXT\}\}/g, analysisText);

  const prompt = finalPrompt;

  const result = await ai.models.generateContent({
    model: UTILITY_GEMINI_MODEL,
    contents: prompt
  });
  
  return result.text || "";
}

export async function serverGenerateCartoonImage(prompt: string): Promise<string> {
  logger.info('Vertex AI Imagen: Starting image generation', {
    promptLength: prompt.length,
  });
  
  const projectId = process.env.FIREBASE_PROJECT_ID || 'social-analyzer-24750033-dc53d';
  const location = 'us-central1';
  
  logger.info('Vertex AI Imagen: Configuration', {
    projectId,
    location
  });

  const enhancementTemplate = await getActivePrompt('imagePromptEnhancement');
  const fullPrompt = enhancementTemplate.replace(/\{\{USER_PROMPT\}\}/g, prompt);

  // Configure credentials for local vs production
  let clientOptions: any = {
    apiEndpoint: `${location}-aiplatform.googleapis.com`,
  };

  // In local development, use a service account key if one is present.
  const serviceAccountPath = path.join(process.cwd(), 'firebase-admin-key.json');
  if (existsSync(serviceAccountPath)) {
    clientOptions.credentials = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    logger.info('Vertex AI Imagen: Using local service account credentials');
  } else {
    // In production (Firebase App Hosting), use Application Default Credentials.
    logger.info('Vertex AI Imagen: Using Application Default Credentials (production)');
  }

  // Initialize the Prediction Service Client
  const predictionServiceClient = new PredictionServiceClient(clientOptions);

  // Construct the resource name for the model - using Imagen 4 (latest)
  const endpoint = `projects/${projectId}/locations/${location}/publishers/google/models/imagen-4.0-generate-001`;

  logger.info('Vertex AI Imagen: Prepared endpoint', { endpoint });

  const instanceValue = helpers.toValue({
    prompt: fullPrompt,
  });

  const instances = [instanceValue!];

  const parameter = {
    sampleCount: 1,
  };
  const parameters = helpers.toValue(parameter);

  const request = {
    endpoint,
    instances,
    parameters,
  };

  logger.info('Vertex AI Imagen: Sending prediction request');

  try {
    const [response] = await predictionServiceClient.predict(request);
    
    logger.info('Vertex AI Imagen: Response received', {
      predictionsCount: response.predictions?.length || 0
    });

    if (!response.predictions || response.predictions.length === 0) {
      logger.error('Vertex AI Imagen: No predictions in response', {
        hasResponse: !!response,
        responseKeys: response ? Object.keys(response) : []
      });
      throw new Error('Vertex AI response contained no predictions');
    }

    const prediction = response.predictions[0];
    
    // Access the struct value directly to avoid protobuf type issues
    const predictionStruct = prediction?.structValue?.fields || {};
    
    logger.info('Vertex AI Imagen: Processing prediction', {
      predictionKeys: Object.keys(predictionStruct),
      fieldDetails: Object.entries(predictionStruct).map(([key, value]) => ({
        key,
        hasStringValue: !!value.stringValue,
        hasListValue: !!value.listValue,
        hasStructValue: !!value.structValue,
        stringValueLength: value.stringValue?.length || 0
      }))
    });

    // Check for RAI (Responsible AI) filtering first
    const raiReason = predictionStruct['raiFilteredReason']?.stringValue;
    if (raiReason) {
      logger.warning('Vertex AI Imagen: Image blocked by content filters', {
        raiReason
      });
      throw new Error('התמונה נחסמה על ידי מסנני התוכן של Google. נסה לנסח מחדש את הבקשה.');
    }

    // Check for image data - Imagen 4 uses bytesBase64Encoded as stringValue
    const bytesField = predictionStruct['bytesBase64Encoded']?.stringValue;
    const imageField = predictionStruct['image']?.stringValue;
    
    if (bytesField) {
      logger.info('Vertex AI Imagen: Image generated successfully via bytesBase64Encoded', {
        imageSize: bytesField.length
      });
      return `data:image/png;base64,${bytesField}`;
    } else if (imageField) {
      logger.info('Vertex AI Imagen: Image generated successfully via image field', {
        imageSize: imageField.length
      });
      return `data:image/png;base64,${imageField}`;
    } else {
      logger.error('Vertex AI Imagen: Unexpected response format', {
        availableFields: Object.keys(predictionStruct),
        structPreview: JSON.stringify(predictionStruct, null, 2).substring(0, 500)
      });
      throw new Error('Unable to extract image from Vertex AI response');
    }
  } catch (error: any) {
    logger.error('Vertex AI Imagen: Prediction error', {
      errorMessage: error.message
    }, error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

export interface VisualAssetData {
  headline: string;
  points: string[];
  visualPrompt: string;
}

export async function serverGetVisualAssetData(
  analysisText: string,
  title: string
): Promise<VisualAssetData> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });

  const visualAssetPrompt = await getActivePrompt('visualAssetData');
  const prompt = visualAssetPrompt
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{ANALYSIS_TEXT\}\}/g, analysisText);

  const result = await ai.models.generateContent({
    model: UTILITY_GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          points: { type: Type.ARRAY, items: { type: Type.STRING } },
          visualPrompt: { type: Type.STRING }
        },
        required: ["headline", "points", "visualPrompt"]
      }
    }
  });

  const cleanedText = cleanJson(result.text || "{}");
  
  let data;
  try {
    data = JSON.parse(cleanedText);
  } catch (error) {
    console.error('JSON Parse Error in serverGetVisualAssetData:', error);
    
    // Fallback data
    data = {
      headline: "הניתוח הפסיכולוגי שלך",
      points: ["ניתוח מפורט זמין בקרוב"],
      visualPrompt: "A friendly cartoon character in a bright, cheerful setting, 3D animated style"
    };
  }
  
  return {
    headline: data.headline || "הניתוח הפסיכולוגי שלך",
    points: data.points || [],
    visualPrompt: data.visualPrompt || "A friendly animal in a bright setting, 3D animated cartoon style"
  };
}
