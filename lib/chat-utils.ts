import { ChatMessage, DateDensity, ChunkingStrategy } from '@/types';

const normalizeComparableName = (value: string): string => {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const buildAliasRegex = (alias: string, flags = 'iu'): RegExp => {
  const spacedAlias = escapeRegExp(alias.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${spacedAlias})(?=$|[^\\p{L}\\p{N}])`, flags);
};

export const buildPersonReferenceAliases = (personName: string, participants: string[] = []): string[] => {
  const cleanName = (personName || '').replace(/\s+/g, ' ').trim();
  if (!cleanName) return [];

  const aliases = new Set<string>([cleanName]);
  const parts = cleanName.split(/\s+/).filter(Boolean);

  if (parts.length > 1 && parts[0].length >= 2) {
    const firstName = normalizeComparableName(parts[0]);
    const sameFirstNameCount = participants.filter((participant) => {
      const participantFirstName = normalizeComparableName(participant).split(' ')[0] || '';
      return participantFirstName === firstName;
    }).length;

    if (sameFirstNameCount === 1) {
      aliases.add(parts[0]);
    }
  }

  return Array.from(aliases).sort((a, b) => b.length - a.length);
};

export const messageMentionsPerson = (content: string, aliases: string[]): boolean => {
  if (!content || aliases.length === 0) return false;
  return aliases.some((alias) => buildAliasRegex(alias).test(content));
};

export const messageIsByPerson = (sender: string, aliases: string[]): boolean => {
  const normalizedSender = normalizeComparableName(sender);
  return aliases.some((alias) => normalizeComparableName(alias) === normalizedSender);
};

export const isMessageByOrAboutPerson = (message: ChatMessage, aliases: string[]): boolean => {
  return messageIsByPerson(message.sender, aliases) || messageMentionsPerson(message.content, aliases);
};

export const replacePersonAliasesInText = (content: string, aliases: string[], replacement: string): string => {
  let nextContent = content || '';
  for (const alias of aliases) {
    nextContent = nextContent.replace(buildAliasRegex(alias, 'giu'), (_, prefix: string) => `${prefix}${replacement}`);
  }
  return nextContent;
};

export const createMessageLookupKey = (message: ChatMessage): string => {
  const timestamp = new Date(message.date).getTime();
  return `${timestamp}::${message.rawLine}`;
};

export const createMessageLookup = (messages: ChatMessage[]): Map<string, ChatMessage[]> => {
  const lookup = new Map<string, ChatMessage[]>();

  messages.forEach((message) => {
    const key = createMessageLookupKey(message);
    const bucket = lookup.get(key) || [];
    bucket.push(message);
    lookup.set(key, bucket);
  });

  return lookup;
};

const PARTICIPANT_HAS_LETTER_REGEX = /\p{L}/u;
const PARTICIPANT_HAS_NUMBER_REGEX = /\p{N}/u;

export const isNumericParticipantLabel = (participant: string): boolean => {
  const normalizedParticipant = (participant || '').trim();

  if (!normalizedParticipant) {
    return false;
  }

  return !PARTICIPANT_HAS_LETTER_REGEX.test(normalizedParticipant) && PARTICIPANT_HAS_NUMBER_REGEX.test(normalizedParticipant);
};

export const getParticipantMessageCounts = (messages: ChatMessage[]): Record<string, number> => {
  return messages.reduce<Record<string, number>>((counts, message) => {
    if (!message?.sender) {
      return counts;
    }

    counts[message.sender] = (counts[message.sender] || 0) + 1;
    return counts;
  }, {});
};

export const sortParticipantsForGroupSelection = (
  participants: string[],
  messages: ChatMessage[]
): string[] => {
  const counts = getParticipantMessageCounts(messages);

  return [...participants].sort((a, b) => {
    const aIsNumeric = isNumericParticipantLabel(a);
    const bIsNumeric = isNumericParticipantLabel(b);

    if (aIsNumeric !== bIsNumeric) {
      return aIsNumeric ? 1 : -1;
    }

    const countDifference = (counts[b] || 0) - (counts[a] || 0);
    if (countDifference !== 0) {
      return countDifference;
    }

    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
};

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
  const maxHighlightWordsPerMessage = 15;

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
    // 3. Each message must stay short enough for the loading screen
    const anyDirty = slice.some(m => isDirty(m.content));
    if (anyDirty) continue;

    const hasLongMessage = slice.some(m => {
      const wordCount = (m.content || '').trim().split(/\s+/).filter(Boolean).length;
      return wordCount > maxHighlightWordsPerMessage;
    });
    if (hasLongMessage) continue;

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
 * Estimate token count using the same chars/4 approximation used elsewhere in the app.
 */
export const estimateTokens = (text: string): number => {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
};

/**
 * Get word count for a single message
 */
export const getMessageWordCount = (message: ChatMessage): number => {
  return countWords(message.content || '');
};

/**
 * Estimate tokens for a single message, including the anonymized sender prefix.
 */
export const getMessageTokenCount = (message: ChatMessage): number => {
  return estimateTokens(`${message.sender || ''}:${message.content || ''}`);
};

/**
 * Get total word count for an array of messages
 */
export const getTotalWordCount = (messages: ChatMessage[]): number => {
  if (!messages || messages.length === 0) return 0;
  return messages.reduce((sum, msg) => sum + getMessageWordCount(msg), 0);
};

/**
 * Get approximate total token count for an array of messages.
 */
export const getTotalTokenCount = (messages: ChatMessage[]): number => {
  if (!messages || messages.length === 0) return 0;
  return messages.reduce((sum, msg) => sum + getMessageTokenCount(msg), 0);
};

type CountUnit = 'words' | 'tokens';

interface ChunkBudget {
  unit: CountUnit;
  maxCount: number;
  buffer: number;
  getMessageCount: (message: ChatMessage) => number;
  getTotalCount: (messages: ChatMessage[]) => number;
}

const DEFAULT_CHUNK_BUFFER = 2000;

const createChunkBudget = (unit: CountUnit, maxCount: number): ChunkBudget => ({
  unit,
  maxCount,
  buffer: DEFAULT_CHUNK_BUFFER,
  getMessageCount: unit === 'tokens' ? getMessageTokenCount : getMessageWordCount,
  getTotalCount: unit === 'tokens' ? getTotalTokenCount : getTotalWordCount,
});

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
 * Handles Date objects, timestamp numbers, and ISO strings
 */
export const formatChatDate = (date: Date | string | number): string => {
  const dateObj = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dateObj.getTime())) {
    return '';
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateKey = (date: Date | string | number): string => {
  return formatChatDate(date);
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

const createGroupAnalysisChunksWithBudget = (
  messages: ChatMessage[],
  budget: ChunkBudget
): { chunks: ChatMessage[]; strategy: ChunkingStrategy; originalCount: number } => {
  const originalCount = budget.getTotalCount(messages);

  // If under limit, return everything
  if (originalCount <= budget.maxCount) {
    return {
      chunks: messages,
      strategy: 'full',
      originalCount
    };
  }

  console.log(`[Group Analysis Chunking] Original: ${originalCount} ${budget.unit}, Target: ${budget.maxCount} ${budget.unit}`);

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

  const chunks: ChatMessage[] = [];
  let currentCount = 0;

  for (const date of allDates) {
    if (!selectedDates.has(date)) continue;
    if (currentCount >= budget.maxCount - budget.buffer) break;

    const dateMessages = messagesByDate.get(date)!;
    const dateCount = budget.getTotalCount(dateMessages);

    // Only add if we have room
    if (currentCount + dateCount <= budget.maxCount - budget.buffer) {
      chunks.push(...dateMessages);
      currentCount += dateCount;
    } else {
      // Add partial messages from this date up to limit
      for (const msg of dateMessages) {
        const messageCount = budget.getMessageCount(msg);
        if (currentCount + messageCount <= budget.maxCount - budget.buffer) {
          chunks.push(msg);
          currentCount += messageCount;
        } else {
          break;
        }
      }
      break;
    }
  }

  const finalCount = budget.getTotalCount(chunks);
  console.log(`[Group Analysis Chunking] Final: ${finalCount} ${budget.unit}, Selected ${selectedDates.size} dates, Reduction: ${((originalCount - finalCount) / originalCount * 100).toFixed(1)}%`);

  return {
    chunks,
    strategy: 'sampled',
    originalCount
  };
};

const createIndividualAnalysisChunksWithBudget = (
  messages: ChatMessage[],
  targetUser: string,
  budget: ChunkBudget
): { chunks: ChatMessage[]; strategy: ChunkingStrategy; originalCount: number } => {
  const originalCount = budget.getTotalCount(messages);

  // If under limit, return everything
  if (originalCount <= budget.maxCount) {
    return {
      chunks: messages,
      strategy: 'full',
      originalCount
    };
  }

  console.log(`[Individual Analysis Chunking] Original: ${originalCount} ${budget.unit}, Target user: ${targetUser}`);

  // Find all target user messages and extract context windows
  const contextMessages = new Set<number>();

  messages.forEach((msg, idx) => {
    if (msg.sender === targetUser) {
      for (let i = Math.max(0, idx - 2); i < idx; i++) {
        contextMessages.add(i);
      }
      contextMessages.add(idx);
      for (let i = idx + 1; i <= Math.min(messages.length - 1, idx + 2); i++) {
        contextMessages.add(i);
      }
    }
  });

  // Extract context messages in chronological order
  const contextIndices = Array.from(contextMessages).sort((a, b) => a - b);
  const extractedMessages = contextIndices.map(i => messages[i]);
  const extractedCount = budget.getTotalCount(extractedMessages);

  console.log(`[Individual Analysis Chunking] After context extraction: ${extractedCount} ${budget.unit} (${contextIndices.length} messages)`);

  // If extracted context is still under limit, return it
  if (extractedCount <= budget.maxCount) {
    return {
      chunks: extractedMessages,
      strategy: 'sampled',
      originalCount
    };
  }

  // If still over limit, apply group chunking strategy to extracted messages
  console.log('[Individual Analysis Chunking] Still over limit, applying secondary chunking...');
  const secondaryResult = createGroupAnalysisChunksWithBudget(extractedMessages, budget);

  return {
    chunks: secondaryResult.chunks,
    strategy: 'sampled',
    originalCount
  };
};

/**
 * Create smart chunks for group analysis
 * For chats > 50k words: samples strategically across timeline focusing on high-density dates
 */
export const createGroupAnalysisChunks = (
  messages: ChatMessage[], 
  maxWords: number = 50000
): { chunks: ChatMessage[]; strategy: ChunkingStrategy; originalWordCount: number } => {
  const result = createGroupAnalysisChunksWithBudget(messages, createChunkBudget('words', maxWords));
  return {
    chunks: result.chunks,
    strategy: result.strategy,
    originalWordCount: result.originalCount
  };
};

export const createGroupAnalysisChunksByTokens = (
  messages: ChatMessage[],
  maxTokens: number = 200000
): { chunks: ChatMessage[]; strategy: ChunkingStrategy; originalTokenCount: number } => {
  const result = createGroupAnalysisChunksWithBudget(messages, createChunkBudget('tokens', maxTokens));
  return {
    chunks: result.chunks,
    strategy: result.strategy,
    originalTokenCount: result.originalCount
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
  const result = createIndividualAnalysisChunksWithBudget(messages, targetUser, createChunkBudget('words', maxWords));
  return {
    chunks: result.chunks,
    strategy: result.strategy,
    originalWordCount: result.originalCount
  };
};

export const createIndividualAnalysisChunksByTokens = (
  messages: ChatMessage[],
  targetUser: string,
  maxTokens: number = 200000
): { chunks: ChatMessage[]; strategy: ChunkingStrategy; originalTokenCount: number } => {
  const result = createIndividualAnalysisChunksWithBudget(messages, targetUser, createChunkBudget('tokens', maxTokens));
  return {
    chunks: result.chunks,
    strategy: result.strategy,
    originalTokenCount: result.originalCount
  };
};
