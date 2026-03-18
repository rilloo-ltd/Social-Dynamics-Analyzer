import { ChatMessage, DateDensity, ChunkingStrategy } from '@/types';

export const getTruncatedMessages = (messages: ChatMessage[], limit = Infinity): ChatMessage[] => {
  // No truncation - return all messages for full chat history analysis
  if (!messages || messages.length === 0) return [];
  
  // If limit is Infinity or larger than total content, return all messages
  if (limit === Infinity) {
    return messages;
  }
  
  // Legacy truncation logic (kept for compatibility but not used with Infinity limit)
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

  return messages.slice(startIndex);
};

export const getChatMetadata = async (messages: ChatMessage[]): Promise<{ highlights: string[], signatures: Record<string, string> }> => {
  if (!messages || messages.length === 0) return { highlights: [], signatures: {} };

  // Utility to check if a message is "dirty" (has links or is emoji-only)
  const isDirty = (content: string): boolean => {
    if (!content) return true;
    // Link check
    if (/https?:\/\/\S+|www\.\S+/i.test(content)) return true;
    // Emoji-only check: fails if it contains no alphanumeric characters (Hebrew or Latin)
    // and no digits.
    const hasAlphaNumeric = /[a-zA-Z0-9\u0590-\u05FF]/.test(content);
    if (!hasAlphaNumeric) return true;
    
    return false;
  };

  const highlights: string[] = [];
  const maxHighlights = 10;
  const maxAttempts = 100; // Safety cap
  let attempts = 0;
  const usedIndices = new Set<number>();

  while (highlights.length < maxHighlights && attempts < maxAttempts) {
    attempts++;
    // Pick a random starting point
    const startIndex = Math.floor(Math.random() * Math.max(1, messages.length - 4));
    
    // Avoid re-picking overlapping or identical windows
    if (usedIndices.has(startIndex)) continue;
    
    const len = Math.floor(Math.random() * 3) + 2; // Window of 2-4 messages
    const slice = messages.slice(startIndex, startIndex + len);
    
    // Validate the slice:
    // 1. None of the messages in the exchange should be dirty
    // 2. The exchange should involve at least 2 different speakers
    const anyDirty = slice.some(m => isDirty(m.content));
    if (anyDirty) continue;

    const speakers = new Set(slice.map(m => m.sender));
    if (speakers.size < 2) continue;

    // Success! Format and add
    const snippet = slice.map(m => `${m.sender}: ${m.content.replace(/\n/g, ' ')}`).join('\n');
    highlights.push(snippet);
    usedIndices.add(startIndex);
  }

  // Generate "signatures" (representative quotes) for participants
  const senderMap = new Map<string, string[]>();
  messages.forEach(m => {
    if (!senderMap.has(m.sender)) senderMap.set(m.sender, []);
    // Filter for good quotes: not dirty, 20-100 chars
    if (!isDirty(m.content) && m.content.length > 20 && m.content.length < 100) {
      senderMap.get(m.sender)!.push(m.content);
    }
  });

  const signatures: Record<string, string> = {};
  senderMap.forEach((msgs, sender) => {
    if (msgs.length > 0) {
      // Pick a random valid quote from their pool
      signatures[sender] = msgs[Math.floor(Math.random() * msgs.length)];
    }
  });

  return Promise.resolve({ highlights, signatures });
};

// ============================================================================
// Smart Chunking Utilities for Large Chat Analysis
// ============================================================================

/**
 * Count words in a text string (splits on whitespace)
 */
export const countWords = (text: string): number => {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
};

/**
 * Get word count for a single message
 */
export const getMessageWordCount = (message: ChatMessage): number => {
  return countWords(message.content || '');
};

/**
 * Get total word count for an array of messages
 */
export const getTotalWordCount = (messages: ChatMessage[]): number => {
  if (!messages || messages.length === 0) return 0;
  return messages.reduce((sum, msg) => sum + getMessageWordCount(msg), 0);
};

/**
 * Group messages by date (YYYY-MM-DD format)
 * Returns Map with chronological ordering
 */
