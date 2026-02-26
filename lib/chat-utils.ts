import { ChatMessage } from '@/types';

export const getTruncatedMessages = (messages: ChatMessage[], limit = 20000): ChatMessage[] => {
  if (!messages || messages.length === 0) return [];
  
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