export const groupMessagesByDate = (messages: ChatMessage[]): Map<string, ChatMessage[]> => {
  const groupedMap = new Map<string, ChatMessage[]>();
  
  for (const msg of messages) {
    const dateStr = formatDateKey(msg.date);
    if (!groupedMap.has(dateStr)) {
      groupedMap.set(dateStr, []);
    }
    groupedMap.get(dateStr)!.push(msg);
  }
  
  // Sort by date key to ensure chronological order
  const sortedMap = new Map(
    Array.from(groupedMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  );
  
  return sortedMap;
};

/**
 * Format date as YYYY-MM-DD
 */
const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Analyze message density per date
 * Returns sorted array (highest density first)
 */
export const analyzeDateDensity = (messagesByDate: Map<string, ChatMessage[]>): DateDensity[] => {
  const densities: DateDensity[] = [];
  
  for (const [date, messages] of messagesByDate.entries()) {
    const messageCount = messages.length;
    const wordCount = getTotalWordCount(messages);
    // Density score: prioritize both volume and substance
    const density = messageCount + (wordCount / 100);
    
    densities.push({
      date,
      messageCount,
      wordCount,
      density
    });
  }
  
  // Sort by density descending (highest first)
  return densities.sort((a, b) => b.density - a.density);
};

/**
 * Create smart chunks for group analysis
 * For chats > 50k words: samples strategically across timeline focusing on high-density dates
 */
export const createGroupAnalysisChunks = (
  messages: ChatMessage[], 
  maxWords: number = 50000
): { chunks: ChatMessage[]; strategy: ChunkingStrategy; originalWordCount: number } => {
  const originalWordCount = getTotalWordCount(messages);
  
  // If under limit, return everything
  if (originalWordCount <= maxWords) {
    return {
      chunks: messages,
      strategy: 'full',
      originalWordCount
    };
  }
  
  console.log(`[Group Analysis Chunking] Original: ${originalWordCount} words, Target: ${maxWords} words`);
  
  // Group by date and analyze density
  const messagesByDate = groupMessagesByDate(messages);
  const densityAnalysis = analyzeDateDensity(messagesByDate);
  const allDates = Array.from(messagesByDate.keys());
  
  // Divide timeline into 3 periods: beginning (25%), middle (50%), end (25%)
  const beginningEnd = Math.floor(allDates.length * 0.25);
  const middleEnd = Math.floor(allDates.length * 0.75);
  
  const beginningDates = allDates.slice(0, beginningEnd);
  const middleDates = allDates.slice(beginningEnd, middleEnd);
  const endDates = allDates.slice(middleEnd);
  
  // Find high-density dates in each period
  const getTopDatesFromPeriod = (periodDates: string[], count: number): string[] => {
    return densityAnalysis
      .filter(d => periodDates.includes(d.date))
      .slice(0, count)
      .map(d => d.date);
  };
  
  const selectedDates = new Set<string>([
    ...getTopDatesFromPeriod(beginningDates, Math.max(3, Math.ceil(beginningDates.length * 0.2))),
    ...getTopDatesFromPeriod(middleDates, Math.max(5, Math.ceil(middleDates.length * 0.15))),
    ...getTopDatesFromPeriod(endDates, Math.max(3, Math.ceil(endDates.length * 0.2)))
  ]);
  
  // Build chunks of ~2000 words from selected dates
  const targetBuffer = 2000; // Leave buffer below max
  const chunks: ChatMessage[] = [];
  let currentWordCount = 0;
  
  for (const date of allDates) {
    if (!selectedDates.has(date)) continue;
    if (currentWordCount >= maxWords - targetBuffer) break;
    
    const dateMessages = messagesByDate.get(date)!;
    const dateWordCount = getTotalWordCount(dateMessages);
    
    // Only add if we have room
    if (currentWordCount + dateWordCount <= maxWords - targetBuffer) {
      chunks.push(...dateMessages);
      currentWordCount += dateWordCount;
    } else {
      // Add partial messages from this date up to limit
      for (const msg of dateMessages) {
        const msgWords = getMessageWordCount(msg);
        if (currentWordCount + msgWords <= maxWords - targetBuffer) {
          chunks.push(msg);
          currentWordCount += msgWords;
        } else {
          break;
        }
      }
      break;
    }
  }
  
  const finalWordCount = getTotalWordCount(chunks);
  console.log(`[Group Analysis Chunking] Final: ${finalWordCount} words, Selected ${selectedDates.size} dates, Reduction: ${((originalWordCount - finalWordCount) / originalWordCount * 100).toFixed(1)}%`);
  
  return {
    chunks,
    strategy: 'sampled',
    originalWordCount
  };
};

/**
 * Create smart chunks for individual analysis
 * Extracts context windows around target user's messages (2 before + target + 2 after)
 */
export const createIndividualAnalysisChunks = (
  messages: ChatMessage[],
  targetUser: string,
  maxWords: number = 50000
): { chunks: ChatMessage[]; strategy: ChunkingStrategy; originalWordCount: number } => {
  const originalWordCount = getTotalWordCount(messages);
  
  // If under limit, return everything
  if (originalWordCount <= maxWords) {
    return {
      chunks: messages,
      strategy: 'full',
      originalWordCount
    };
  }
  
  console.log(`[Individual Analysis Chunking] Original: ${originalWordCount} words, Target user: ${targetUser}`);
  
  // Find all target user messages and extract context windows
  const contextMessages = new Set<number>(); // Use Set to deduplicate overlapping ranges
  
  messages.forEach((msg, idx) => {
    if (msg.sender === targetUser) {
      // Add 2 messages before
      for (let i = Math.max(0, idx - 2); i < idx; i++) {
        contextMessages.add(i);
      }
      // Add target message
      contextMessages.add(idx);
      // Add 2 messages after
      for (let i = idx + 1; i <= Math.min(messages.length - 1, idx + 2); i++) {
        contextMessages.add(i);
      }
    }
  });
  
  // Extract context messages in chronological order
  const contextIndices = Array.from(contextMessages).sort((a, b) => a - b);
  const extractedMessages = contextIndices.map(i => messages[i]);
  const extractedWordCount = getTotalWordCount(extractedMessages);
  
  console.log(`[Individual Analysis Chunking] After context extraction: ${extractedWordCount} words (${contextIndices.length} messages)`);
  
  // If extracted context is still under limit, return it
  if (extractedWordCount <= maxWords) {
    return {
      chunks: extractedMessages,
      strategy: 'sampled',
      originalWordCount
    };
  }
  
  // If still over limit, apply group chunking strategy to extracted messages
  console.log(`[Individual Analysis Chunking] Still over limit, applying secondary chunking...`);
  const secondaryResult = createGroupAnalysisChunks(extractedMessages, maxWords);
  
  return {
    chunks: secondaryResult.chunks,
    strategy: 'sampled',
    originalWordCount
  };
};
